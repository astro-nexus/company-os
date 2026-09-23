/**
 * Shared CompanyOS domain types (client side).
 *
 * These mirror `functions/src/types.ts` and the shapes validated by
 * `firestore.rules`. If you change a field here, change it in both other
 * places too — the rules are the enforcement point, not this file.
 */

import type {Timestamp} from "firebase/firestore";

export type Role = "employee" | "manager" | "admin";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type AttendanceStatus = "checked_in" | "on_break" | "checked_out";

export const ROLES: readonly Role[] = ["employee", "manager", "admin"];

export const TASK_STATUSES: readonly TaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "done",
];

export const TASK_PRIORITIES: readonly TaskPriority[] = [
  "low",
  "medium",
  "high",
  "urgent",
];

/** Department a self-signed-up user lands in until an admin moves them. */
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
  id: string;
  userId: string;
  department: string;
  /** Company-local date, "YYYY-MM-DD". Also part of the document ID. */
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
  id: string;
  title: string;
  description?: string;
  assigneeId: string;
  createdBy: string;
  department: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Percentage complete, 0-100. */
  progress: number;
  dueDate: Timestamp | null;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface ActivityDoc {
  id: string;
  userId: string;
  taskId: string;
  department: string;
  description: string;
  /** Minutes spent, 1-1440. */
  duration: number;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

/** JSON-safe payload returned by every attendance callable. */
export interface AttendanceResult {
  id: string;
  date: string;
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  breakMinutes: number;
  workingMinutes: number;
  onBreakSince: string | null;
}

/** Roles allowed to create and assign work. */
export function isManagerial(role: Role): boolean {
  return role === "manager" || role === "admin";
}

/** Formats minutes as "7h 25m" for dashboard display. */
export function formatMinutes(totalMinutes: number): string {
  const safe = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
