export const getToday = (): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString().split('T')[0];
};

export const getTomorrow = (): string => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.toISOString().split('T')[0];
};

export const getThisWeekRange = (): { start: string; end: string } => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday

  // Start of week (Sunday)
  const start = new Date(now);
  start.setDate(now.getDate() - dayOfWeek);
  start.setHours(0, 0, 0, 0);

  // End of week (Saturday)
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
};

export const isDateInRange = (date: string, start: string, end: string): boolean => {
  return date >= start && date <= end;
};

export const getDayName = (dateStr: string): string => {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'long' });
};

export const isLate = (when: string): boolean => {
  const today = getToday();
  return when !== 'today' && when !== 'tomorrow' && when < today;
};

export const isToday = (when: string): boolean => {
  return when === 'today' || when === getToday();
};

export const isTomorrow = (when: string): boolean => {
  return when === 'tomorrow' || when === getTomorrow();
};

export const isThisWeek = (when: string): boolean => {
  if (when === 'today' || when === 'tomorrow') return false;

  const { start, end } = getThisWeekRange();
  const today = getToday();
  const tomorrow = getTomorrow();

  // Exclude today and tomorrow
  if (when === today || when === tomorrow) return false;

  return isDateInRange(when, start, end);
};

export const isCompletedToday = (completedAt?: string): boolean => {
  if (!completedAt) return false;
  const today = getToday();
  const completedDate = completedAt.split('T')[0];
  return completedDate === today;
};
