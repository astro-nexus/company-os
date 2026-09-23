/**
 * Authentication and profile access.
 *
 * Sign-up deliberately writes `role: "employee"` and
 * `department: "Unassigned"`. Those exact values are hardcoded in
 * `firestore.rules` for profile creation — a client cannot write anything
 * else, so a new account can never grant itself elevated access or place
 * itself inside another team. An admin moves people with the `setUserRole`
 * callable.
 */

import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import {getDb, getFirebaseAuth} from "../firebase/app";
import {UNASSIGNED_DEPARTMENT, UserDoc} from "../types";

export const USERS = "users";

/** Signs in an existing account. */
export async function signIn(
  email: string,
  password: string,
): Promise<User> {
  const credential = await signInWithEmailAndPassword(
    getFirebaseAuth(),
    email,
    password,
  );
  return credential.user;
}

/**
 * Creates an account and its CompanyOS profile.
 *
 * The profile document is written by the client, but the rules pin `uid`,
 * `role` and `department`, so this is safe.
 */
export async function signUp(
  email: string,
  password: string,
  name: string,
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(
    getFirebaseAuth(),
    email,
    password,
  );
  const user = credential.user;

  await updateProfile(user, {displayName: name});

  await setDoc(doc(getDb(), USERS, user.uid), {
    uid: user.uid,
    name,
    email,
    role: "employee",
    department: UNASSIGNED_DEPARTMENT,
    createdAt: serverTimestamp(),
  });

  return user;
}

export function signOutUser(): Promise<void> {
  return signOut(getFirebaseAuth());
}

export function sendPasswordReset(email: string): Promise<void> {
  return sendPasswordResetEmail(getFirebaseAuth(), email);
}

/** Subscribes to sign-in state. Returns the unsubscribe function. */
export function onAuthChange(
  callback: (user: User | null) => void,
): () => void {
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

/** Reads a CompanyOS profile, or null if it does not exist. */
export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(doc(getDb(), USERS, uid));
  return snap.exists() ? (snap.data() as UserDoc) : null;
}

/** Subscribes to a profile document. Returns the unsubscribe function. */
export function watchUserDoc(
  uid: string,
  callback: (profile: UserDoc | null) => void,
): () => void {
  return onSnapshot(doc(getDb(), USERS, uid), (snap) => {
    callback(snap.exists() ? (snap.data() as UserDoc) : null);
  });
}

/**
 * Updates the signed-in user's own display name and/or photo.
 *
 * These are the only profile fields a user may change. Attempting to include
 * `role`, `department` or `email` here will be rejected by the rules.
 */
export async function updateMyProfile(
  uid: string,
  changes: {name?: string; photoURL?: string},
): Promise<void> {
  const patch: Record<string, unknown> = {updatedAt: serverTimestamp()};
  if (changes.name !== undefined) {
    patch.name = changes.name;
  }
  if (changes.photoURL !== undefined) {
    patch.photoURL = changes.photoURL;
  }
  await updateDoc(doc(getDb(), USERS, uid), patch);
}
