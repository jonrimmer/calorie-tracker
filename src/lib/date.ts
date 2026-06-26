import type { ISODate } from "../types";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric"
});

export function toISODate(date = new Date()): ISODate {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function parseISODate(date: ISODate): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date: ISODate, days: number): ISODate {
  const next = parseISODate(date);
  next.setDate(next.getDate() + days);
  return toISODate(next);
}

function utcDayTime(date: ISODate): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function formatRelativeDayLabel(date: ISODate, relativeTo = toISODate()): string {
  const dayDifference = Math.round((utcDayTime(date) - utcDayTime(relativeTo)) / 86_400_000);

  if (dayDifference === 0) {
    return "Today";
  }

  if (dayDifference === -1) {
    return "Yesterday";
  }

  if (dayDifference === 1) {
    return "Tomorrow";
  }

  if (dayDifference < 0) {
    return `${Math.abs(dayDifference)} days ago`;
  }

  return `In ${dayDifference} days`;
}

export function startOfWeek(date: ISODate): ISODate {
  const parsed = parseISODate(date);
  const day = parsed.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  parsed.setDate(parsed.getDate() + mondayOffset);
  return toISODate(parsed);
}

export function getWeekDates(date: ISODate): ISODate[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function formatShortDate(date: ISODate): string {
  return dateFormatter.format(parseISODate(date));
}

export function formatWeekRange(date: ISODate): string {
  const week = getWeekDates(date);
  return `${formatShortDate(week[0])} - ${formatShortDate(week[6])}`;
}
