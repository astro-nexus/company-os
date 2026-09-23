/**
 * Task service — what needs to be accomplished.
 *
 * Tasks are written directly from the client and secured by field-level
 * Firestore rules:
 *   - only a manager or admin may create, reassign or delete a task;
 *   - a manager is pinned to their own department, so they cannot assign
 *     work across teams;
 *   - the assignee may change ONLY `status` and `progress` — which is why
 *     `updateTaskProgress` exists separately from `updateTask`.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import type {Timestamp} from "firebase/firestore";

import {getDb} from "../firebase/app";
import {TaskDoc, TaskPriority, TaskStatus, UserDoc} from "../types";
import {mapDoc, mapDocs} from "./mapper";

export const TASKS = "tasks";

export interface CreateTaskInput {
  title: string;
  description?: string;
  assigneeId: string;
  priority: TaskPriority;
  dueDate?: Date | null;
  status?: TaskStatus;
  progress?: number;
}

/**
 * Creates and assigns a task.
 *
 * @param author The signed-in manager/admin profile. Its `department` is
 *   copied onto the task, which is both what scopes manager visibility and
 *   what the rules check — passing someone else's profile will be rejected.
 */
export async function createTask(
  author: UserDoc,
  input: CreateTaskInput,
): Promise<string> {
  const ref = await addDoc(collection(getDb(), TASKS), {
    title: input.title,
    description: input.description ?? "",
    assigneeId: input.assigneeId,
    createdBy: author.uid,
    department: author.department,
    status: input.status ?? "todo",
    priority: input.priority,
    progress: input.progress ?? 0,
    dueDate: input.dueDate ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * The assignee's progress update — the only task write an employee may make.
 *
 * Restricted to `status` and `progress` on purpose: the rules reject an update
 * that touches any other field from a non-manager.
 */
export async function updateTaskProgress(
  taskId: string,
  changes: {status?: TaskStatus; progress?: number},
): Promise<void> {
  const patch: Record<string, unknown> = {updatedAt: serverTimestamp()};
  if (changes.status !== undefined) {
    patch.status = changes.status;
  }
  if (changes.progress !== undefined) {
    patch.progress = Math.max(0, Math.min(100, Math.round(changes.progress)));
  }
  await updateDoc(doc(getDb(), TASKS, taskId), patch);
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  assigneeId?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  progress?: number;
  dueDate?: Date | Timestamp | null;
}

/** Full task edit. Managers (own department) and admins only. */
export async function updateTask(
  taskId: string,
  changes: UpdateTaskInput,
): Promise<void> {
  const patch: Record<string, unknown> = {updatedAt: serverTimestamp()};
  for (const [key, value] of Object.entries(changes)) {
    if (value !== undefined) {
      patch[key] = key === "progress" ?
        Math.max(0, Math.min(100, Math.round(value as number))) :
        value;
    }
  }
  await updateDoc(doc(getDb(), TASKS, taskId), patch);
}

/** Deletes a task. Managers (own department) and admins only. */
export function deleteTask(taskId: string): Promise<void> {
  return deleteDoc(doc(getDb(), TASKS, taskId));
}

export async function getTask(taskId: string): Promise<TaskDoc | null> {
  return mapDoc<TaskDoc>(await getDoc(doc(getDb(), TASKS, taskId)));
}

/** Tasks assigned to one employee, newest first. */
export async function getMyTasks(
  userId: string,
  status?: TaskStatus,
): Promise<TaskDoc[]> {
  const base = collection(getDb(), TASKS);
  const q = status ?
    query(
      base,
      where("assigneeId", "==", userId),
      where("status", "==", status),
      orderBy("createdAt", "desc"),
    ) :
    query(
      base,
      where("assigneeId", "==", userId),
      orderBy("createdAt", "desc"),
    );
  return mapDocs<TaskDoc>(await getDocs(q));
}

/** Live view of one employee's tasks. Returns the unsubscribe function. */
export function watchMyTasks(
  userId: string,
  callback: (tasks: TaskDoc[]) => void,
): () => void {
  const q = query(
    collection(getDb(), TASKS),
    where("assigneeId", "==", userId),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(q, (snap) => callback(mapDocs<TaskDoc>(snap)));
}

/**
 * Tasks across a department — the manager dashboard view.
 *
 * The `department` filter is mandatory: rules are not filters, so an
 * unscoped query would match documents the caller cannot read and fail.
 */
export async function getTeamTasks(
  department: string,
  filters: {status?: TaskStatus; assigneeId?: string} = {},
): Promise<TaskDoc[]> {
  const base = collection(getDb(), TASKS);
  const constraints = [where("department", "==", department)];
  if (filters.status) {
    constraints.push(where("status", "==", filters.status));
  }
  if (filters.assigneeId) {
    constraints.push(where("assigneeId", "==", filters.assigneeId));
  }
  const q = query(base, ...constraints, orderBy("createdAt", "desc"));
  return mapDocs<TaskDoc>(await getDocs(q));
}

/** Live department task board. Returns the unsubscribe function. */
export function watchTeamTasks(
  department: string,
  callback: (tasks: TaskDoc[]) => void,
): () => void {
  const q = query(
    collection(getDb(), TASKS),
    where("department", "==", department),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(q, (snap) => callback(mapDocs<TaskDoc>(snap)));
}

/** Counts tasks by status — a small helper for dashboard summary tiles. */
export function summariseByStatus(
  tasks: TaskDoc[],
): Record<TaskStatus, number> {
  const summary: Record<TaskStatus, number> = {
    todo: 0,
    in_progress: 0,
    blocked: 0,
    done: 0,
  };
  for (const task of tasks) {
    summary[task.status] += 1;
  }
  return summary;
}
