//lib/taskDateUtils.ts

const DAY_MS = 24 * 60 * 60 * 1000;

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatHm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function toDateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${y}-${m}-${dd}`;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function startOfWeekSunday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0 = Sun
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

export function endOfWeekSaturday(d: Date): Date {
  const start = startOfWeekSunday(d);
  const end = addDays(start, 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function isKeyInRange(key: string, startKey: string, endKey: string): boolean {
  return key >= startKey && key <= endKey;
}

export type ParseWhenInputResult =
  | { ok: true; remindAt: Date }
  | { ok: false; error: string };

export function parseWhenInput(text: string): ParseWhenInputResult {
  const s = text.trim();
  if (!s) return { ok: false, error: "Required" };

  // MVP format: YYYY/MM/DD HH:mm
  const m = /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/.exec(s);
  if (!m) return { ok: false, error: "Format is 2026/06/23 10:00" };

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);

  if (mo < 1 || mo > 12) return { ok: false, error: "Month must be 01-12" };
  if (da < 1 || da > 31) return { ok: false, error: "Day must be 01-31" };
  if (hh < 0 || hh > 23) return { ok: false, error: "Hour must be 00-23" };
  if (mm < 0 || mm > 59) return { ok: false, error: "Minute must be 00-59" };

  const d = new Date(y, mo - 1, da, hh, mm, 0, 0);

  // Validate the date wasn't auto-rolled (e.g., 2025/02/31 -> Mar 3)
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) {
    return { ok: false, error: "Invalid date" };
  }

  return { ok: true, remindAt: d };
}

export function getDayNameShort(d: Date): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  return names[d.getDay()];
}

export function isExpired(now: Date, remindAt: Date): boolean {
  return now.getTime() > remindAt.getTime() + 7 * DAY_MS;
}

export function daysLeftUntilExpire(now: Date, remindAt: Date): number {
  const diffMs = now.getTime() - remindAt.getTime();
  const daysLate = Math.floor(diffMs / DAY_MS);
  const left = 7 - daysLate;
  return left < 0 ? 0 : left;
}

export function pickStringParam(v: unknown): string | null {
  if (typeof v === "string") return v.trim() ? v.trim() : null;

  if (Array.isArray(v)) {
    const first = v.find((x) => typeof x === "string") as string | undefined;
    return first && first.trim() ? first.trim() : null;
  }

  return null;
}
