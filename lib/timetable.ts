/**
 * Shared timetable helpers (day names, time formatting, grouping).
 * Times are stored as Postgres `time` values ("09:00:00") and rendered
 * as 12-hour clock labels.
 */

export const DAY_NAMES = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;

/** Map a JS Date.getDay() value (0=Sun..6=Sat) to a timetable day (1=Mon..5=Fri). */
export function jsDayToTimetableDay(jsDay: number): number | null {
  return jsDay >= 1 && jsDay <= 5 ? jsDay : null;
}

export function todayTimetableDay(now: Date = new Date()): number | null {
  return jsDayToTimetableDay(now.getDay());
}

/** "09:00:00" | "09:00" -> "9:00 AM" */
export function formatTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${suffix}`;
}

export function formatRange(start: string, end: string): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export interface TimetableEntry {
  id: string;
  course_code: string;
  course_title: string;
  room: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

/** Group entries by day (1..5); returns array indexed 1..5 of sorted arrays. */
export function groupByDay<T extends TimetableEntry>(rows: T[]): (T[] | null)[] {
  const days: (T[] | null)[] = [null, [], [], [], [], []];
  for (const r of rows) {
    const d = r.day_of_week;
    if (d >= 1 && d <= 5) days[d]!.push(r);
  }
  for (let d = 1; d <= 5; d++) {
    days[d]!.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }
  return days;
}

/** HH:MM overlap check for two [start,end) ranges given as "HH:MM[:SS]". */
export function timesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const norm = (t: string) => t.slice(0, 5);
  return norm(aStart) < norm(bEnd) && norm(bStart) < norm(aEnd);
}

/** Minutes since midnight for a "HH:MM[:SS]" string. */
export function minutesOf(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Current local minutes-since-midnight. */
export function nowMinutes(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** Local date formatted as YYYY-MM-DD. */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type SessionState = "done" | "live" | "upcoming";

/** Whether a session is past, currently running, or upcoming at `nowMin`. */
export function sessionState(
  startMin: number,
  endMin: number,
  nowMin: number,
): SessionState {
  if (nowMin >= endMin) return "done";
  if (nowMin >= startMin) return "live";
  return "upcoming";
}
