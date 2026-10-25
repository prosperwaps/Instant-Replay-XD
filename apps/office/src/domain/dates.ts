/**
 * Dates as the school lives them: in Cameroon (Africa/Douala, UTC+1, no daylight saving).
 * Calendar days are ISO strings ("2026-10-23"); moments are ISO timestamps. Functions that depend on
 * "now" take it as an argument so they can be tested.
 */

export const SCHOOL_TIME_ZONE = 'Africa/Douala';

export type IsoDate = string;

const isoDayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** The calendar day of `moment` at the school. */
export function schoolDay(moment: Date): IsoDate {
  return isoDayFormat.format(moment);
}

function toUtcNoon(day: IsoDate): Date {
  return new Date(`${day}T12:00:00Z`);
}

export function addDays(day: IsoDate, n: number): IsoDate {
  const d = toUtcNoon(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcNoon(to).getTime() - toUtcNoon(from).getTime()) / 86_400_000);
}

export function isWeekend(day: IsoDate): boolean {
  const weekday = toUtcNoon(day).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** The school day a register belongs to: today on a weekday, otherwise the Friday before. */
export function latestSchoolDay(day: IsoDate): IsoDate {
  let d = day;
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}

/** The `n` most recent weekdays up to and including `day`, oldest first. */
export function recentSchoolDays(day: IsoDate, n: number): IsoDate[] {
  const out: IsoDate[] = [];
  let d = latestSchoolDay(day);
  while (out.length < n) {
    if (!isWeekend(d)) out.unshift(d);
    d = addDays(d, -1);
  }
  return out;
}

const longDay = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekdayOnly = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' });
const timeOnly = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: SCHOOL_TIME_ZONE });

/** "Friday 23 October" */
export function formatLongDay(day: IsoDate): string {
  return longDay.format(toUtcNoon(day)).replace(',', '');
}

/** "23 Oct" */
export function formatShortDay(day: IsoDate): string {
  return shortDay.format(toUtcNoon(day));
}

export function formatWeekday(day: IsoDate): string {
  return weekdayOnly.format(toUtcNoon(day));
}

/** "14:05", at the school. */
export function formatTime(moment: string): string {
  return timeOnly.format(new Date(moment));
}

/** "today", "tomorrow", "in 6 days", "yesterday", "12 days ago". */
export function relativeDay(day: IsoDate, today: IsoDate): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}

/** "Good morning", "Good afternoon" or "Good evening" at the school's clock. */
export function greeting(moment: Date): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: SCHOOL_TIME_ZONE }).format(moment));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
