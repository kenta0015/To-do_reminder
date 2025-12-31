// FILE: components/home/homeSections.ts

import { Task } from '@/lib/storage';
import {
  addDays,
  endOfWeekSaturday,
  isExpired,
  isKeyInRange,
  startOfWeekSunday,
  toDateKeyLocal,
} from '@/lib/taskDateUtils';
import { TaskRowData } from './HomeScreenView';

export type BuildHomeSectionsParams = {
  tasks: Task[];
  now: Date;
};

export type HomeSectionsResult = {
  todayKey: string;
  tomorrowKey: string;
  weekStartKey: string;
  weekEndKey: string;

  lateTasks: TaskRowData[];
  todayTasks: TaskRowData[];
  tomorrowTasks: TaskRowData[];
  thisWeekByDay: Record<string, TaskRowData[]>;
  completedTodayTasks: Task[];
};

export function getRemindAtFromTask(task: Task): Date | null {
  try {
    if (task.when === 'today') {
      const d = new Date();
      d.setSeconds(0, 0);
      return d;
    }

    if (task.when === 'tomorrow') {
      const d = addDays(new Date(), 1);
      d.setSeconds(0, 0);
      return d;
    }

    const parsed = new Date(task.when);
    if (!Number.isNaN(parsed.getTime())) return parsed;

    return null;
  } catch {
    return null;
  }
}

function toLocalDateKeyFromISO(iso: unknown): string | null {
  if (typeof iso !== 'string' || iso.length === 0) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return toDateKeyLocal(d);
}

function toTimeMsFromISO(iso: unknown): number {
  if (typeof iso !== 'string' || iso.length === 0) return 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return d.getTime();
}

export function buildHomeSections(params: BuildHomeSectionsParams): HomeSectionsResult {
  const { tasks, now } = params;

  const todayKey = toDateKeyLocal(now);
  const tomorrowKey = toDateKeyLocal(addDays(now, 1));

  const weekStartKey = toDateKeyLocal(startOfWeekSunday(now));
  const weekEndKey = toDateKeyLocal(endOfWeekSaturday(now));

  const normalized: TaskRowData[] = [];
  tasks.forEach((t) => {
    const remindAt = getRemindAtFromTask(t);
    if (!remindAt) return;

    const dateKey = toDateKeyLocal(remindAt);
    normalized.push({ task: t, remindAt, dateKey });
  });

  const visibleIncomplete = normalized.filter((x) => !x.task.completed && !isExpired(now, x.remindAt));

  const lateTasks = visibleIncomplete
    .filter((x) => x.dateKey < todayKey)
    .sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime());

  const todayTasks = visibleIncomplete
    .filter((x) => x.dateKey === todayKey)
    .sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime());

  const tomorrowTasks = visibleIncomplete
    .filter((x) => x.dateKey === tomorrowKey)
    .sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime());

  const thisWeekByDay: Record<string, TaskRowData[]> = {};
  visibleIncomplete.forEach((x) => {
    if (x.dateKey === todayKey || x.dateKey === tomorrowKey) return;
    if (!isKeyInRange(x.dateKey, weekStartKey, weekEndKey)) return;

    thisWeekByDay[x.dateKey] = thisWeekByDay[x.dateKey] ?? [];
    thisWeekByDay[x.dateKey].push(x);
  });

  Object.keys(thisWeekByDay).forEach((k) => {
    thisWeekByDay[k].sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime());
  });

  const completedTodayTasks = tasks
    .filter((t) => t.completed && typeof t.completedAt === 'string')
    .filter((t) => toLocalDateKeyFromISO(t.completedAt) === todayKey)
    .sort((a, b) => toTimeMsFromISO(b.completedAt) - toTimeMsFromISO(a.completedAt));

  return {
    todayKey,
    tomorrowKey,
    weekStartKey,
    weekEndKey,
    lateTasks,
    todayTasks,
    tomorrowTasks,
    thisWeekByDay,
    completedTodayTasks,
  };
}
