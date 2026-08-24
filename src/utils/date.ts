/**
 * Formats a Date as YYYY-MM-DD using its local components.
 *
 * `toISOString()` converts to UTC first, so in Japan (UTC+9) local midnight on
 * the 18th becomes 15:00 on the 17th and every day of the trip renders one day
 * early. Dates here are calendar days, not instants, so they must never take a
 * detour through UTC.
 */
function toDateKey(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime())) return dates;
  while (cur <= last) {
    dates.push(toDateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function formatDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

export function sortScheduleItems<T extends { time?: string; order: number }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return a.order - b.order;
  });
}

/** Today as YYYY-MM-DD in the device's own timezone. */
export function todayKey(): string {
  return toDateKey(new Date());
}

export function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toDateKey(d);
}

/** Whole days from today until `dateStr`. Negative once the date has passed. */
export function daysUntil(dateStr: string): number | null {
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
