// lib/statsUtils.ts – compute statistics from tasks for the Statistics screen

import { Task } from '@/lib/storage';
import {
  addDays,
  endOfWeekSaturday,
  startOfWeekSunday,
  toDateKeyLocal,
} from '@/lib/taskDateUtils';
import { getRemindAtFromTask } from '@/components/home/homeSections';

function completedAtToDateKey(completedAt: string | undefined): string | null {
  if (!completedAt || typeof completedAt !== 'string') return null;
  const d = new Date(completedAt);
  if (Number.isNaN(d.getTime())) return null;
  return toDateKeyLocal(d);
}

export type StatsResult = {
  completedToday: number;
  completedThisWeek: number;
  completedTotal: number;
  overdueCount: number;
  incompleteToday: number;
  incompleteTotal: number;
};

export function computeStats(tasks: Task[], now: Date): StatsResult {
  const todayKey = toDateKeyLocal(now);
  const weekStart = startOfWeekSunday(now);
  const weekEnd = endOfWeekSaturday(now);
  const weekStartKey = toDateKeyLocal(weekStart);
  const weekEndKey = toDateKeyLocal(weekEnd);

  let completedToday = 0;
  let completedThisWeek = 0;
  let completedTotal = 0;
  let overdueCount = 0;
  let incompleteToday = 0;
  let incompleteTotal = 0;

  for (const t of tasks) {
    if (t.completed) {
      completedTotal++;
      const key = completedAtToDateKey(t.completedAt);
      if (key === todayKey) completedToday++;
      if (key && key >= weekStartKey && key <= weekEndKey) completedThisWeek++;
    } else {
      incompleteTotal++;
      const remindAt = getRemindAtFromTask(t);
      if (!remindAt) continue;
      const dateKey = toDateKeyLocal(remindAt);
      if (dateKey < todayKey) overdueCount++;
      if (dateKey === todayKey) incompleteToday++;
    }
  }

  return {
    completedToday,
    completedThisWeek,
    completedTotal,
    overdueCount,
    incompleteToday,
    incompleteTotal,
  };
}
