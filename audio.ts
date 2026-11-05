const MUTE_KEY = "nova-siper-mute";

let ctx: AudioContext | null = null;
let muted = false;

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveMuted(value: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

export function setMuted(value: boolean) {
  muted = value;
}

export function isMuted() {
  return muted;
}

export function unlockAudio() {
  if (typeof AudioContext === "undefined") return;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

function ac(): AudioContext | null {
  if (muted || !ctx) return null;
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  slideTo?: number,
) {
  const a = ac();
  if (!a) return;
  try {
    const t = a.currentTime;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(40, freq), t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    g.gain.setValueAtTime(Math.max(0.0001, gain), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch {
    /* audio graph can throw if the context is closing */
  }
}

function noise(duration: number, gain: number) {
  const a = ac();
  if (!a) return;
  try {
    const n = Math.max(1, Math.floor(a.sampleRate * duration));
    const buf = a.createBuffer(1, n, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = a.createBufferSource();
    const g = a.createGain();
    src.buffer = buf;
    g.gain.value = gain;
    src.connect(g);
    g.connect(a.destination);
    src.start();
  } catch {
    /* ignore */
  }
}

export function playShot(multi: boolean) {
  tone(multi ? 560 : 720, 0.055, "square", 0.03, multi ? 240 : 320);
}

export function playHit() {
  tone(220, 0.04, "square", 0.02, 90);
}

export function playBoom() {
  noise(0.18, 0.05);
  tone(140, 0.2, "sawtooth", 0.04, 50);
}

export function playHurt() {
  noise(0.16, 0.06);
  tone(90, 0.22, "sawtooth", 0.05, 40);
}

export function playPickup() {
  tone(520, 0.07, "triangle", 0.04);
  tone(780, 0.09, "sine", 0.03);
}

export function playWave() {
  tone(330, 0.12, "triangle", 0.035, 520);
}

export function playClear() {
  tone(480, 0.1, "sine", 0.035);
  tone(720, 0.14, "sine", 0.03);
}

export function playDash() {
  tone(160, 0.09, "sawtooth", 0.035, 640);
}

export function playBomb() {
  noise(0.26, 0.07);
  tone(70, 0.32, "sawtooth", 0.055, 36);
}
