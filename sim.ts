import { draw } from "@/game/draw";
import { anyCheat, DEFAULT_CHEATS } from "@/game/cheats";
import {
  playBoom,
  playClear,
  playDash,
  playBomb,
  playHit,
  playHurt,
  playPickup,
  playShot,
  playWave,
  setMuted,
} from "@/game/audio";
import type { Bullet, Cheats, Enemy, EnemyKind, Flash, Game, Hud, Particle, Pickup, PickupKind, Player, Popup } from "@/game/types";

const STEP = 1 / 60;
const S1 = [0];
const S3 = [-0.22, 0, 0.22];
const S5 = [-0.38, -0.18, 0, 0.18, 0.38];
const hostileBuf: Bullet[] = [];

export type GameApi = {
  destroy: () => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  menu: () => void;
  setMuted: (value: boolean) => void;
  setStick: (active: boolean, x: number, y: number) => void;
  setCheats: (value: Cheats) => void;
  refillLives: () => void;
  clearField: () => void;
  dash: () => void;
  bomb: () => void;
};

type MountOpts = {
  onHud: (hud: Hud) => void;
  getPointerDrive: () => boolean;
  onMuteToggle: () => void;
};

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      getX: () => number;
      getY: () => number;
      getPhase: () => Game["phase"];
      getFriendlyBullets: () => number;
      getEnemies: () => number;
      setKeys?: (codes: string[]) => void;
    };
  }
}

function pool<T>(n: number, make: () => T): T[] {
  const list: T[] = [];
  for (let i = 0; i < n; i++) list.push(make());
  return list;
}

function alloc<T extends { alive: boolean }>(list: T[]): T | null {
  for (let i = 0; i < list.length; i++) if (!list[i].alive) return list[i];
  return null;
}

function makePlayer(): Player {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    aim: -Math.PI / 2,
    r: 14,
    fireCd: 0,
    lives: 3,
    iframes: 0,
    shield: 0,
    speedT: 0,
    multiT: 0,
    multiLevel: 0,
    kick: 0,
    puff: 0,
    dashT: 0,
    dashCd: 0,
    dashX: 0,
    dashY: -1,
    bombs: 1,
    trail: Array.from({ length: 10 }, () => ({ x: 0, y: 0 })),
    trailI: 0,
  };
}

function makeStars() {
  const stars: Game["stars"] = [];
  const counts = [70, 42, 24];
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < counts[layer]; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        layer: layer as 0 | 1 | 2,
        r: layer === 2 ? 1.3 + Math.random() * 1.1 : 0.55 + Math.random() * 0.7,
        tw: 0.5 + Math.random() * 2.4,
        ph: Math.random() * Math.PI * 2,
      });
    }
  }
  return stars;
}

function createGame(): Game {
  return {
    phase: "menu",
    w: 0,
    h: 0,
    dpr: 1,
    visualTime: 0,
    time: 0,
    needsCenter: false,
    player: makePlayer(),
    score: 0,
    combo: 0,
    comboT: 0,
    bestCombo: 0,
    wave: 0,
    waveState: "announce",
    announceT: 0,
    lastBonus: 0,
    queue: [],
    qIndex: 0,
    spawnT: 0,
    shake: 0,
    hitStop: 0,
    reduceMotion: false,
    pointerDrive: false,
    bullets: pool(340, (): Bullet => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, r: 3.2, friendly: true, life: 0, dmg: 1, grazed: false })),
    enemies: pool(36, (): Enemy => ({
      alive: false,
      kind: "drone",
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      hp: 1,
      maxHp: 1,
      r: 13,
      flash: 0,
      fireCd: 0,
      touchCd: 0,
      phase: 0,
    })),
    pickups: pool(5, (): Pickup => ({ alive: false, kind: "shield", x: 0, y: 0, life: 0, bob: 0 })),
    particles: pool(220, (): Particle => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 2, hue: "fg" })),
    flashes: pool(24, (): Flash => ({ alive: false, x: 0, y: 0, a: 0, life: 0, max: 0.07 })),
    popups: pool(16, (): Popup => ({ alive: false, x: 0, y: 0, vy: -28, life: 0, max: 0.7, text: "" })),
    stars: makeStars(),
    starOff: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
    keys: new Set(),
    injected: new Set(),
    pointer: { x: 0, y: 0, down: false, seen: false, type: "" },
    stick: { active: false, x: 0, y: 0 },
    pad: { x: 0, y: 0, fire: false, aiming: false, aim: 0, dash: false, bomb: false },
    cheats: { ...DEFAULT_CHEATS },
    cheated: false,
    sfxGate: 0,
    shock: 0,
    shockX: 0,
    shockY: 0,
    shockR: 0,
    reqDash: false,
    reqBomb: false,
    latchDash: false,
    latchBomb: false,
    over: null,
  };
}

function pressed(g: Game, code: string) {
  return g.keys.has(code) || g.injected.has(code);
}

function burst(g: Game, x: number, y: number, hue: Particle["hue"], n: number, speed: number) {
  const count = g.reduceMotion ? Math.max(2, Math.ceil(n / 3)) : n;
  for (let i = 0; i < count; i++) {
    const p = alloc(g.particles);
    if (!p) return;
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.35 + Math.random() * 0.75);
    p.alive = true;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s;
    p.max = 0.28 + Math.random() * 0.32;
    p.life = p.max;
    p.r = 1.3 + Math.random() * 1.8;
    p.hue = hue;
  }
}

function popup(g: Game, x: number, y: number, text: string) {
  const p = alloc(g.popups);
  if (!p) return;
  p.alive = true;
  p.x = x;
  p.y = y;
  p.vy = -36;
  p.max = 0.7;
  p.life = 0.7;
  p.text = text;
}

function dropPickup(g: Game, x: number, y: number, kind?: PickupKind) {
  const slot = alloc(g.pickups);
  if (!slot) return;
  const kinds: PickupKind[] = ["shield", "speed", "multi"];
  slot.alive = true;
  slot.kind = kind ?? kinds[(Math.random() * kinds.length) | 0];
  slot.x = Math.min(g.w - 28, Math.max(28, x));
  slot.y = Math.min(g.h - 28, Math.max(28, y));
  slot.life = 12;
  slot.bob = Math.random() * Math.PI * 2;
}

function baseScore(kind: EnemyKind) {
  if (kind === "cruiser") return 250;
  if (kind === "gunner") return 180;
  if (kind === "boss") return 1600;
  return 100;
}

function killEnemy(g: Game, e: Enemy) {
  e.alive = false;
  if (g.comboT > 0) g.combo += 1;
  else g.combo = 1;
  g.comboT = 1.25;
  if (g.combo > g.bestCombo) g.bestCombo = g.combo;
  const points = baseScore(e.kind) * g.combo;
  g.score += points;
  popup(g, e.x, e.y - 10, `+${points}`);
  const boss = e.kind === "boss";
  const quiet = g.shock > 0;
  burst(g, e.x, e.y, "danger", quiet || g.cheats.ring ? 4 : boss ? 28 : e.kind === "cruiser" ? 22 : 12, boss ? 260 : 160);
  if (boss) {
    g.shake = Math.max(g.shake, 14);
    if (!g.reduceMotion) g.hitStop = Math.max(g.hitStop, 0.08);
    gainBomb(g);
    dropPickup(g, e.x, e.y + 24, "multi");
    if (!quiet) gatedBoom(g);
  } else if (!quiet && e.kind === "cruiser") {
    g.shake = Math.max(g.shake, 8);
    if (!g.reduceMotion) g.hitStop = Math.max(g.hitStop, 0.045);
    gatedBoom(g);
  } else if (!quiet) {
    g.shake = Math.max(g.shake, g.cheats.ring ? 1.2 : 2.4);
    gatedBoom(g);
  }
  if (!boss && Math.random() < 0.2) dropPickup(g, e.x, e.y);
}

function damageEnemy(g: Game, e: Enemy, dmg: number) {
  e.hp -= dmg;
  e.flash = 0.08;
  if (e.hp <= 0) killEnemy(g, e);
  else {
    if (!g.cheats.ring || g.sfxGate <= 0) {
      if (g.cheats.ring) g.sfxGate = 0.05;
      playHit();
    }
    burst(g, e.x, e.y, "fg", g.cheats.ring ? 2 : 4, 90);
  }
}

function gatedBoom(g: Game) {
  if (g.cheats.ring) {
    if (g.sfxGate > 0) return;
    g.sfxGate = 0.06;
  }
  playBoom();
}

function applyLocks(g: Game) {
  const p = g.player;
  if (g.cheats.shield) p.shield = Math.max(p.shield, 8);
  if (g.cheats.turbo) p.speedT = Math.max(p.speedT, 8);
  if (g.cheats.spread) {
    p.multiT = Math.max(p.multiT, 8);
    p.multiLevel = 2;
  }
}

function gainBomb(g: Game) {
  g.player.bombs = Math.min(3, g.player.bombs + 1);
}

function tryDash(g: Game, mx: number, my: number) {
  const p = g.player;
  if (g.phase !== "playing" || p.dashCd > 0 || p.dashT > 0) return;
  let dx = mx;
  let dy = my;
  let mag = Math.hypot(dx, dy);
  if (mag < 0.2) {
    dx = Math.cos(p.aim);
    dy = Math.sin(p.aim);
    mag = 1;
  }
  p.dashX = dx / mag;
  p.dashY = dy / mag;
  p.dashT = 0.16;
  p.dashCd = 1.2;
  p.iframes = Math.max(p.iframes, 0.24);
  p.kick = 1;
  playDash();
  burst(g, p.x, p.y, "primary", 8, 220);
}

function tryBomb(g: Game) {
  const p = g.player;
  if (g.phase !== "playing" || p.bombs <= 0 || g.shock > 0) return;
  p.bombs -= 1;
  const radius = Math.min(g.w, g.h) * 0.48;
  g.shock = 0.42;
  g.shockX = p.x;
  g.shockY = p.y;
  g.shockR = radius;
  const r2 = radius * radius;
  const dmg = g.cheats.oneShot ? 99 : 8;
  for (const e of g.enemies) {
    if (!e.alive) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    if (dx * dx + dy * dy > r2) continue;
    damageEnemy(g, e, e.kind === "boss" && !g.cheats.oneShot ? 16 : dmg);
    if (g.phase !== "playing") return;
  }
  for (const b of g.bullets) {
    if (!b.alive || b.friendly) continue;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    if (dx * dx + dy * dy <= r2) b.alive = false;
  }
  g.shake = Math.max(g.shake, 12);
  if (!g.reduceMotion) g.hitStop = Math.max(g.hitStop, 0.05);
  playBomb();
  burst(g, p.x, p.y, "fg", 18, 280);
}

function spawnMinion(g: Game, x: number, y: number) {
  const e = alloc(g.enemies);
  if (!e) return;
  const hp = 1 + Math.floor(g.wave / 4);
  e.alive = true;
  e.kind = "drone";
  e.x = Math.min(g.w - 20, Math.max(20, x));
  e.y = Math.min(g.h - 20, Math.max(20, y));
  e.vx = 0;
  e.vy = 0;
  e.hp = hp;
  e.maxHp = hp;
  e.r = 13;
  e.flash = 0;
  e.fireCd = 0.8;
  e.touchCd = 0.35;
  e.phase = Math.random() * Math.PI * 2;
}

function stepBoss(g: Game, e: Enemy, dt: number) {
  const tx = g.w * 0.5 + Math.sin(g.time * 0.6) * Math.min(240, g.w * 0.3);
  const ty = Math.max(70, Math.min(128, g.h * 0.16)) + Math.sin(g.time * 1.15) * 14;
  e.vx = (tx - e.x) * 1.8;
  e.vy = (ty - e.y) * 1.8;
  e.fireCd -= dt;
  if (e.fireCd > 0) return;
  const pat = Math.floor(e.phase) % 3;
  e.phase += 1;
  const p = g.player;
  if (pat === 0) {
    e.fireCd = 1.4;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + g.time * 0.4;
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      if (!spawnBullet(g, e.x + cx * (e.r + 6), e.y + cy * (e.r + 6), cx * 210, cy * 210, false, 4.2, 2.8, 1)) break;
    }
  } else if (pat === 1) {
    e.fireCd = 0.7;
    const a0 = Math.atan2(p.y - e.y, p.x - e.x);
    const offs = [-0.3, -0.15, 0, 0.15, 0.3];
    for (let i = 0; i < offs.length; i++) {
      const a = a0 + offs[i];
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      spawnBullet(g, e.x + cx * (e.r + 4), e.y + cy * (e.r + 4), cx * 340, cy * 340, false, 4.4, 2.2, 1);
    }
  } else {
    e.fireCd = 1.65;
    let drones = 0;
    for (const o of g.enemies) if (o.alive && o.kind === "drone") drones++;
    if (drones < 7) {
      spawnMinion(g, e.x - 46, e.y + 40);
      spawnMinion(g, e.x + 46, e.y + 40);
    }
  }
}

function hurtPlayer(g: Game) {
  const p = g.player;
  if (p.iframes > 0 || p.shield > 0 || g.cheats.god || g.phase !== "playing") return;
  p.lives -= 1;
  p.iframes = 1.55;
  p.kick = 1;
  g.combo = 0;
  g.comboT = 0;
  g.shake = Math.max(g.shake, 11);
  if (!g.reduceMotion) g.hitStop = Math.max(g.hitStop, 0.07);
  playHurt();
  burst(g, p.x, p.y, "primary", 14, 180);
  if (p.lives <= 0) {
    g.phase = "over";
    g.over = { score: g.score, wave: g.wave, combo: g.bestCombo, cheated: g.cheated };
    g.pointer.down = false;
  }
}

function applyPickup(g: Game, kind: PickupKind) {
  const p = g.player;
  if (kind === "shield") p.shield = Math.min(12, p.shield + 8);
  else if (kind === "speed") p.speedT = Math.min(12, p.speedT + 7);
  else {
    p.multiLevel = p.multiT > 0 ? Math.min(2, p.multiLevel + 1) : 1;
    p.multiT = 10;
  }
  playPickup();
  burst(g, p.x, p.y, "primary", 10, 120);
}

function buildQueue(wave: number): EnemyKind[] {
  const q: EnemyKind[] = [];
  const drones = Math.min(18, 4 + wave * 2);
  const cruisers = wave < 2 ? 0 : Math.min(6, 1 + Math.floor((wave - 2) * 0.7));
  const gunners = wave < 3 ? 0 : Math.min(6, 1 + Math.floor((wave - 3) * 0.55));
  for (let i = 0; i < drones; i++) q.push("drone");
  for (let i = 0; i < cruisers; i++) q.push("cruiser");
  for (let i = 0; i < gunners; i++) q.push("gunner");
  for (let i = q.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = q[i];
    q[i] = q[j];
    q[j] = tmp;
  }
  return q;
}

function beginWave(g: Game, n: number) {
  g.wave = n;
  g.waveState = "announce";
  g.announceT = n % 5 === 0 ? 2 : 1.6;
  g.queue = n % 5 === 0 ? ["boss"] : buildQueue(n);
  g.qIndex = 0;
  g.spawnT = 0.35;
  playWave();
}

function clearActors(g: Game) {
  for (const b of g.bullets) b.alive = false;
  for (const e of g.enemies) e.alive = false;
  for (const p of g.pickups) p.alive = false;
  for (const p of g.particles) p.alive = false;
  for (const f of g.flashes) f.alive = false;
  for (const p of g.popups) p.alive = false;
}

function centerPlayer(g: Game) {
  g.player.x = g.w / 2;
  g.player.y = g.h / 2;
  g.player.vx = 0;
  g.player.vy = 0;
  for (const t of g.player.trail) {
    t.x = g.player.x;
    t.y = g.player.y;
  }
  g.needsCenter = g.w < 20;
}

function resetRun(g: Game) {
  clearActors(g);
  g.score = 0;
  g.combo = 0;
  g.comboT = 0;
  g.bestCombo = 0;
  g.wave = 0;
  g.shake = 0;
  g.hitStop = 0;
  g.over = null;
  g.lastBonus = 0;
  g.time = 0;
  g.sfxGate = 0;
  g.shock = 0;
  g.reqDash = false;
  g.reqBomb = false;
  g.latchDash = false;
  g.latchBomb = false;
  g.cheated = anyCheat(g.cheats);
  const p = g.player;
  p.vx = 0;
  p.vy = 0;
  p.aim = -Math.PI / 2;
  p.fireCd = 0;
  p.lives = 3;
  p.iframes = 1.15;
  p.shield = 0;
  p.speedT = 0;
  p.multiT = 0;
  p.multiLevel = 0;
  p.kick = 0;
  p.r = 14;
  p.dashT = 0;
  p.dashCd = 0.4;
  p.dashX = 0;
  p.dashY = -1;
  p.bombs = 1;
  centerPlayer(g);
  applyLocks(g);
}

function spawnEnemy(g: Game, kind: EnemyKind) {
  const e = alloc(g.enemies);
  if (!e) return false;
  if (kind === "boss") {
    const hp = 46 + g.wave * 6;
    e.alive = true;
    e.kind = "boss";
    e.x = g.w * 0.5;
    e.y = Math.max(72, Math.min(120, g.h * 0.16));
    e.vx = 0;
    e.vy = 0;
    e.hp = hp;
    e.maxHp = hp;
    e.r = 38;
    e.flash = 0;
    e.fireCd = 0.85;
    e.touchCd = 0;
    e.phase = 0;
    return true;
  }
  const pad = 30;
  const side = (Math.random() * 4) | 0;
  let x = pad;
  let y = pad;
  if (side === 0) {
    x = pad + Math.random() * Math.max(1, g.w - pad * 2);
    y = pad;
  } else if (side === 1) {
    x = g.w - pad;
    y = pad + Math.random() * Math.max(1, g.h - pad * 2);
  } else if (side === 2) {
    x = pad + Math.random() * Math.max(1, g.w - pad * 2);
    y = g.h - pad;
  } else {
    x = pad;
    y = pad + Math.random() * Math.max(1, g.h - pad * 2);
  }
  const dx = x - g.player.x;
  const dy = y - g.player.y;
  if (dx * dx + dy * dy < 170 * 170) {
    x = g.w - x;
    y = g.h - y;
  }
  const wave = g.wave;
  const hp =
    kind === "drone"
      ? 1 + Math.floor(wave / 4)
      : kind === "gunner"
        ? 2 + Math.floor(wave / 5)
        : 4 + Math.floor(wave * 0.55);
  e.alive = true;
  e.kind = kind;
  e.x = x;
  e.y = y;
  e.vx = 0;
  e.vy = 0;
  e.hp = hp;
  e.maxHp = hp;
  e.r = kind === "cruiser" ? 24 : kind === "gunner" ? 16 : 13;
  e.flash = 0;
  e.fireCd = 0.6 + Math.random() * 0.6;
  e.touchCd = 0;
  e.phase = Math.random() * Math.PI * 2;
  return true;
}

function anyAlive(g: Game) {
  for (const e of g.enemies) if (e.alive) return true;
  return false;
}

function nearestEnemy(g: Game, maxDist: number): Enemy | null {
  let best: Enemy | null = null;
  let bestD = maxDist * maxDist;
  const p = g.player;
  for (const e of g.enemies) {
    if (!e.alive) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function readPad(g: Game) {
  g.pad.x = 0;
  g.pad.y = 0;
  g.pad.fire = false;
  g.pad.aiming = false;
  g.pad.dash = false;
  g.pad.bomb = false;
  if (typeof navigator === "undefined" || !navigator.getGamepads) return;
  const pads = navigator.getGamepads();
  let pad: Gamepad | null = null;
  for (let i = 0; i < pads.length; i++) {
    if (pads[i]) {
      pad = pads[i];
      break;
    }
  }
  if (!pad) return;
  let lx = pad.axes[0] || 0;
  let ly = pad.axes[1] || 0;
  const mag = Math.hypot(lx, ly);
  if (mag > 0.18) {
    const scaled = Math.min(1, (mag - 0.18) / 0.82);
    g.pad.x = (lx / mag) * scaled;
    g.pad.y = (ly / mag) * scaled;
  }
  if (pad.mapping === "standard") {
    const rx = pad.axes[2] || 0;
    const ry = pad.axes[3] || 0;
    const rm = Math.hypot(rx, ry);
    if (rm > 0.28) {
      g.pad.aiming = true;
      g.pad.aim = Math.atan2(ry, rx);
      g.pad.fire = true;
    }
    if (pad.buttons[0]?.pressed || (pad.buttons[7]?.value ?? 0) > 0.45) g.pad.fire = true;
  } else if (pad.buttons[0]?.pressed) {
    g.pad.fire = true;
  }
  if (pad.buttons[4]?.pressed) g.pad.dash = true;
  if (pad.buttons[2]?.pressed) g.pad.bomb = true;
}

function spawnBullet(g: Game, x: number, y: number, vx: number, vy: number, friendly: boolean, r: number, life: number, dmg: number) {
  const b = alloc(g.bullets);
  if (!b) return false;
  b.alive = true;
  b.x = x;
  b.y = y;
  b.vx = vx;
  b.vy = vy;
  b.friendly = friendly;
  b.r = r;
  b.life = life;
  b.dmg = dmg;
  b.grazed = false;
  return true;
}

function spawnFlash(g: Game, x: number, y: number, a: number) {
  const f = alloc(g.flashes);
  if (!f) return;
  f.alive = true;
  f.x = x;
  f.y = y;
  f.a = a;
  f.max = 0.07;
  f.life = 0.07;
}

function shoot(g: Game) {
  const p = g.player;
  const c = g.cheats;
  const dmg = c.oneShot ? 99 : 1;
  if (c.ring) {
    const n = 100;
    const speed = 980;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      if (!spawnBullet(g, p.x + cx * 18, p.y + cy * 18, cx * speed + p.vx * 0.15, cy * speed + p.vy * 0.15, true, 2.4, 0.72, dmg)) break;
      if (i % 12 === 0) spawnFlash(g, p.x + cx * 20, p.y + cy * 20, a);
    }
    p.fireCd = c.rapid ? 0.32 : 0.5;
    if (g.combo >= 8 && !c.rapid) p.fireCd *= 0.7;
    p.kick = 1;
    g.shake = Math.max(g.shake, 2.2);
    playShot(true);
    return;
  }
  const level = c.spread ? 2 : p.multiT > 0 ? p.multiLevel : 0;
  const spreads = level >= 2 ? S5 : level === 1 ? S3 : S1;
  const speed = 700;
  for (let i = 0; i < spreads.length; i++) {
    const a = p.aim + spreads[i];
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    spawnBullet(g, p.x + cx * 18, p.y + cy * 18, cx * speed + p.vx * 0.3, cy * speed + p.vy * 0.3, true, 3.2, 0.85, dmg);
    spawnFlash(g, p.x + cx * 20, p.y + cy * 20, a);
  }
  p.fireCd = c.rapid ? (level === 0 ? 0.045 : 0.06) : level === 0 ? 0.14 : 0.17;
  if (g.combo >= 8 && !c.rapid) p.fireCd *= 0.7;
  p.kick = 1;
  g.shake = Math.max(g.shake, level === 0 ? 0.6 : 1.3);
  playShot(level > 0 || c.rapid);
}

function cancelCrossfire(g: Game) {
  hostileBuf.length = 0;
  for (const b of g.bullets) if (b.alive && !b.friendly) hostileBuf.push(b);
  if (hostileBuf.length === 0) return;
  for (const a of g.bullets) {
    if (!a.alive || !a.friendly) continue;
    for (let i = 0; i < hostileBuf.length; i++) {
      const b = hostileBuf[i];
      if (!b.alive) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const rr = a.r + b.r + 2;
      if (dx * dx + dy * dy < rr * rr) {
        a.alive = false;
        b.alive = false;
        burst(g, a.x, a.y, "fg", 4, 70);
        break;
      }
    }
  }
}

function step(g: Game, dt: number) {
  g.shake = Math.max(0, g.shake - dt * 30);
  if (g.phase !== "playing") return;
  if (g.w < 20 || g.h < 20) return;
  if (g.hitStop > 0) {
    g.hitStop -= dt;
    return;
  }

  g.time += dt;
  const p = g.player;
  if (g.comboT > 0) {
    g.comboT -= dt;
    if (g.comboT <= 0) {
      g.comboT = 0;
      g.combo = 0;
    }
  }
  if (g.sfxGate > 0) g.sfxGate = Math.max(0, g.sfxGate - dt);
  if (g.cheats.shield) p.shield = Math.max(p.shield, 8);
  else if (p.shield > 0) p.shield = Math.max(0, p.shield - dt);
  if (g.cheats.turbo) p.speedT = Math.max(p.speedT, 8);
  else if (p.speedT > 0) p.speedT = Math.max(0, p.speedT - dt);
  if (g.cheats.spread) {
    p.multiT = Math.max(p.multiT, 8);
    p.multiLevel = 2;
  } else if (p.multiT > 0) {
    p.multiT = Math.max(0, p.multiT - dt);
    if (p.multiT <= 0) p.multiLevel = 0;
  }
  if (p.iframes > 0) p.iframes = Math.max(0, p.iframes - dt);
  if (p.fireCd > 0) p.fireCd = Math.max(0, p.fireCd - dt);
  if (p.kick > 0) p.kick = Math.max(0, p.kick - dt * 8);
  if (p.dashCd > 0) p.dashCd = Math.max(0, p.dashCd - dt);
  if (g.shock > 0) g.shock = Math.max(0, g.shock - dt);

  readPad(g);

  let mx = 0;
  let my = 0;
  if (pressed(g, "KeyW") || pressed(g, "ArrowUp")) my -= 1;
  if (pressed(g, "KeyS") || pressed(g, "ArrowDown")) my += 1;
  if (pressed(g, "KeyA") || pressed(g, "ArrowLeft")) mx -= 1;
  if (pressed(g, "KeyD") || pressed(g, "ArrowRight")) mx += 1;
  if (g.stick.active) {
    mx += g.stick.x;
    my += g.stick.y;
  }
  mx += g.pad.x;
  my += g.pad.y;
  let mag = Math.hypot(mx, my);
  if (mag > 1) {
    mx /= mag;
    my /= mag;
    mag = 1;
  }

  const touchLike = g.pointer.type === "touch" || g.pointer.type === "pen";
  const seekTouch = g.pointer.down && touchLike && !g.stick.active;
  const seekMouse = g.pointerDrive && g.pointer.seen && !touchLike;
  const seeking = mag <= 0.08 && (seekTouch || seekMouse);

  const max = p.speedT > 0 ? 470 : 300;
  let desiredVx = 0;
  let desiredVy = 0;
  if (mag > 0.08) {
    desiredVx = mx * max;
    desiredVy = my * max;
  } else if (seeking) {
    const tx = g.pointer.x;
    const ty = g.pointer.y - (touchLike ? 64 : 0);
    const dx = tx - p.x;
    const dy = ty - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 16) {
      let sp = max;
      if (dist < 120) sp = max * (dist / 120);
      desiredVx = (dx / dist) * sp;
      desiredVy = (dy / dist) * sp;
    }
  }
  const wantDash = g.reqDash || pressed(g, "ShiftLeft") || pressed(g, "ShiftRight") || g.pad.dash;
  if (wantDash && !g.latchDash) tryDash(g, mx, my);
  g.latchDash = wantDash;
  g.reqDash = false;
  const wantBomb = g.reqBomb || pressed(g, "KeyF") || g.pad.bomb;
  if (wantBomb && !g.latchBomb) tryBomb(g);
  g.latchBomb = wantBomb;
  g.reqBomb = false;
  if (p.dashT > 0) {
    p.dashT = Math.max(0, p.dashT - dt);
    p.vx = p.dashX * 980;
    p.vy = p.dashY * 980;
  } else {
    const k = 1 - Math.exp(-9 * dt);
    p.vx += (desiredVx - p.vx) * k;
    p.vy += (desiredVy - p.vy) * k;
    const sp = Math.hypot(p.vx, p.vy);
    const cap = max * 1.65;
    if (sp > cap) {
      p.vx = (p.vx / sp) * cap;
      p.vy = (p.vy / sp) * cap;
    }
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const margin = 22;
  if (p.x < margin) {
    p.x = margin;
    if (p.vx < 0) p.vx = 0;
  } else if (p.x > g.w - margin) {
    p.x = g.w - margin;
    if (p.vx > 0) p.vx = 0;
  }
  if (p.y < margin) {
    p.y = margin;
    if (p.vy < 0) p.vy = 0;
  } else if (p.y > g.h - margin) {
    p.y = g.h - margin;
    if (p.vy > 0) p.vy = 0;
  }

  const slot = p.trail[p.trailI % p.trail.length];
  slot.x = p.x;
  slot.y = p.y;
  p.trailI++;

  const parallax = [0.12, 0.28, 0.55];
  for (let i = 0; i < 3; i++) {
    g.starOff[i].x -= p.vx * parallax[i] * dt;
    g.starOff[i].y -= p.vy * parallax[i] * dt;
  }

  let desiredAim = p.aim;
  if (g.pad.aiming) desiredAim = g.pad.aim;
  else if (g.pointer.seen && !touchLike && !g.stick.active) {
    desiredAim = Math.atan2(g.pointer.y - p.y, g.pointer.x - p.x);
  } else {
    const target = nearestEnemy(g, 560);
    if (target) desiredAim = Math.atan2(target.y - p.y, target.x - p.x);
    else if (Math.hypot(p.vx, p.vy) > 24) desiredAim = Math.atan2(p.vy, p.vx);
  }
  const turn = Math.atan2(Math.sin(desiredAim - p.aim), Math.cos(desiredAim - p.aim));
  const maxTurn = 16 * dt;
  if (Math.abs(turn) < maxTurn) p.aim = desiredAim;
  else p.aim += Math.sign(turn) * maxTurn;

  const wantFire =
    pressed(g, "Space") ||
    g.pad.fire ||
    g.stick.active ||
    (g.pointer.down && (touchLike || g.pointer.type === "mouse")) ||
    (g.pointerDrive && g.pointer.seen && !touchLike);
  if (wantFire && p.fireCd <= 0) shoot(g);

  if (g.waveState === "announce") {
    g.announceT -= dt;
    if (g.announceT <= 0) g.waveState = "spawn";
  } else if (g.waveState === "spawn") {
    if (g.qIndex < g.queue.length) {
      g.spawnT -= dt;
      if (g.spawnT <= 0) {
        if (spawnEnemy(g, g.queue[g.qIndex])) {
          g.qIndex++;
          g.spawnT = Math.max(0.26, 0.62 - g.wave * 0.035);
        } else g.spawnT = 0.15;
      }
    } else if (!anyAlive(g)) {
      g.waveState = "clear";
      g.announceT = 1.45;
      g.lastBonus = 300 * g.wave;
      g.score += g.lastBonus;
      playClear();
      dropPickup(g, g.w * (0.32 + Math.random() * 0.36), g.h * (0.32 + Math.random() * 0.36));
      if (g.wave % 3 === 0) gainBomb(g);
    }
  } else {
    g.announceT -= dt;
    if (g.announceT <= 0) beginWave(g, g.wave + 1);
  }

  for (const e of g.enemies) {
    if (!e.alive) continue;
    e.flash = Math.max(0, e.flash - dt);
    e.touchCd = Math.max(0, e.touchCd - dt);
    if (e.kind === "boss") {
      stepBoss(g, e, dt);
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const m = e.r + 8;
      if (e.x < m) e.x = m;
      if (e.y < m) e.y = m;
      if (e.x > g.w - m) e.x = g.w - m;
      if (e.y > g.h - m) e.y = g.h - m;
      continue;
    }
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const speed =
      e.kind === "drone"
        ? Math.min(250, 105 + g.wave * 8)
        : e.kind === "gunner"
          ? Math.min(150, 68 + g.wave * 3)
          : Math.min(130, 54 + g.wave * 3);
    if (e.kind === "gunner") {
      let fx = nx;
      let fy = ny;
      if (dist < 160) {
        fx = -nx;
        fy = -ny;
      } else if (dist < 280) {
        const s = Math.sin(g.time * 1.3 + e.phase) >= 0 ? 1 : -1;
        fx = -ny * s;
        fy = nx * s;
      }
      e.vx = fx * speed;
      e.vy = fy * speed;
      e.fireCd -= dt;
      if (e.fireCd <= 0) {
        e.fireCd = Math.max(0.5, 1.35 - g.wave * 0.045);
        const a = Math.atan2(dy, dx);
        const bs = 250;
        spawnBullet(g, e.x + Math.cos(a) * (e.r + 4), e.y + Math.sin(a) * (e.r + 4), Math.cos(a) * bs, Math.sin(a) * bs, false, 5, 2.4, 1);
      }
    } else {
      const weave = e.kind === "drone" ? 0.35 : 0.12;
      const ox = -ny * Math.sin(g.time * 2.4 + e.phase) * weave;
      const oy = nx * Math.sin(g.time * 2.4 + e.phase) * weave;
      e.vx = (nx + ox) * speed;
      e.vy = (ny + oy) * speed;
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  }

  for (let i = 0; i < g.enemies.length; i++) {
    const a = g.enemies[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < g.enemies.length; j++) {
      const b = g.enemies[j];
      if (!b.alive) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.r + b.r + 8;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < min * min) {
        const d = Math.sqrt(d2) || 1;
        const push = (min - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
    const m = 10;
    if (a.x < m) a.x = m;
    if (a.y < m) a.y = m;
    if (a.x > g.w - m) a.x = g.w - m;
    if (a.y > g.h - m) a.y = g.h - m;
  }

  for (const b of g.bullets) {
    if (!b.alive) continue;
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0 || b.x < -40 || b.y < -40 || b.x > g.w + 40 || b.y > g.h + 40) {
      b.alive = false;
      continue;
    }
    if (b.friendly) {
      for (const e of g.enemies) {
        if (!e.alive) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const rr = e.r + b.r;
        if (dx * dx + dy * dy <= rr * rr) {
          b.alive = false;
          e.vx += (b.vx / 700) * 40;
          e.vy += (b.vy / 700) * 40;
          damageEnemy(g, e, b.dmg);
          if (g.phase !== "playing") return;
          break;
        }
      }
    } else {
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const d2 = dx * dx + dy * dy;
      const rr = p.r + b.r;
      const graze = rr + 26;
      if (!b.grazed && p.iframes <= 0 && d2 > rr * rr && d2 <= graze * graze) {
        b.grazed = true;
        g.score += 20;
        burst(g, b.x, b.y, "primary", 2, 40);
      }
      if (d2 <= rr * rr) {
        b.alive = false;
        if (p.shield > 0) burst(g, b.x, b.y, "primary", 5, 80);
        else {
          const d = Math.hypot(dx, dy) || 1;
          p.vx += (dx / d) * 160;
          p.vy += (dy / d) * 160;
          hurtPlayer(g);
          if (g.phase !== "playing") return;
        }
      }
    }
  }

  cancelCrossfire(g);

  if (g.phase !== "playing") return;

  for (const e of g.enemies) {
    if (!e.alive || e.touchCd > 0) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const rr = e.r + p.r;
    if (dx * dx + dy * dy <= rr * rr) {
      e.touchCd = 0.42;
      const d = Math.hypot(dx, dy) || 1;
      e.vx += (dx / d) * 90;
      e.vy += (dy / d) * 90;
      p.vx -= (dx / d) * 150;
      p.vy -= (dy / d) * 150;
      damageEnemy(g, e, g.cheats.oneShot ? 99 : 1);
      if (p.shield > 0) burst(g, p.x, p.y, "primary", 6, 90);
      else hurtPlayer(g);
      if (g.phase !== "playing") return;
    }
  }

  for (const item of g.pickups) {
    if (!item.alive) continue;
    item.life -= dt;
    if (item.life <= 0) {
      item.alive = false;
      continue;
    }
    const dx = p.x - item.x;
    const dy = p.y - item.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 96 * 96 && d2 > 4) {
      const d = Math.sqrt(d2);
      item.x += (dx / d) * 140 * dt;
      item.y += (dy / d) * 140 * dt;
    }
    if (d2 <= (p.r + 16) * (p.r + 16)) {
      item.alive = false;
      applyPickup(g, item.kind);
    }
  }

  for (const part of g.particles) {
    if (!part.alive) continue;
    part.life -= dt;
    if (part.life <= 0) {
      part.alive = false;
      continue;
    }
    part.x += part.vx * dt;
    part.y += part.vy * dt;
    const drag = Math.exp(-2.4 * dt);
    part.vx *= drag;
    part.vy *= drag;
  }
  for (const f of g.flashes) {
    if (!f.alive) continue;
    f.life -= dt;
    if (f.life <= 0) f.alive = false;
  }
  for (const pop of g.popups) {
    if (!pop.alive) continue;
    pop.life -= dt;
    pop.y += pop.vy * dt;
    if (pop.life <= 0) pop.alive = false;
  }

  const moving = Math.hypot(p.vx, p.vy);
  if (moving > 40) {
    p.puff -= dt;
    if (p.puff <= 0) {
      p.puff = 0.035;
      const part = alloc(g.particles);
      if (part) {
        part.alive = true;
        part.x = p.x - Math.cos(p.aim) * 14;
        part.y = p.y - Math.sin(p.aim) * 14;
        part.vx = -Math.cos(p.aim) * 30 + p.vx * 0.1;
        part.vy = -Math.sin(p.aim) * 30 + p.vy * 0.1;
        part.max = 0.22;
        part.life = 0.22;
        part.r = 2.4;
        part.hue = "primary";
      }
    }
  }
}

function hudOf(g: Game): Hud {
  let alive = 0;
  for (const e of g.enemies) if (e.alive) alive++;
  const queued = g.waveState === "spawn" ? Math.max(0, g.queue.length - g.qIndex) : 0;
  let banner = "";
  let bannerSub = "";
  if (g.phase === "playing" && g.waveState === "announce") {
    banner = g.wave % 5 === 0 ? "KIRICI" : `DALGA ${String(g.wave).padStart(2, "0")}`;
    bannerSub = g.wave % 5 === 0 ? "Ağır gemi yaklaşıyor" : "Kenardan yaklaşıyorlar";
  } else if (g.phase === "playing" && g.waveState === "clear") {
    banner = "DALGA TEMİZ";
    bannerSub = `+${g.lastBonus.toLocaleString("tr-TR")} bonus`;
  }
  let bossHp = 0;
  let bossMax = 0;
  for (const e of g.enemies) {
    if (e.alive && e.kind === "boss") {
      bossHp = e.hp;
      bossMax = e.maxHp;
    }
  }
  return {
    phase: g.phase,
    score: g.score,
    wave: g.wave,
    lives: g.player.lives,
    combo: g.combo,
    bestCombo: g.bestCombo,
    shield: g.player.shield,
    speedT: g.player.speedT,
    multiT: g.player.multiT,
    multiLevel: g.player.multiLevel,
    banner,
    bannerSub,
    left: alive + queued,
    cheated: g.cheated,
    dashCd: g.player.dashCd,
    bombs: g.player.bombs,
    bossHp,
    bossMax,
    overdrive: g.combo >= 8,
    over: g.over,
  };
}

function sameHud(a: Hud | null, b: Hud) {
  if (!a) return false;
  return (
    a.phase === b.phase &&
    a.score === b.score &&
    a.wave === b.wave &&
    a.lives === b.lives &&
    a.combo === b.combo &&
    a.bestCombo === b.bestCombo &&
    Math.ceil(a.shield) === Math.ceil(b.shield) &&
    Math.ceil(a.speedT) === Math.ceil(b.speedT) &&
    Math.ceil(a.multiT) === Math.ceil(b.multiT) &&
    a.multiLevel === b.multiLevel &&
    a.banner === b.banner &&
    a.left === b.left &&
    a.cheated === b.cheated &&
    a.bombs === b.bombs &&
    Math.ceil(a.dashCd) === Math.ceil(b.dashCd) &&
    a.bossHp === b.bossHp &&
    a.bossMax === b.bossMax &&
    a.overdrive === b.overdrive &&
    a.over?.score === b.over?.score &&
    a.over?.wave === b.over?.wave &&
    a.over?.cheated === b.over?.cheated
  );
}

export function mount(canvas: HTMLCanvasElement, stage: HTMLElement, opts: MountOpts): GameApi {
  const g = createGame();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  g.reduceMotion = reduce.matches;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas kullanılamıyor");

  let raf = 0;
  let last = 0;
  let acc = 0;
  let lastHud: Hud | null = null;
  let pubAt = 0;
  let alive = true;

  const publish = (force: boolean) => {
    const snap = hudOf(g);
    if (!force && g.visualTime - pubAt < 0.08 && sameHud(lastHud, snap)) return;
    if (sameHud(lastHud, snap) && !force) return;
    pubAt = g.visualTime;
    lastHud = snap;
    opts.onHud(snap);
  };

  const fit = () => {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, rect.width);
    const h = Math.max(2, rect.height);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    g.w = w;
    g.h = h;
    g.dpr = dpr;
    if (g.needsCenter && w > 20) centerPlayer(g);
    else if (g.phase !== "menu") {
      const m = 22;
      g.player.x = Math.min(w - m, Math.max(m, g.player.x));
      g.player.y = Math.min(h - m, Math.max(m, g.player.y));
    }
  };

  const local = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
    if (typing) return;
    if (e.code === "Escape" && !e.repeat) {
      e.preventDefault();
      if (g.phase === "playing") g.phase = "paused";
      else if (g.phase === "paused") {
        g.phase = "playing";
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      publish(true);
      return;
    }
    if (e.code === "KeyM" && !e.repeat) {
      e.preventDefault();
      opts.onMuteToggle();
      return;
    }
    if ((e.code === "Space" || e.code.startsWith("Arrow")) && g.phase === "playing") e.preventDefault();
    if (e.code === "Space" && (el?.tagName === "BUTTON" || g.phase !== "playing")) return;
    g.keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    g.keys.delete(e.code);
  };
  const onBlur = () => {
    g.keys.clear();
    g.pointer.down = false;
  };
  const onVis = () => {
    if (document.hidden) {
      g.keys.clear();
      if (g.phase === "playing") {
        g.phase = "paused";
        publish(true);
      }
    }
  };
  const onMove = (e: PointerEvent) => {
    const p = local(e);
    g.pointer.x = p.x;
    g.pointer.y = p.y;
    g.pointer.seen = true;
    g.pointer.type = e.pointerType;
  };
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const p = local(e);
    g.pointer.x = p.x;
    g.pointer.y = p.y;
    g.pointer.down = true;
    g.pointer.seen = true;
    g.pointer.type = e.pointerType;
  };
  const onUp = () => {
    g.pointer.down = false;
  };
  const onContext = (e: Event) => e.preventDefault();
  const onReduce = () => {
    g.reduceMotion = reduce.matches;
  };

  const signal = new AbortController();
  window.addEventListener("keydown", onKeyDown, { signal: signal.signal });
  window.addEventListener("keyup", onKeyUp, { signal: signal.signal });
  window.addEventListener("blur", onBlur, { signal: signal.signal });
  window.addEventListener("pointermove", onMove, { signal: signal.signal });
  window.addEventListener("pointerup", onUp, { signal: signal.signal });
  window.addEventListener("pointercancel", onUp, { signal: signal.signal });
  document.addEventListener("visibilitychange", onVis, { signal: signal.signal });
  canvas.addEventListener("pointerdown", onDown, { signal: signal.signal });
  canvas.addEventListener("contextmenu", onContext, { signal: signal.signal });
  reduce.addEventListener("change", onReduce);
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  fit();

  window.__controlsTest = {
    getYaw: () => g.player.aim,
    getSpeed: () => Math.hypot(g.player.vx, g.player.vy),
    getX: () => g.player.x,
    getY: () => g.player.y,
    getPhase: () => g.phase,
    getFriendlyBullets: () => {
      let n = 0;
      for (const b of g.bullets) if (b.alive && b.friendly) n++;
      return n;
    },
    getEnemies: () => {
      let n = 0;
      for (const e of g.enemies) if (e.alive) n++;
      return n;
    },
    setKeys: (codes: string[]) => {
      g.injected.clear();
      for (const code of codes) g.injected.add(code);
    },
  };

  const loop = (t: number) => {
    if (!alive) return;
    if (!last) last = t;
    let frame = (t - last) / 1000;
    last = t;
    if (frame < 0) frame = 0;
    if (frame > 0.05) frame = 0.05;
    g.visualTime += frame;
    g.pointerDrive = opts.getPointerDrive();
    acc += frame;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      step(g, STEP);
      acc -= STEP;
      steps++;
    }
    draw(g, ctx, canvas);
    publish(false);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  publish(true);

  return {
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      signal.abort();
      ro.disconnect();
      reduce.removeEventListener("change", onReduce);
      if (window.__controlsTest) window.__controlsTest = undefined;
    },
    start() {
      resetRun(g);
      g.phase = "playing";
      g.pointer.down = false;
      g.keys.clear();
      beginWave(g, 1);
      (document.activeElement as HTMLElement | null)?.blur?.();
      publish(true);
    },
    pause() {
      if (g.phase === "playing") {
        g.phase = "paused";
        publish(true);
      }
    },
    resume() {
      if (g.phase === "paused") {
        g.phase = "playing";
        (document.activeElement as HTMLElement | null)?.blur?.();
        publish(true);
      }
    },
    menu() {
      g.phase = "menu";
      g.pointer.down = false;
      g.keys.clear();
      clearActors(g);
      publish(true);
    },
    setMuted(value: boolean) {
      setMuted(value);
    },
    setStick(active: boolean, x: number, y: number) {
      g.stick.active = active;
      g.stick.x = x;
      g.stick.y = y;
    },
    setCheats(value: Cheats) {
      g.cheats.ring = value.ring === true;
      g.cheats.rapid = value.rapid === true;
      g.cheats.god = value.god === true;
      g.cheats.turbo = value.turbo === true;
      g.cheats.shield = value.shield === true;
      g.cheats.spread = value.spread === true;
      g.cheats.oneShot = value.oneShot === true;
      if (anyCheat(g.cheats) && (g.phase === "playing" || g.phase === "paused")) g.cheated = true;
      applyLocks(g);
      publish(true);
    },
    refillLives() {
      if (g.phase !== "playing" && g.phase !== "paused") return;
      g.cheated = true;
      g.player.lives = 9;
      g.player.iframes = Math.max(g.player.iframes, 0.35);
      popup(g, g.player.x, g.player.y - 18, "CAN 9");
      publish(true);
    },
    clearField() {
      if (g.phase !== "playing" && g.phase !== "paused") return;
      g.cheated = true;
      let wiped = false;
      for (const e of g.enemies) {
        if (!e.alive) continue;
        e.alive = false;
        wiped = true;
        burst(g, e.x, e.y, "danger", 8, 140);
      }
      g.qIndex = g.queue.length;
      if (g.waveState !== "clear") {
        g.waveState = "clear";
        g.announceT = 1.2;
        g.lastBonus = wiped ? 300 * Math.max(1, g.wave) : 0;
        g.score += g.lastBonus;
        if (wiped) playClear();
      }
      publish(true);
    },
    dash() {
      g.reqDash = true;
    },
    bomb() {
      g.reqBomb = true;
    },
  };
}
