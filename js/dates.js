import { MONTHS, SHORT_MONTHS } from './data.js';

const DAY_MS = 86400000;

function utc(date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function thursdayOf(d) {
  const day = d.getUTCDay() || 7;
  return new Date(d.getTime() + (4 - day) * DAY_MS);
}

export function weekId(date = new Date()) {
  const thursday = thursdayOf(utc(date));
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.ceil(((thursday.getTime() - jan1) / DAY_MS + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function weekStart(id) {
  const [, y, w] = id.match(/^(\d{4})-W(\d{2})$/).map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday1 = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * DAY_MS);
  return new Date(monday1.getTime() + (w - 1) * 7 * DAY_MS);
}

export function weekDates(id) {
  const start = weekStart(id);
  return Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY_MS));
}

export function shiftWeek(id, delta) {
  const start = weekStart(id);
  const d = new Date(start.getTime() + delta * 7 * DAY_MS + 3 * DAY_MS);
  return weekId(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function weekMonth(id) {
  return thursdayOf(weekStart(id)).getUTCMonth() + 1;
}

export function weekNumber(id) {
  return Number(id.slice(-2));
}

function short(d) {
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
}

export function weekLabel(id) {
  const dates = weekDates(id);
  return `${short(dates[0])} – ${short(dates[6])}`;
}

export function dayLabel(d) {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
