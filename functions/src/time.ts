/**
 * Company-local date handling for attendance.
 *
 * Attendance is bucketed into one document per user per LOCAL working day, so
 * the day boundary must follow the company's timezone rather than UTC.
 *
 * Set COMPANY_TIMEZONE (an IANA zone such as "Asia/Yangon" or "Europe/London")
 * in the functions environment to match where the team actually works.
 */

export const COMPANY_TIMEZONE = process.env.COMPANY_TIMEZONE || "Asia/Yangon";

/**
 * Formats an instant as the company-local calendar date.
 *
 * Uses the en-CA locale because it renders as ISO-style "YYYY-MM-DD", which
 * sorts lexicographically and is therefore safe to use in document IDs and
 * range queries.
 *
 * @param {Date} when The instant to format.
 * @param {string} timeZone IANA timezone name.
 * @return {string} The local date as "YYYY-MM-DD".
 */
export function companyDateString(
  when: Date,
  timeZone: string = COMPANY_TIMEZONE,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
}

/**
 * Whole minutes elapsed between two instants, never negative.
 *
 * Clock skew or an out-of-order write should shorten a span to zero rather
 * than produce negative working time.
 *
 * @param {Date} from Start instant.
 * @param {Date} to End instant.
 * @return {number} Elapsed whole minutes, floored at 0.
 */
export function minutesBetween(from: Date, to: Date): number {
  const diffMs = to.getTime() - from.getTime();
  if (diffMs <= 0) {
    return 0;
  }
  return Math.floor(diffMs / 60000);
}

/**
 * Builds the deterministic attendance document ID for a user and date.
 *
 * A deterministic ID makes check-in idempotent: a double-tap cannot create two
 * attendance records for the same day.
 *
 * @param {string} userId The employee's UID.
 * @param {string} date Company-local date, "YYYY-MM-DD".
 * @return {string} The attendance document ID.
 */
export function attendanceDocId(userId: string, date: string): string {
  return userId + "_" + date;
}
