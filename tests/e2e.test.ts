/**
 * End-to-end test: Firebase Authentication + the callable API + rules,
 * exercised through the real src/lib service layer the frontend imports.
 *
 * Runs entirely against the local emulator suite, so it needs no Google
 * credentials and cannot touch live data.
 *
 *   npm run test:e2e
 *
 * `firebase emulators:exec` exports FIREBASE_AUTH_EMULATOR_HOST and
 * FIRESTORE_EMULATOR_HOST into this process, which is what lets the Admin SDK
 * below run without any service-account key.
 */

import {deleteApp, getApps as adminApps, initializeApp as initAdmin} from
  "firebase-admin/app";
import {getAuth as adminAuth} from "firebase-admin/auth";
import {Timestamp, getFirestore as adminDb} from "firebase-admin/firestore";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {connectEmulators, initFirebase} from "../src/lib/firebase/app";
import * as authService from "../src/lib/services/auth";
import * as attendanceService from "../src/lib/services/attendance";
import * as taskService from "../src/lib/services/tasks";
import * as activityService from "../src/lib/services/activities";
import * as userService from "../src/lib/services/users";
import type {UserDoc} from "../src/lib/types";

const PROJECT_ID = "studio-8326696944-c3f9a";
const PASSWORD = "Password123!";

const ENGINEERING = "Engineering";
const DESIGN = "Design";

const EMP = {uid: "e2e-emp", email: "e2e.emp@nexus-code.studio"};
const MGR = {uid: "e2e-mgr", email: "e2e.mgr@nexus-code.studio"};
const OTHER = {uid: "e2e-other", email: "e2e.other@nexus-code.studio"};
const ADMIN = {uid: "e2e-admin", email: "e2e.admin@nexus-code.studio"};

/** Returns the error code of a rejected promise, or "OK" if it resolved. */
async function codeOf(action: Promise<unknown>): Promise<string> {
  try {
    await action;
    return "OK";
  } catch (error) {
    const code = (error as {code?: string}).code;
    return code ?? (error as Error).message;
  }
}

async function seedPerson(
  person: {uid: string; email: string},
  role: string,
  department: string,
): Promise<void> {
  const auth = adminAuth();
  try {
    await auth.updateUser(person.uid, {
      email: person.email,
      password: PASSWORD,
      emailVerified: true,
    });
  } catch {
    await auth.createUser({
      uid: person.uid,
      email: person.email,
      password: PASSWORD,
      emailVerified: true,
    });
  }
  await adminDb()
    .collection("users")
    .doc(person.uid)
    .set({
      uid: person.uid,
      name: `E2E ${role}`,
      email: person.email,
      role,
      department,
      createdAt: Timestamp.now(),
    });
}

beforeAll(async () => {
  initFirebase({
    apiKey: "emulator-key",
    authDomain: "localhost",
    projectId: PROJECT_ID,
    storageBucket: `${PROJECT_ID}.appspot.com`,
    messagingSenderId: "534950805700",
    appId: "1:534950805700:web:e2e",
  });
  connectEmulators();

  if (adminApps().length === 0) {
    initAdmin({projectId: PROJECT_ID});
  }

  await seedPerson(EMP, "employee", ENGINEERING);
  await seedPerson(MGR, "manager", ENGINEERING);
  await seedPerson(OTHER, "employee", DESIGN);
  await seedPerson(ADMIN, "admin", "Operations");
}, 60000);

afterAll(async () => {
  await authService.signOutUser().catch(() => undefined);
  await Promise.all(adminApps().map((app) => deleteApp(app)));
});

// ---------------------------------------------------------------------------

describe("Authentication", () => {
  it("rejects a wrong password", async () => {
    const code = await codeOf(authService.signIn(EMP.email, "wrong-password"));
    expect(code).toMatch(/auth\/(invalid-credential|wrong-password)/);
  });

  it("signs in a seeded employee and loads their profile", async () => {
    const user = await authService.signIn(EMP.email, PASSWORD);
    expect(user.uid).toBe(EMP.uid);

    const profile = await authService.getUserDoc(EMP.uid);
    expect(profile?.role).toBe("employee");
    expect(profile?.department).toBe(ENGINEERING);
  });

  it("creates a locked-down profile on self sign-up", async () => {
    const email = `e2e.new.${Date.now()}@nexus-code.studio`;
    const user = await authService.signUp(email, PASSWORD, "New Joiner");

    const profile = await authService.getUserDoc(user.uid);
    // The rules hardcode these two values; a new account cannot pick them.
    expect(profile?.role).toBe("employee");
    expect(profile?.department).toBe("Unassigned");
  });

  it("signs out", async () => {
    await authService.signOutUser();
    const code = await codeOf(authService.getUserDoc(EMP.uid));
    expect(code).toBe("permission-denied");
  });
});

describe("Attendance callables", () => {
  let profile: UserDoc;

  beforeAll(async () => {
    await authService.signIn(EMP.email, PASSWORD);
    profile = (await authService.getUserDoc(EMP.uid)) as UserDoc;
    // Clear any record left by a previous run so the state machine starts clean.
    const today = (await import("../src/lib/date")).companyDateString();
    await adminDb().collection("attendance").doc(`${EMP.uid}_${today}`)
      .delete()
      .catch(() => undefined);
  });

  it("rejects endBreak before any break has started", async () => {
    const code = await codeOf(attendanceService.endBreak());
    expect(code).toBe("functions/failed-precondition");
  });

  it("walks check in -> break -> back -> check out", async () => {
    const checkedIn = await attendanceService.checkIn();
    expect(checkedIn.status).toBe("checked_in");
    expect(checkedIn.checkIn).not.toBeNull();

    const onBreak = await attendanceService.startBreak();
    expect(onBreak.status).toBe("on_break");
    expect(onBreak.onBreakSince).not.toBeNull();

    const backAtWork = await attendanceService.endBreak();
    expect(backAtWork.status).toBe("checked_in");
    expect(backAtWork.onBreakSince).toBeNull();

    const done = await attendanceService.checkOut();
    expect(done.status).toBe("checked_out");
    expect(done.checkOut).not.toBeNull();

    // The server's arithmetic, verified against the timestamps it returned.
    const elapsed = Math.floor(
      (Date.parse(done.checkOut as string) -
        Date.parse(done.checkIn as string)) / 60000,
    );
    expect(done.workingMinutes).toBe(
      Math.max(0, elapsed - done.breakMinutes),
    );
  });

  it("rejects a second check-in on the same day", async () => {
    const code = await codeOf(attendanceService.checkIn());
    expect(code).toBe("functions/failed-precondition");
  });

  it("stores a record the employee can read back", async () => {
    const record = await attendanceService.getTodayAttendance(EMP.uid);
    expect(record?.userId).toBe(EMP.uid);
    expect(record?.department).toBe(profile.department);
    expect(record?.status).toBe("checked_out");
  });

  it("refuses a direct client write to attendance", async () => {
    const {doc, updateDoc} = await import("firebase/firestore");
    const {getDb} = await import("../src/lib/firebase/app");
    const today = (await import("../src/lib/date")).companyDateString();
    const code = await codeOf(
      updateDoc(doc(getDb(), "attendance", `${EMP.uid}_${today}`), {
        workingMinutes: 600,
      }),
    );
    expect(code).toBe("permission-denied");
  });
});

describe("Tasks and activities", () => {
  let taskId: string;

  it("lets a manager create and assign work", async () => {
    await authService.signOutUser();
    await authService.signIn(MGR.email, PASSWORD);
    const managerProfile = (await authService.getUserDoc(MGR.uid)) as UserDoc;

    taskId = await taskService.createTask(managerProfile, {
      title: "Wire up the employee dashboard",
      description: "Check-in card plus assigned task list",
      assigneeId: EMP.uid,
      priority: "high",
    });
    expect(taskId).toBeTruthy();

    const teamTasks = await taskService.getTeamTasks(ENGINEERING);
    expect(teamTasks.some((task) => task.id === taskId)).toBe(true);
  });

  it("lets the assignee report progress but not rewrite the task", async () => {
    await authService.signOutUser();
    await authService.signIn(EMP.email, PASSWORD);

    const mine = await taskService.getMyTasks(EMP.uid);
    expect(mine.some((task) => task.id === taskId)).toBe(true);

    await taskService.updateTaskProgress(taskId, {
      status: "in_progress",
      progress: 40,
    });
    const updated = await taskService.getTask(taskId);
    expect(updated?.progress).toBe(40);
    expect(updated?.status).toBe("in_progress");

    const code = await codeOf(
      taskService.updateTask(taskId, {title: "Hijacked"}),
    );
    expect(code).toBe("permission-denied");
  });

  it("lets an employee log an activity against the task", async () => {
    const profile = (await authService.getUserDoc(EMP.uid)) as UserDoc;
    await activityService.createActivity(profile, {
      taskId,
      description: "Built the check-in card and wired it to the callable",
      duration: 95,
    });

    const logged = await activityService.getTaskActivities(taskId, {
      userId: EMP.uid,
    });
    expect(logged.length).toBeGreaterThan(0);
    expect(logged[0].duration).toBe(95);
    expect(logged[0].userId).toBe(EMP.uid);
  });

  it("lets a manager read the whole team's work on a task", async () => {
    await authService.signOutUser();
    await authService.signIn(MGR.email, PASSWORD);

    const logged = await activityService.getTaskActivities(taskId, {
      department: ENGINEERING,
    });
    expect(logged.some((entry) => entry.userId === EMP.uid)).toBe(true);
  });

  it("rejects an activity query that the rules cannot verify", async () => {
    // Regression guard. For a `list`, Firestore binds resource.data to only
    // the fields the query constrains, so filtering on taskId alone leaves
    // resource.data.userId undefined and the read rule errors out. Any future
    // query helper must constrain userId or department.
    const {collection, getDocs, orderBy, query, where} =
      await import("firebase/firestore");
    const {getDb} = await import("../src/lib/firebase/app");

    const code = await codeOf(
      getDocs(
        query(
          collection(getDb(), "activities"),
          where("taskId", "==", taskId),
          orderBy("createdAt", "desc"),
        ),
      ),
    );
    expect(code).not.toBe("OK");
  });

  it("stops an employee creating tasks", async () => {
    await authService.signOutUser();
    await authService.signIn(EMP.email, PASSWORD);
    const profile = (await authService.getUserDoc(EMP.uid)) as UserDoc;
    const code = await codeOf(
      taskService.createTask(profile, {
        title: "Self-assigned",
        assigneeId: EMP.uid,
        priority: "low",
      }),
    );
    expect(code).toBe("permission-denied");
  });
});

describe("Cross-department isolation", () => {
  it("hides another department's work from an outside employee", async () => {
    await authService.signOutUser();
    await authService.signIn(OTHER.email, PASSWORD);

    const code = await codeOf(taskService.getTeamTasks(ENGINEERING));
    expect(code).toBe("permission-denied");

    const attendanceCode = await codeOf(
      attendanceService.getTeamAttendance(ENGINEERING),
    );
    expect(attendanceCode).toBe("permission-denied");
  });
});

describe("Team directory", () => {
  it("lets a manager list their own department", async () => {
    await authService.signOutUser();
    await authService.signIn(MGR.email, PASSWORD);

    const members = await userService.getTeamMembers(ENGINEERING);
    expect(members.some((member) => member.uid === EMP.uid)).toBe(true);
    expect(members.every((member) => member.department === ENGINEERING))
      .toBe(true);
  });

  it("stops a manager listing another department", async () => {
    const code = await codeOf(userService.getTeamMembers(DESIGN));
    expect(code).toBe("permission-denied");
  });

  it("stops an employee listing colleagues", async () => {
    await authService.signOutUser();
    await authService.signIn(EMP.email, PASSWORD);
    const code = await codeOf(userService.getTeamMembers(ENGINEERING));
    expect(code).toBe("permission-denied");
  });

  it("lets an admin list any department", async () => {
    await authService.signOutUser();
    await authService.signIn(ADMIN.email, PASSWORD);
    const members = await userService.getTeamMembers(DESIGN);
    expect(members.length).toBeGreaterThan(0);
  });
});

describe("Role administration", () => {
  it("refuses setUserRole for a non-admin", async () => {
    await authService.signOutUser();
    await authService.signIn(EMP.email, PASSWORD);
    const code = await codeOf(
      userService.setUserRole({
        uid: EMP.uid,
        role: "admin",
        department: ENGINEERING,
      }),
    );
    expect(code).toBe("functions/permission-denied");
  });

  it("lets an admin assign a role and department", async () => {
    await authService.signOutUser();
    await authService.signIn(ADMIN.email, PASSWORD);

    await userService.setUserRole({
      uid: OTHER.uid,
      role: "manager",
      department: DESIGN,
    });

    const updated = await adminDb().collection("users").doc(OTHER.uid).get();
    expect(updated.data()?.role).toBe("manager");
  });
});
