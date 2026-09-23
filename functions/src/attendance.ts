/**
 * Attendance callables — the server-authoritative half of CompanyOS.
 *
 * Every timestamp written here comes from the server clock via
 * `Timestamp.now()`, never from the caller, and `workingMinutes` is computed
 * rather than accepted. Combined with the Firestore rule that denies all
 * client writes to `attendance`, this means an employee cannot fabricate
 * their own hours.
 *
 * Each call runs in a transaction and enforces a state machine:
 *
 *   (none) --checkIn--> checked_in <--endBreak-- on_break
 *                            |  \__startBreak______^
 *                            |
 *                        checkOut
 *                            |
 *                            v
 *                       checked_out  (terminal for the day)
 */

import {CallableRequest, HttpsError, onCall} from "firebase-functions/https";
import * as logger from "firebase-functions/logger";
import {Timestamp} from "firebase-admin/firestore";

import {ATTENDANCE, USERS, db} from "./firebase";
import {AttendanceDoc, BreakEntry, UserDoc} from "./types";
import {attendanceDocId, companyDateString, minutesBetween} from "./time";

/** JSON-safe shape returned to the client. */
interface AttendanceResult {
  id: string;
  date: string;
  status: AttendanceDoc["status"];
  checkIn: string | null;
  checkOut: string | null;
  breakMinutes: number;
  workingMinutes: number;
  onBreakSince: string | null;
}

/**
 * Extracts the caller's UID or rejects the call.
 *
 * @param {CallableRequest} request The callable request.
 * @return {string} The authenticated UID.
 */
function requireUid(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError(
      "unauthenticated",
      "You must be signed in to record attendance.",
    );
  }
  return uid;
}

/**
 * Loads the caller's CompanyOS profile.
 *
 * The department is copied onto the attendance record so manager dashboards
 * can be scoped by a single indexed field instead of a per-document lookup.
 *
 * @param {string} uid The user's UID.
 * @return {Promise<UserDoc>} The profile document data.
 */
async function loadProfile(uid: string): Promise<UserDoc> {
  const snap = await db.collection(USERS).doc(uid).get();
  if (!snap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "No CompanyOS profile found for this account.",
    );
  }
  return snap.data() as UserDoc;
}

/**
 * Converts a stored attendance document into the client-facing result.
 *
 * @param {string} id The attendance document ID.
 * @param {AttendanceDoc} doc The stored document.
 * @return {AttendanceResult} JSON-safe attendance summary.
 */
function toResult(id: string, doc: AttendanceDoc): AttendanceResult {
  const openBreak = doc.breaks.find((entry) => entry.end === null);
  return {
    id,
    date: doc.date,
    status: doc.status,
    checkIn: doc.checkIn ? doc.checkIn.toDate().toISOString() : null,
    checkOut: doc.checkOut ? doc.checkOut.toDate().toISOString() : null,
    breakMinutes: doc.breakMinutes,
    workingMinutes: doc.workingMinutes,
    onBreakSince: openBreak ?
      openBreak.start.toDate().toISOString() :
      null,
  };
}

/**
 * Resolves today's attendance document reference for a user.
 *
 * @param {string} uid The user's UID.
 * @param {Timestamp} now The server instant to derive the local date from.
 * @return {{date: string, id: string}} Local date and document ID.
 */
function todayFor(uid: string, now: Timestamp): {date: string; id: string} {
  const date = companyDateString(now.toDate());
  return {date, id: attendanceDocId(uid, date)};
}

/**
 * Starts the working day. Idempotent by construction: the document ID is
 * derived from the user and date, so a double tap cannot create two records.
 */
export const checkIn = onCall(async (request): Promise<AttendanceResult> => {
  const uid = requireUid(request);
  const profile = await loadProfile(uid);
  const now = Timestamp.now();
  const {date, id} = todayFor(uid, now);
  const ref = db.collection(ATTENDANCE).doc(id);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);

    if (snap.exists) {
      const existing = snap.data() as AttendanceDoc;
      if (existing.status === "checked_out") {
        throw new HttpsError(
          "failed-precondition",
          "You have already checked out for today.",
        );
      }
      throw new HttpsError(
        "failed-precondition",
        "You are already checked in today.",
      );
    }

    const doc: AttendanceDoc = {
      userId: uid,
      department: profile.department,
      date,
      checkIn: now,
      checkOut: null,
      breaks: [],
      breakMinutes: 0,
      workingMinutes: 0,
      status: "checked_in",
      createdAt: now,
      updatedAt: now,
    };

    tx.set(ref, doc);
    return toResult(id, doc);
  });

  logger.info("attendance.checkIn", {uid, date});
  return result;
});

/** Opens a break. Only valid while actively checked in. */
export const startBreak = onCall(
  async (request): Promise<AttendanceResult> => {
    const uid = requireUid(request);
    const now = Timestamp.now();
    const {id} = todayFor(uid, now);
    const ref = db.collection(ATTENDANCE).doc(id);

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Check in before starting a break.",
        );
      }

      const doc = snap.data() as AttendanceDoc;
      if (doc.status === "on_break") {
        throw new HttpsError(
          "failed-precondition",
          "You are already on a break.",
        );
      }
      if (doc.status !== "checked_in") {
        throw new HttpsError(
          "failed-precondition",
          "You are not currently checked in.",
        );
      }

      const breaks: BreakEntry[] = [...doc.breaks, {start: now, end: null}];
      const updated: AttendanceDoc = {
        ...doc,
        breaks,
        status: "on_break",
        updatedAt: now,
      };

      tx.update(ref, {breaks, status: "on_break", updatedAt: now});
      return toResult(id, updated);
    });
  },
);

/** Closes the open break and adds its duration to `breakMinutes`. */
export const endBreak = onCall(async (request): Promise<AttendanceResult> => {
  const uid = requireUid(request);
  const now = Timestamp.now();
  const {id} = todayFor(uid, now);
  const ref = db.collection(ATTENDANCE).doc(id);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "No attendance record for today.",
      );
    }

    const doc = snap.data() as AttendanceDoc;
    if (doc.status !== "on_break") {
      throw new HttpsError(
        "failed-precondition",
        "You are not currently on a break.",
      );
    }

    const openIndex = doc.breaks.findIndex((entry) => entry.end === null);
    if (openIndex === -1) {
      throw new HttpsError(
        "internal",
        "Attendance record is marked on-break but has no open break.",
      );
    }

    const breaks = [...doc.breaks];
    const open = breaks[openIndex];
    breaks[openIndex] = {start: open.start, end: now};

    const breakMinutes = doc.breakMinutes +
      minutesBetween(open.start.toDate(), now.toDate());

    const updated: AttendanceDoc = {
      ...doc,
      breaks,
      breakMinutes,
      status: "checked_in",
      updatedAt: now,
    };

    tx.update(ref, {
      breaks,
      breakMinutes,
      status: "checked_in",
      updatedAt: now,
    });
    return toResult(id, updated);
  });
});

/**
 * Ends the working day, closing any still-open break, and computes
 * `workingMinutes` as elapsed time minus total break time.
 */
export const checkOut = onCall(async (request): Promise<AttendanceResult> => {
  const uid = requireUid(request);
  const now = Timestamp.now();
  const {date, id} = todayFor(uid, now);
  const ref = db.collection(ATTENDANCE).doc(id);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "You have not checked in today.",
      );
    }

    const doc = snap.data() as AttendanceDoc;
    if (doc.status === "checked_out") {
      throw new HttpsError(
        "failed-precondition",
        "You have already checked out for today.",
      );
    }

    // A forgotten break must not inflate paid time, so close it first.
    const breaks = doc.breaks.map((entry) => {
      return entry.end === null ? {start: entry.start, end: now} : entry;
    });

    let breakMinutes = doc.breakMinutes;
    const open = doc.breaks.find((entry) => entry.end === null);
    if (open) {
      breakMinutes += minutesBetween(open.start.toDate(), now.toDate());
    }

    const elapsed = minutesBetween(doc.checkIn.toDate(), now.toDate());
    const workingMinutes = Math.max(0, elapsed - breakMinutes);

    const updated: AttendanceDoc = {
      ...doc,
      breaks,
      breakMinutes,
      workingMinutes,
      checkOut: now,
      status: "checked_out",
      updatedAt: now,
    };

    tx.update(ref, {
      breaks,
      breakMinutes,
      workingMinutes,
      checkOut: now,
      status: "checked_out",
      updatedAt: now,
    });
    return toResult(id, updated);
  });

  logger.info("attendance.checkOut", {
    uid,
    date,
    workingMinutes: result.workingMinutes,
  });
  return result;
});
