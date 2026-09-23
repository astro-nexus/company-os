/**
 * User directory and role administration.
 *
 * Reads are department-scoped by the rules: an employee can only read their
 * own profile, a manager can read profiles in their own department, and an
 * admin can read all. Role and department changes are not writable from the
 * client at all — they go through the admin-only `setUserRole` callable.
 */

import {httpsCallable} from "firebase/functions";
import {collection, getDocs, query, where} from "firebase/firestore";

import {getDb, getFns} from "../firebase/app";
import {Role, UserDoc} from "../types";
import {mapDocs} from "./mapper";

export const USERS = "users";

/**
 * Members of one department, sorted by name.
 *
 * Sorting happens client-side to avoid requiring another composite index for
 * what is always a small result set.
 */
export async function getTeamMembers(
  department: string,
): Promise<UserDoc[]> {
  const q = query(
    collection(getDb(), USERS),
    where("department", "==", department),
  );
  const members = mapDocs<UserDoc>(await getDocs(q));
  return members.sort((a, b) => a.name.localeCompare(b.name));
}

/** Convenience lookup map keyed by UID, for joining names onto records. */
export function byUid(users: UserDoc[]): Record<string, UserDoc> {
  return Object.fromEntries(users.map((user) => [user.uid, user]));
}

/**
 * Assigns a role and department to a user. Admin only — enforced server-side
 * by the callable, not by this function.
 *
 * Existing attendance, task and activity records keep the department they
 * were written with, so moving someone changes visibility going forward
 * rather than retroactively.
 */
export async function setUserRole(input: {
  uid: string;
  role: Role;
  department: string;
}): Promise<void> {
  const fn = httpsCallable<typeof input, unknown>(getFns(), "setUserRole");
  await fn(input);
}
