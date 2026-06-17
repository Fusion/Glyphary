/**
 * Calendar note naming helpers.
 *
 * Responsibilities:
 * - Convert dates into Glyphary calendar note titles, paths, and stable date keys.
 * - Parse existing calendar note paths back into date keys for drawer dot markers.
 *
 * Contracts:
 * - Calendar filenames are human-readable and intentionally include weekday validation.
 * - Parsing must reject mismatched weekday/month/day combinations rather than guessing.
 */

import { calendarDirectory, monthLabels, weekdayLabels } from "./defaults.js";

export function ordinalSuffix(day: number) {
  if (day >= 11 && day <= 13) {
    return "th";
  }

  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export function calendarDayTitle(date: Date) {
  const weekday = weekdayLabels[date.getDay()];
  const month = monthLabels[date.getMonth()];
  const day = date.getDate();

  return `${weekday}, ${month} ${day}${ordinalSuffix(day)} ${date.getFullYear()}`;
}

export function calendarDayRelativePath(date: Date) {
  // Calendar notes intentionally use the human-readable title as the file
  // name. Keep this format aligned with calendarPathDateKey so existing-note
  // dots can be derived from disk without a sidecar index.
  return `${calendarDirectory}/${calendarDayTitle(date)}.md`;
}

export function calendarDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

export function calendarPathDateKey(relativePath: string) {
  const fileName = relativePath.split("/").pop() ?? "";
  const match = fileName.match(
    /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})(?:st|nd|rd|th)? (\d{4})\.md$/,
  );

  if (!match) {
    return null;
  }

  const [, weekday, monthLabel, dayText, yearText] = match;
  const monthIndex = monthLabels.indexOf(monthLabel);
  const day = Number(dayText);
  const year = Number(yearText);
  const date = new Date(year, monthIndex, day);

  if (
    monthIndex < 0 ||
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day ||
    weekdayLabels[date.getDay()] !== weekday
  ) {
    return null;
  }

  return calendarDateKey(date);
}

export function monthTitle(date: Date) {
  return `${date.toLocaleString(undefined, { month: "long" })} ${date.getFullYear()}`;
}

export function sameCalendarDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
