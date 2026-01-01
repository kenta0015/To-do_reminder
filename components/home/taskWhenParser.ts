// FILE: components/home/taskWhenParser.ts

import * as chrono from 'chrono-node';
import { parseWhenInput } from '@/lib/taskDateUtils';

export type TaskWhenParseResult =
  | { ok: true; remindAt: Date }
  | { ok: false; error: string };

const ERROR_REQUIRED = 'Required';

const ERROR_PAST = 'Time must be now or later';

const ERROR_TIME_MISSING =
  "Please include a time (e.g., 'tomorrow 9am' or 'tomorrow 21:00').";

const ERROR_AMPM_REQUIRED =
  "Please specify AM or PM (e.g., 'tomorrow 9am' or 'tomorrow 9pm').";

const ERROR_DAY_MISSING =
  "Please include a day and a time (e.g., 'today 9am' or 'tomorrow 9am').";

const ERROR_CANNOT_UNDERSTAND =
  "Couldn't understand. Examples: 'tomorrow 9am', 'in 5 hours', '2026/01/05 14:00', 'tomorrow 21:00'.";

const ERROR_AMBIGUOUS =
  "That looks ambiguous. Please be more specific (add a day/time like 'tomorrow 9am').";

function roundNowToMinute(d: Date): Date {
  const x = new Date(d);
  x.setSeconds(0, 0);
  return x;
}

function normalizeWhenRaw(raw: string): string {
  // Make "tomorrow9am" -> "tomorrow 9 am", "friday6:30am" -> "friday 6:30 am"
  // This avoids relying on word boundaries between letters and digits.
  const s = raw
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

function isStrictLegacyFormat(s: string): boolean {
  // Keep the existing format gate: YYYY/MM/DD HH:mm
  return /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(s);
}

function parseTimeOnly24hToday(
  raw: string,
  now: Date
): { ok: true; date: Date } | { ok: false; error: string } | null {
  const m = /^(\d{2}):(\d{2})$/.exec(raw);
  if (!m) return null;

  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return { ok: false, error: ERROR_CANNOT_UNDERSTAND };
  if (hh < 0 || hh > 23) return { ok: false, error: ERROR_CANNOT_UNDERSTAND };
  if (mm < 0 || mm > 59) return { ok: false, error: ERROR_CANNOT_UNDERSTAND };

  const d = new Date(now);
  d.setHours(hh, mm, 0, 0);
  return { ok: true, date: d };
}

function isRelativeDuration(raw: string): boolean {
  return /^\s*in\s+\d+(\.\d+)?\s+(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\b/i.test(raw);
}

function hasExplicitMeridiem(raw: string): boolean {
  // Allow both "9am" and "9 am" (also "a.m.", "p m", etc.)
  // NOTE: \b does NOT exist between digit and letter, so we must allow a digit directly before am/pm.
  return /(?:\b|\d)(a\.?\s*m\.?|p\.?\s*m\.?)\b/i.test(raw);
}

function hasTwoDigit24hTime(raw: string): boolean {
  // Treat "HH:mm" (two-digit hour) as explicit 24h time.
  return /\b\d{2}:\d{2}\b/.test(raw);
}

function getClockHour(raw: string): number | null {
  const m = /\b(\d{1,2}):(\d{2})\b/.exec(raw);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return hh;
}

function hasDayKeyword(raw: string): boolean {
  // Match day-ish keywords even when adjacent to digits after normalization.
  // Intentionally excludes month names to avoid treating "Jan 5" as a "day keyword" context.
  return /\b(today|tomorrow|tonight|next|this|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\b/i.test(
    raw
  );
}

function getBareHourToken(raw: string): number | null {
  // Treat a bare number like "9" as a time token only when it appears in a time-ish context,
  // e.g. "tomorrow 9" / "next friday 9" / "today at 9".
  const contextOk = hasDayKeyword(raw) || /\bat\b/i.test(raw);
  if (!contextOk) return null;

  const re = /\b\d{1,2}\b/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(raw)) !== null) {
    const token = m[0];
    const n = Number(token);
    if (!Number.isFinite(n)) continue;
    if (n < 0 || n > 23) continue;

    const i = m.index;
    const before = i > 0 ? raw[i - 1] : '';
    const after = i + token.length < raw.length ? raw[i + token.length] : '';

    // Skip tokens that look like part of a date: 2026/01/05 or 2026-01-05
    if (before === '/' || after === '/' || before === '-' || after === '-') continue;

    // Skip tokens that are part of a clock time: "6:30"
    if (before === ':' || after === ':') continue;

    return n;
  }

  return null;
}

function hasExplicitDateToken(raw: string): boolean {
  // Accept year-first date tokens like "2026/1/5" or "2026-01-05"
  return /\b\d{4}[\/-]\d{1,2}[\/-]\d{1,2}\b/.test(raw);
}

function isCertain(comp: any, key: string): boolean {
  try {
    if (!comp || typeof comp.isCertain !== 'function') return false;
    return !!comp.isCertain(key as any);
  } catch {
    return false;
  }
}

export function parseTaskWhenInput(whenText: string): TaskWhenParseResult {
  const parsed = parseWhenInput(whenText);

  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const remindAt = parsed.remindAt;

  const nowMinute = roundNowToMinute(new Date());
  if (remindAt.getTime() < nowMinute.getTime()) {
    return { ok: false, error: ERROR_PAST };
  }

  return { ok: true, remindAt };
}

export function parseTaskWhenInputStrict(
  whenText: string,
  opts?: { now?: Date }
): TaskWhenParseResult {
  const rawInput = whenText.trim();
  if (!rawInput) return { ok: false, error: ERROR_REQUIRED };

  const raw = normalizeWhenRaw(rawInput);

  const now = opts?.now ?? new Date();
  const nowMinute = roundNowToMinute(now);

  // 1) Legacy exact format (preserve acceptance; errors are fixed)
  if (isStrictLegacyFormat(rawInput)) {
    const legacy = parseWhenInput(rawInput);
    if (!legacy.ok) return { ok: false, error: ERROR_CANNOT_UNDERSTAND };

    const remindAt = legacy.remindAt;
    if (!remindAt || Number.isNaN(remindAt.getTime())) return { ok: false, error: ERROR_CANNOT_UNDERSTAND };
    if (remindAt.getTime() < nowMinute.getTime()) return { ok: false, error: ERROR_PAST };
    return { ok: true, remindAt };
  }

  // Special-case: time-only "HH:mm" means today at that time
  const timeOnly = parseTimeOnly24hToday(raw, nowMinute);
  if (timeOnly) {
    if (!timeOnly.ok) return { ok: false, error: timeOnly.error };

    const remindAt = timeOnly.date;
    if (remindAt.getTime() < nowMinute.getTime()) return { ok: false, error: ERROR_PAST };
    return { ok: true, remindAt };
  }

  // 2) Chrono parse (English)
  const results = chrono.parse(raw, now, { forwardDate: true });

  if (results.length === 0) return { ok: false, error: ERROR_CANNOT_UNDERSTAND };
  if (results.length > 1) return { ok: false, error: ERROR_AMBIGUOUS };

  const r = results[0];
  const start = (r as any).start;

  const relative = isRelativeDuration(raw);

  const hasMeridiem = hasExplicitMeridiem(raw);
  const has24h = hasTwoDigit24hTime(raw);

  const clockHour = getClockHour(raw);
  const bareHour = getBareHourToken(raw);

  const hasAnyClock = clockHour !== null;
  const hasBareHour = bareHour !== null;

  // Time presence must not rely on chrono's "certainty" because chrono can carry the reference time
  // even when the user did not specify a time. Example: "tomorrow 9" could produce "tomorrow (nowTime)"
  // if the bare "9" is ignored by chrono.
  const timeSpecified = relative || hasMeridiem || hasAnyClock || hasBareHour;
  if (!timeSpecified) return { ok: false, error: ERROR_TIME_MISSING };

  const dateSpecified =
    relative || hasDayKeyword(raw) || hasExplicitDateToken(raw) || isCertain(start, 'weekday');
  if (!dateSpecified) return { ok: false, error: ERROR_DAY_MISSING };

  // AM/PM strictness:
  // - Require AM/PM for 1..12 hours when user did NOT use explicit "HH:mm" (two-digit hour).
  // - Do NOT apply this rule to explicit relative durations like "in 5 hours".
  //
  // IMPORTANT: Use raw tokens (clockHour/bareHour) first, because chrono may ignore the bare hour
  // and keep the reference hour (e.g., "tomorrow 9" -> tomorrow at now's hour).
  if (!relative && !hasMeridiem && !has24h) {
    if (clockHour !== null && clockHour >= 1 && clockHour <= 12) {
      return { ok: false, error: ERROR_AMPM_REQUIRED };
    }

    if (bareHour !== null) {
      if (bareHour >= 1 && bareHour <= 12) {
        return { ok: false, error: ERROR_AMPM_REQUIRED };
      }
      // Bare 24h hour like "tomorrow 21" is not an accepted strict format.
      // Require users to be explicit with minutes (e.g., "tomorrow 21:00").
      return { ok: false, error: ERROR_TIME_MISSING };
    }
  }

  const remindAt = (start && typeof start.date === 'function' ? start.date() : null) as Date | null;
  if (!remindAt || Number.isNaN(remindAt.getTime())) return { ok: false, error: ERROR_CANNOT_UNDERSTAND };

  remindAt.setSeconds(0, 0);

  if (remindAt.getTime() < nowMinute.getTime()) return { ok: false, error: ERROR_PAST };

  return { ok: true, remindAt };
}
