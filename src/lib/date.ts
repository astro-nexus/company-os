/**
 * Company-local date helpers.
 *
 * Mirrors `functions/src/time.ts`. Both sides must agree on the timezone or
 * they will disagree about which day an attendance record belongs to.
 */

import {COMPANY_TIMEZONE} from "./firebase/config";

/**
 * Formats an instant as the company-local calendar date, "YYYY-MM-DD".
 *
 * The en-CA locale renders ISO-style dates, which sort lexicographically and
 * are therefore safe in document IDs and range queries.
 */
export function companyDateString(
  when: Date = new Date(),
  timeZone: string = COMPANY_TIMEZONE,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
}

/** The attendance document ID for a given user and company-local date. */
export function attendanceDocId(userId: string, date: string): string {
  return `${userId}_${date}`;
}

/** Company-local date N days before `from`, as "YYYY-MM-DD". */
export function daysAgo(days: number, from: Date = new Date()): string {
  const shifted = new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
  return companyDateString(shifted);
}
