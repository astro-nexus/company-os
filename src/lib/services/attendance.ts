/**
 * Attendance service.
 *
 * All four mutations are callable Cloud Functions, never direct writes: the
 * `attendance` collection denies client writes entirely so working hours
 * cannot be forged. Reads go straight to Firestore and are scoped by rules to
 * the user's own records, or to their department if they are a manager.
 */

import {httpsCallable} from "firebase/functions";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as limitTo,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import {getDb, getFns} from "../firebase/app";
import {attendanceDocId, companyDateString} from "../date";
import {AttendanceDoc, AttendanceResult} from "../types";
import {mapDoc, mapDocs} from "./mapper";

export const ATTENDANCE = "attendance";

function call(name: string): () => Promise<AttendanceResult> {
  const fn = httpsCallable<undefined, AttendanceResult>(getFns(), name);
  return async () => (await fn()).data;
}

/** Starts the working day. Rejects if already checked in. */
export const checkIn = call("checkIn");

/** Ends the working day and returns the computed working minutes. */
export const checkOut = call("checkOut");

/** Opens a break. Only valid while actively checked in. */
export const startBreak = call("startBreak");

/** Closes the open break. Only valid while on a break. */
export const endBreak = call("endBreak");

/** Reads the signed-in user's attendance record for today, if any. */
export async function getTodayAttendance(
  userId: string,
): Promise<AttendanceDoc | null> {
  const id = attendanceDocId(userId, companyDateString());
  return mapDoc<AttendanceDoc>(await getDoc(doc(getDb(), ATTENDANCE, id)));
}

/**
 * Live-subscribes to today's attendance record so the dashboard's
 * check-in button reflects reality without polling.
 */
export function watchTodayAttendance(
  userId: string,
  callback: (record: AttendanceDoc | null) => void,
): () => void {
  const id = attendanceDocId(userId, companyDateString());
  return onSnapshot(doc(getDb(), ATTENDANCE, id), (snap) => {
    callback(mapDoc<AttendanceDoc>(snap));
  });
}

/** Most recent attendance records for one user, newest first. */
export async function getMyAttendance(
  userId: string,
  max = 30,
): Promise<AttendanceDoc[]> {
  const q = query(
    collection(getDb(), ATTENDANCE),
    where("userId", "==", userId),
    orderBy("date", "desc"),
    limitTo(max),
  );
  return mapDocs<AttendanceDoc>(await getDocs(q));
}

/** Attendance for one user across an inclusive "YYYY-MM-DD" range. */
export async function getMyAttendanceRange(
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<AttendanceDoc[]> {
  const q = query(
    collection(getDb(), ATTENDANCE),
    where("userId", "==", userId),
    where("date", ">=", fromDate),
    where("date", "<=", toDate),
    orderBy("date", "desc"),
  );
  return mapDocs<AttendanceDoc>(await getDocs(q));
}

/**
 * Attendance for a whole department on one day — the manager dashboard's
 * "who is in today" view.
 *
 * The `department` filter is required: rules are not filters, so a query
 * without it would match records the caller cannot read and fail entirely.
 */
export async function getTeamAttendance(
  department: string,
  date: string = companyDateString(),
): Promise<AttendanceDoc[]> {
  const q = query(
    collection(getDb(), ATTENDANCE),
    where("department", "==", department),
    where("date", "==", date),
  );
  return mapDocs<AttendanceDoc>(await getDocs(q));
}

/** Department attendance across an inclusive date range, newest first. */
export async function getTeamAttendanceRange(
  department: string,
  fromDate: string,
  toDate: string,
): Promise<AttendanceDoc[]> {
  const q = query(
    collection(getDb(), ATTENDANCE),
    where("department", "==", department),
    where("date", ">=", fromDate),
    where("date", "<=", toDate),
    orderBy("date", "desc"),
  );
  return mapDocs<AttendanceDoc>(await getDocs(q));
}

/** Live department attendance for one day. Returns the unsubscribe function. */
export function watchTeamAttendance(
  department: string,
  date: string,
  callback: (records: AttendanceDoc[]) => void,
): () => void {
  const q = query(
    collection(getDb(), ATTENDANCE),
    where("department", "==", department),
    where("date", "==", date),
  );
  return onSnapshot(q, (snap) => callback(mapDocs<AttendanceDoc>(snap)));
}
