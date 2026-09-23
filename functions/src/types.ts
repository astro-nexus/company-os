/**
 * Shared CompanyOS domain types (server side).
 *
 * These mirror `src/lib/types.ts` on the client. Keep the two in sync — the
 * Firestore Security Rules validate the same shapes.
 */

import {Timestamp} from "firebase-admin/firestore";

export type Role = "employee" | "manager" | "admin";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type AttendanceStatus = "checked_in" | "on_break" | "checked_out";

export const ROLES: Role[] = ["employee", "manager", "admin"];

export const TASK_STATUSES: TaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "done",
];

export const TASK_PRIORITIES: TaskPriority[] = [
  "low",
  "medium",
  "high",
  "urgent",
];

/** Department assigned to a self-signed-up user until an admin moves them. */
export const UNASSIGNED_DEPARTMENT = "Unassigned";

export interface UserDoc {
  uid: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  photoURL?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

/** One break within a working day. `end` is null while the break is open. */
export interface BreakEntry {
  start: Timestamp;
  end: Timestamp | null;
}

export interface AttendanceDoc {
  userId: string;
  department: string;
  /** Local company date, "YYYY-MM-DD". Also part of the document ID. */
  date: string;
  checkIn: Timestamp;
  checkOut: Timestamp | null;
  breaks: BreakEntry[];
  breakMinutes: number;
  workingMinutes: number;
  status: AttendanceStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TaskDoc {
  title: string;
  description?: string;
  assigneeId: string;
  createdBy: string;
  department: string;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  dueDate: Timestamp | null;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface ActivityDoc {
  userId: string;
  taskId: string;
  department: string;
  description: string;
  duration: number;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}
