/**
 * Activity service — what the employee actually did while working on a task.
 *
 * The product distinction that matters: a Task is the objective, an Activity
 * is a record of real work performed against it. Activities are append-heavy
 * and owned by the person who did the work.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import {getDb} from "../firebase/app";
import {ActivityDoc, UserDoc} from "../types";
import {mapDocs} from "./mapper";

export const ACTIVITIES = "activities";

export interface CreateActivityInput {
  taskId: string;
  description: string;
  /** Minutes spent, 1-1440. */
  duration: number;
}

/**
 * Logs work against a task.
 *
 * @param author The signed-in user's profile. `userId` and `department` are
 *   taken from it and both are checked by the rules against the caller's real
 *   identity, so an activity cannot be logged on someone else's behalf or
 *   filed into another team's feed.
 */
export async function createActivity(
  author: UserDoc,
  input: CreateActivityInput,
): Promise<string> {
  const ref = await addDoc(collection(getDb(), ACTIVITIES), {
    userId: author.uid,
    taskId: input.taskId,
    department: author.department,
    description: input.description,
    duration: Math.max(1, Math.min(1440, Math.round(input.duration))),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Edits an activity the caller owns. Only text and duration are editable. */
export async function updateActivity(
  activityId: string,
  changes: {description?: string; duration?: number},
): Promise<void> {
  const patch: Record<string, unknown> = {updatedAt: serverTimestamp()};
  if (changes.description !== undefined) {
    patch.description = changes.description;
  }
  if (changes.duration !== undefined) {
    patch.duration = Math.max(
      1,
      Math.min(1440, Math.round(changes.duration)),
    );
  }
  await updateDoc(doc(getDb(), ACTIVITIES, activityId), patch);
}

/** Deletes an activity. Owner or admin only. */
export function deleteActivity(activityId: string): Promise<void> {
  return deleteDoc(doc(getDb(), ACTIVITIES, activityId));
}

/** One employee's activity log, newest first. */
export async function getMyActivities(
  userId: string,
  max?: number,
): Promise<ActivityDoc[]> {
  const q = query(
    collection(getDb(), ACTIVITIES),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
  );
  const all = mapDocs<ActivityDoc>(await getDocs(q));
  return max ? all.slice(0, max) : all;
}

/**
 * Everything logged against one task, newest first.
 *
 * `scope` is REQUIRED and is not optional sugar. For a `list`, Firestore binds
 * `resource.data` to only the fields the query constrains — that is how
 * "rules are not filters" is enforced. The activities read rule tests
 * `resource.data.userId` and `resource.data.department`, so a query filtered
 * on `taskId` alone leaves both undefined and is rejected outright.
 *
 * Pass `{userId}` to see your own work on a task, or `{department}` (from the
 * task itself) as a manager or admin viewing the whole team's work on it.
 */
export async function getTaskActivities(
  taskId: string,
  scope: {userId: string} | {department: string},
): Promise<ActivityDoc[]> {
  const scopeConstraint =
    "userId" in scope ?
      where("userId", "==", scope.userId) :
      where("department", "==", scope.department);

  const q = query(
    collection(getDb(), ACTIVITIES),
    where("taskId", "==", taskId),
    scopeConstraint,
    orderBy("createdAt", "desc"),
  );
  return mapDocs<ActivityDoc>(await getDocs(q));
}

/**
 * Convenience wrapper that picks the right scope for a viewer.
 *
 * An admin's own department ("Operations") is not the task's, so the task's
 * department must be supplied for managerial viewers.
 */
export function scopeForViewer(
  viewer: {uid: string; role: string},
  taskDepartment: string,
): {userId: string} | {department: string} {
  return viewer.role === "employee" ?
    {userId: viewer.uid} :
    {department: taskDepartment};
}

/**
 * Department-wide activity feed for the manager dashboard.
 *
 * The `department` filter is mandatory — rules are not filters.
 */
export async function getTeamActivities(
  department: string,
  filters: {userId?: string} = {},
): Promise<ActivityDoc[]> {
  const constraints = [where("department", "==", department)];
  if (filters.userId) {
    constraints.push(where("userId", "==", filters.userId));
  }
  const q = query(
    collection(getDb(), ACTIVITIES),
    ...constraints,
    orderBy("createdAt", "desc"),
  );
  return mapDocs<ActivityDoc>(await getDocs(q));
}

/** Live department activity feed. Returns the unsubscribe function. */
export function watchTeamActivities(
  department: string,
  callback: (activities: ActivityDoc[]) => void,
): () => void {
  const q = query(
    collection(getDb(), ACTIVITIES),
    where("department", "==", department),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(q, (snap) => callback(mapDocs<ActivityDoc>(snap)));
}

/** Total minutes logged across a set of activities. */
export function totalMinutes(activities: ActivityDoc[]): number {
  return activities.reduce((sum, activity) => sum + activity.duration, 0);
}
