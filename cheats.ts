import type { Cheats } from "@/game/types";

const KEY = "nova-siper-cheats";

export const DEFAULT_CHEATS: Cheats = {
  ring: false,
  rapid: false,
  god: false,
  turbo: false,
  shield: false,
  spread: false,
  oneShot: false,
};

const KEYS = ["ring", "rapid", "god", "turbo", "shield", "spread", "oneShot"] as const;

export function anyCheat(cheats: Cheats) {
  return KEYS.some((key) => cheats[key]);
}

export function loadCheats(): Cheats {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_CHEATS };
    const data = JSON.parse(raw) as { version?: number; cheats?: Partial<Cheats> };
    if (!data || data.version !== 1 || !data.cheats) return { ...DEFAULT_CHEATS };
    const next = { ...DEFAULT_CHEATS };
    for (const key of KEYS) next[key] = data.cheats[key] === true;
    return next;
  } catch {
    return { ...DEFAULT_CHEATS };
  }
}

export function saveCheats(cheats: Cheats) {
  try {
    const next = { ...DEFAULT_CHEATS };
    for (const key of KEYS) next[key] = cheats[key] === true;
    localStorage.setItem(KEY, JSON.stringify({ version: 1, cheats: next }));
  } catch {
    /* ignore quota / private mode */
  }
}
