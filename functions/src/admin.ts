/**
 * Admin-only callables.
 *
 * `role` and `department` are the two fields that decide what a person can
 * see, so the Firestore rules make them unwritable by any client — including
 * by the account that owns them. This module is the ONLY path that changes
 * them, and it verifies the caller is an admin by reading the caller's own
 * profile server-side rather than trusting anything in the request.
 */

import {CallableRequest, HttpsError, onCall} from "firebase-functions/https";
import * as logger from "firebase-functions/logger";
import {Timestamp} from "firebase-admin/firestore";

import {USERS, auth, db} from "./firebase";
import {ROLES, Role, UserDoc} from "./types";

interface SetUserRoleData {
  uid?: unknown;
  role?: unknown;
  department?: unknown;
}

/**
 * Asserts that the caller is signed in and holds the admin role.
 *
 * @param {CallableRequest} request The callable request.
 * @return {Promise<string>} The verified admin's UID.
 */
async function requireAdmin(request: CallableRequest): Promise<string> {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const snap = await db.collection(USERS).doc(uid).get();
  const profile = snap.data() as UserDoc | undefined;
  if (!snap.exists || profile?.role !== "admin") {
    throw new HttpsError(
      "permission-denied",
      "Only an administrator can change roles or departments.",
    );
  }
  return uid;
}

/**
 * Assigns a role and department to a user.
 *
 * Note: existing attendance, task and activity records keep the department
 * they were written with. Moving someone between departments changes what
 * they and their new manager see going forward, not retroactively.
 */
export const setUserRole = onCall(async (request) => {
  const callerUid = await requireAdmin(request);
  const data = (request.data ?? {}) as SetUserRoleData;

  const targetUid = data.uid;
  const role = data.role;
  const department = data.department;

  if (typeof targetUid !== "string" || targetUid.length === 0) {
    throw new HttpsError("invalid-argument", "`uid` must be a string.");
  }
  if (typeof role !== "string" || !ROLES.includes(role as Role)) {
    throw new HttpsError(
      "invalid-argument",
      "`role` must be one of: " + ROLES.join(", ") + ".",
    );
  }
  if (
    typeof department !== "string" ||
    department.length === 0 ||
    department.length > 60
  ) {
    throw new HttpsError(
      "invalid-argument",
      "`department` must be a string of 1-60 characters.",
    );
  }

  // Fails loudly if the UID does not correspond to a real account, rather
  // than silently creating an orphaned profile document.
  try {
    await auth.getUser(targetUid);
  } catch {
    throw new HttpsError("not-found", "No such user account.");
  }

  const ref = db.collection(USERS).doc(targetUid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError(
      "not-found",
      "That account has no CompanyOS profile yet.",
    );
  }

  await ref.update({
    role,
    department,
    updatedAt: Timestamp.now(),
  });

  logger.info("admin.setUserRole", {
    by: callerUid,
    uid: targetUid,
    role,
    department,
  });

  return {uid: targetUid, role, department};
});
