// FILE: components/home/taskWhenParser.ts

import { parseWhenInput } from '@/lib/taskDateUtils';

export type TaskWhenParseResult =
  | { ok: true; remindAt: Date }
  | { ok: false; error: string };

function roundNowToMinute(d: Date): Date {
  const x = new Date(d);
  x.setSeconds(0, 0);
  return x;
}

export function parseTaskWhenInput(whenText: string): TaskWhenParseResult {
  const parsed = parseWhenInput(whenText);

  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const remindAt = parsed.remindAt;

  const nowMinute = roundNowToMinute(new Date());
  if (remindAt.getTime() < nowMinute.getTime()) {
    return { ok: false, error: 'Time must be now or later' };
  }

  return { ok: true, remindAt };
}
