export type ScoreRow = {
  name: string;
  score: number;
  wave: number;
  at: number;
};

const KEY = "nova-siper-v1";
const MAX = 8;

function isRow(value: unknown): value is ScoreRow {
  if (!value || typeof value !== "object") return false;
  const row = value as ScoreRow;
  return (
    typeof row.name === "string" &&
    typeof row.score === "number" &&
    Number.isFinite(row.score) &&
    typeof row.wave === "number" &&
    Number.isFinite(row.wave) &&
    typeof row.at === "number"
  );
}

export function cleanName(value: string) {
  const name = value.replace(/\s+/g, " ").trim().slice(0, 12);
  return name || "PİLOT";
}

export function loadScores(): ScoreRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as { version?: number; rows?: unknown };
    if (!data || data.version !== 1 || !Array.isArray(data.rows)) return [];
    return data.rows
      .filter(isRow)
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function qualifies(rows: ScoreRow[], score: number) {
  if (score <= 0) return false;
  if (rows.length < MAX) return true;
  return score >= rows[rows.length - 1].score;
}

export function submitScore(row: ScoreRow): { rows: ScoreRow[]; rank: number } {
  const next = cleanName(row.name);
  const entry: ScoreRow = { ...row, name: next, score: Math.max(0, Math.floor(row.score)) };
  const rows = [...loadScores(), entry]
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, rows }));
  } catch {
    /* keep the in-memory table even if storage is blocked */
  }
  const rank = rows.findIndex((r) => r.at === entry.at && r.name === entry.name && r.score === entry.score);
  return { rows, rank: rank < 0 ? rows.length : rank + 1 };
}
