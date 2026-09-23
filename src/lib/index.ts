/**
 * CompanyOS data layer — public surface.
 *
 * Framework-agnostic: plain TypeScript over the Firebase Web SDK, so it drops
 * into Next.js, Vite/React, or anything else without modification.
 *
 * Quick start:
 *   import {initFirebase, signIn, getMyTasks} from "@/lib";
 */

export * from "./types";
export * from "./date";
export * from "./firebase/config";
export * from "./firebase/app";

export * as authService from "./services/auth";
export * as attendanceService from "./services/attendance";
export * as taskService from "./services/tasks";
export * as activityService from "./services/activities";
export * as userService from "./services/users";
