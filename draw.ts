import type { Enemy, Game, Palette, Pickup, Player } from "@/game/types";

let cached: Palette | null = null;

export function paletteOf(el: HTMLElement): Palette {
  if (cached) return cached;
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  cached = {
    bg: v("--color-bg", "#070b12"),
    fg: v("--color-fg", "#e8eef6"),
    muted: v("--color-muted", "#93a4ba"),
    primary: v("--color-primary", "#2ad4c2"),
    danger: v("--color-danger", "#ff5a6a"),
    surface: v("--color-surface", "#121a28"),
  };
  return cached;
}

function fighterPath(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath();
  ctx.moveTo(22 * s, 0);
  ctx.lineTo(2 * s, 5 * s);
  ctx.lineTo(-8 * s, 15 * s);
  ctx.lineTo(-3 * s, 5.5 * s);
  ctx.lineTo(-16 * s, 6.5 * s);
  ctx.lineTo(-10 * s, 0);
  ctx.lineTo(-16 * s, -6.5 * s);
  ctx.lineTo(-3 * s, -5.5 * s);
  ctx.lineTo(-8 * s, -15 * s);
  ctx.lineTo(2 * s, -5 * s);
  ctx.closePath();
}

function drawFighter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: string,
  alpha: number,
  scale: number,
  thrust: number,
  time: number,
  kick: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.translate(-kick * 5, 0);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  fighterPath(ctx, scale);
  ctx.fill();
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = "#f7fbff";
  ctx.beginPath();
  ctx.ellipse(4 * scale, 0, 4.2 * scale, 2.3 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  if (thrust > 0.05) {
    const len = (8 + thrust * 16) * (0.75 + 0.25 * Math.sin(time * 42));
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-12 * scale, 3.2 * scale);
    ctx.lineTo(-12 * scale - len, 0);
    ctx.lineTo(-12 * scale, -3.2 * scale);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawEnemyShape(ctx: CanvasRenderingContext2D, e: Enemy, pal: Palette, time: number) {
  const flash = e.flash > 0;
  if (e.kind === "boss") {
    ctx.fillStyle = flash ? pal.fg : pal.danger;
    ctx.beginPath();
    ctx.moveTo(34, 0);
    ctx.lineTo(8, 16);
    ctx.lineTo(-22, 22);
    ctx.lineTo(-30, 8);
    ctx.lineTo(-14, 0);
    ctx.lineTo(-30, -8);
    ctx.lineTo(-22, -22);
    ctx.lineTo(8, -16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.bg;
    ctx.fillRect(-6, -5, 16, 10);
    ctx.fillStyle = pal.primary;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(4, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = pal.fg;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 30, time * 0.8, time * 0.8 + Math.PI * 1.2);
    ctx.stroke();
    return;
  }
  if (e.kind === "drone") {
    ctx.fillStyle = flash ? pal.fg : pal.danger;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, 9);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, -9);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (e.kind === "cruiser") {
    ctx.fillStyle = flash ? pal.fg : pal.danger;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      const x = Math.cos(a) * e.r;
      const y = Math.sin(a) * e.r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.bg;
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 0.38, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.fillStyle = flash ? pal.fg : pal.danger;
  ctx.beginPath();
  ctx.arc(0, 0, e.r * 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(e.r * 0.15, -2.4, e.r * 0.95, 4.8);
  ctx.fillStyle = pal.bg;
  ctx.beginPath();
  ctx.arc(-1, 0, e.r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = flash ? pal.fg : pal.danger;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, e.r, time * 1.4 + e.phase, time * 1.4 + e.phase + 1.2);
  ctx.stroke();
}

function drawPickupGlyph(ctx: CanvasRenderingContext2D, p: Pickup, pal: Palette) {
  ctx.save();
  ctx.translate(0, 0);
  ctx.strokeStyle = pal.primary;
  ctx.fillStyle = pal.primary;
  ctx.lineWidth = 2;
  if (p.kind === "shield") {
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.stroke();
  } else if (p.kind === "speed") {
    ctx.beginPath();
    ctx.moveTo(-8, -6);
    ctx.lineTo(2, 0);
    ctx.lineTo(-8, 6);
    ctx.moveTo(-1, -6);
    ctx.lineTo(9, 0);
    ctx.lineTo(-1, 6);
    ctx.stroke();
  } else {
    for (const x of [-8, 0, 8]) {
      ctx.beginPath();
      ctx.moveTo(x + 3, 0);
      ctx.lineTo(x - 3, 4);
      ctx.lineTo(x - 3, -4);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

export function draw(g: Game, ctx: CanvasRenderingContext2D, el: HTMLElement) {
  const pal = paletteOf(el);
  const w = g.w;
  const h = g.h;
  ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, w, h);

  const shake = g.reduceMotion ? 0 : g.shake;
  if (shake > 0.2) {
    const nx = Math.sin(g.visualTime * 73) * shake;
    const ny = Math.cos(g.visualTime * 61) * shake;
    ctx.translate(nx, ny);
  }

  drawBackdrop(g, ctx, pal);

  if (g.phase === "menu") {
    drawShowcase(g, ctx, pal);
    return;
  }

  drawWorld(g, ctx, pal);

  if (g.phase !== "playing") {
    ctx.save();
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

function drawBackdrop(g: Game, ctx: CanvasRenderingContext2D, pal: Palette) {
  const w = g.w;
  const h = g.h;
  const slow = g.starOff[0];
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = pal.primary;
  ctx.beginPath();
  ctx.arc(w * 0.22 + (slow.x % 80), h * 0.28 + (slow.y % 60), Math.min(w, h) * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.danger;
  ctx.beginPath();
  ctx.arc(w * 0.78 + (slow.x % 50) * 0.4, h * 0.72, Math.min(w, h) * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  for (const s of g.stars) {
    const off = g.starOff[s.layer];
    const drift = g.visualTime * (8 + s.layer * 16);
    let x = (s.x * w + off.x - drift) % w;
    let y = (s.y * h + off.y * 0.65 - drift * 0.2) % h;
    if (x < 0) x += w;
    if (y < 0) y += h;
    const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(g.visualTime * s.tw + s.ph));
    ctx.globalAlpha = tw * (0.28 + s.layer * 0.26);
    ctx.fillStyle = s.layer === 0 ? pal.muted : pal.fg;
    ctx.beginPath();
    ctx.arc(x, y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

function drawShowcase(g: Game, ctx: CanvasRenderingContext2D, pal: Palette) {
  const x = g.w < 800 ? g.w * 0.5 : g.w * 0.34;
  const y = g.h < 720 ? g.h * 0.2 : g.h * 0.36;
  const orbit = Math.min(86, g.w * 0.18);
  for (let i = 0; i < 3; i++) {
    const a = g.visualTime * 0.65 + i * 2.1;
    const ex = x + Math.cos(a) * orbit;
    const ey = y + Math.sin(a) * orbit * 0.62;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = pal.danger;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, 7);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-8, -7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  const pulse = 0.35 + 0.15 * Math.sin(g.visualTime * 2.4);
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = pal.primary;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  drawFighter(ctx, x, y, g.visualTime * 0.35, pal.primary, 1, 1.35, 0.8, g.visualTime, 0);
}

function drawWorld(g: Game, ctx: CanvasRenderingContext2D, pal: Palette) {
  const p = g.player;
  for (const item of g.pickups) {
    if (!item.alive) continue;
    const bob = Math.sin(g.visualTime * 3 + item.bob) * 4;
    const blink = item.life < 3 ? 0.35 + 0.65 * Math.abs(Math.sin(g.visualTime * 8)) : 1;
    ctx.save();
    ctx.translate(item.x, item.y + bob);
    ctx.globalAlpha = blink;
    ctx.fillStyle = pal.surface;
    ctx.strokeStyle = pal.primary;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    drawPickupGlyph(ctx, item, pal);
    ctx.globalAlpha = blink;
    ctx.fillStyle = pal.fg;
    ctx.font = "600 10px Figtree, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const label = item.kind === "shield" ? "KALKAN" : item.kind === "speed" ? "HIZ" : "ÇOKLU";
    ctx.fillText(label, 0, 18);
    ctx.restore();
  }

  for (const b of g.bullets) {
    if (!b.alive || b.friendly) continue;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = pal.danger;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const e of g.enemies) {
    if (!e.alive) continue;
    const ang =
      e.kind === "gunner" || e.kind === "boss"
        ? Math.atan2(p.y - e.y, p.x - e.x)
        : Math.hypot(e.vx, e.vy) > 8
          ? Math.atan2(e.vy, e.vx)
          : Math.atan2(p.y - e.y, p.x - e.x);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(ang);
    drawEnemyShape(ctx, e, pal, g.visualTime);
    ctx.restore();
    if (e.maxHp > 1) {
      const bw = e.r * 2;
      const ratio = Math.max(0, e.hp / e.maxHp);
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = pal.fg;
      ctx.fillRect(e.x - bw / 2, e.y - e.r - 9, bw, 3);
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.danger;
      ctx.fillRect(e.x - bw / 2, e.y - e.r - 9, bw * ratio, 3);
    }
  }

  if (g.cheats.ring) {
    ctx.lineCap = "round";
    ctx.strokeStyle = pal.primary;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const b of g.bullets) {
      if (!b.alive || !b.friendly) continue;
      const a = Math.atan2(b.vy, b.vx);
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      ctx.moveTo(b.x - cx * 6, b.y - cy * 6);
      ctx.lineTo(b.x + cx * 2, b.y + cy * 2);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else {
    for (const b of g.bullets) {
      if (!b.alive || !b.friendly) continue;
      const a = Math.atan2(b.vy, b.vx);
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = pal.primary;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(b.x - cx * 9, b.y - cy * 9);
      ctx.lineTo(b.x + cx * 3, b.y + cy * 3);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = pal.fg;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(b.x - cx * 8, b.y - cy * 8);
      ctx.lineTo(b.x + cx * 4, b.y + cy * 4);
      ctx.stroke();
      ctx.restore();
    }
  }

  for (const part of g.particles) {
    if (!part.alive) continue;
    const t = Math.max(0, part.life / part.max);
    ctx.globalAlpha = t;
    ctx.fillStyle = part.hue === "danger" ? pal.danger : part.hue === "primary" ? pal.primary : pal.fg;
    ctx.beginPath();
    ctx.arc(part.x, part.y, part.r * t, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (g.shock > 0) {
    const t = 1 - g.shock / 0.42;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.strokeStyle = pal.fg;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(g.shockX, g.shockY, Math.max(8, g.shockR * t), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = Math.max(0, 0.45 * (1 - t));
    ctx.strokeStyle = pal.primary;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(g.shockX, g.shockY, Math.max(8, g.shockR * t), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawPlayer(g, ctx, pal, p);

  for (const f of g.flashes) {
    if (!f.alive) continue;
    const t = Math.max(0, f.life / f.max);
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.a);
    ctx.globalAlpha = t;
    ctx.fillStyle = pal.fg;
    ctx.beginPath();
    ctx.moveTo(18 * t, 0);
    ctx.lineTo(-2, 7 * t);
    ctx.lineTo(-2, -7 * t);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = t * 0.75;
    ctx.fillStyle = pal.primary;
    ctx.beginPath();
    ctx.arc(0, 0, 8 * t, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.globalAlpha = 1;
  ctx.font = "600 13px Figtree, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = pal.fg;
  for (const pop of g.popups) {
    if (!pop.alive) continue;
    ctx.globalAlpha = Math.max(0, pop.life / pop.max);
    ctx.fillText(pop.text, pop.x, pop.y);
  }
  ctx.globalAlpha = 1;
}

function drawPlayer(g: Game, ctx: CanvasRenderingContext2D, pal: Palette, p: Player) {
  const len = p.trail.length;
  const ghosts = p.dashT > 0 || p.speedT > 0 ? len : 5;
  for (let i = ghosts; i >= 1; i--) {
    const idx = (((p.trailI - i) % len) + len) % len;
    const t = p.trail[idx];
    const a = (1 - i / (ghosts + 1)) * (p.speedT > 0 ? 0.28 : 0.14);
    drawFighter(ctx, t.x, t.y, p.aim, pal.primary, a, 1, 0, g.visualTime, 0);
  }

  if (p.shield > 0) {
    const blink = p.shield < 2 ? 0.35 + 0.65 * Math.abs(Math.sin(g.visualTime * 10)) : 0.55 + 0.2 * Math.sin(g.visualTime * 4);
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.strokeStyle = pal.primary;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 14, g.visualTime * 1.6, g.visualTime * 1.6 + Math.PI * 1.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 14, g.visualTime * 1.6 + Math.PI, g.visualTime * 1.6 + Math.PI * 2.4);
    ctx.stroke();
    ctx.restore();
  }

  if (g.combo >= 8) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = pal.danger;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 20, g.visualTime * 3, g.visualTime * 3 + Math.PI * 1.3);
    ctx.stroke();
    ctx.restore();
  }

  let alpha = 1;
  if (p.iframes > 0) alpha = 0.4 + 0.6 * Math.abs(Math.sin(g.visualTime * 18));
  const thrust = Math.min(1, Math.hypot(p.vx, p.vy) / 280);
  drawFighter(ctx, p.x, p.y, p.aim, pal.primary, alpha, 1, thrust, g.visualTime, p.kick);

  if (p.multiT > 0) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.aim);
    ctx.fillStyle = pal.fg;
    ctx.globalAlpha = 0.9;
    const wings = p.multiLevel >= 2 ? [-12, -7, 7, 12] : [-8, 8];
    for (const wy of wings) {
      ctx.fillRect(6, wy - 1.4, 10, 2.8);
    }
    ctx.restore();
  }
}
