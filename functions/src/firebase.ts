/**
 * Single Firebase Admin initialisation for every function in this codebase.
 *
 * The Admin SDK bypasses Firestore Security Rules, which is exactly why the
 * `attendance` collection is client-read-only: these functions are the only
 * writer, so check-in/out times always come from the server clock.
 */

import {getApps, initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
export const auth = getAuth();

export const USERS = "users";
export const ATTENDANCE = "attendance";
export const TASKS = "tasks";
export const ACTIVITIES = "activities";
