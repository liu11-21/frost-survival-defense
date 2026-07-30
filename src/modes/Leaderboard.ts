export interface LeaderboardEntry {
  name: string;
  wave: number;
  kills: number;
  score: number;
  seconds: number;
  date: string;
}

const KEY = "frostbound.endless.leaderboard.v1";
const MAX_ENTRIES = 10;

/**
 * A local-only endless leaderboard backed by `localStorage`. It is explicitly
 * per-browser: nothing is uploaded and no score here is verifiable.
 */
export class Leaderboard {
  private entries: LeaderboardEntry[] = [];

  constructor() {
    this.load();
  }

  get all(): ReadonlyArray<LeaderboardEntry> {
    return this.entries;
  }

  static score(wave: number, kills: number, seconds: number): number {
    return Math.round(wave * 1000 + kills * 10 + Math.min(seconds, 7200) * 0.5);
  }

  submit(name: string, wave: number, kills: number, seconds: number): LeaderboardEntry {
    const entry: LeaderboardEntry = {
      name: name.trim().slice(0, 16) || "無名守爐人",
      wave,
      kills,
      score: Leaderboard.score(wave, kills, seconds),
      seconds: Math.round(seconds),
      date: new Date().toISOString().slice(0, 10),
    };
    this.entries.push(entry);
    this.entries.sort((a, b) => b.score - a.score);
    this.entries = this.entries.slice(0, MAX_ENTRIES);
    this.save();
    return entry;
  }

  clear(): void {
    this.entries = [];
    this.save();
  }

  private load(): void {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.entries = parsed.filter(isEntry).slice(0, MAX_ENTRIES);
      }
    } catch {
      // A corrupt or blocked store simply means an empty board.
      this.entries = [];
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.entries));
    } catch {
      // Private-mode browsers can refuse writes; the run itself is unaffected.
    }
  }
}

function isEntry(value: unknown): value is LeaderboardEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === "string" &&
    typeof v.wave === "number" &&
    typeof v.kills === "number" &&
    typeof v.score === "number" &&
    typeof v.seconds === "number" &&
    typeof v.date === "string"
  );
}
