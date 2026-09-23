/**
 * CompanyOS demo/seed data.
 *
 * Creates a small but realistic company: an admin, two departments each with a
 * manager and a few employees, roughly two working weeks of attendance, a
 * populated task board, and activity logs against those tasks.
 *
 * Credentials: Application Default Credentials. Run this once first:
 *   gcloud auth application-default login
 * No service-account key file is used, created, or committed.
 *
 * Idempotent: every document has a deterministic ID, so re-running updates in
 * place rather than duplicating.
 *
 * Usage:
 *   npm run seed              # write to the live project
 *   npm run seed -- --dry-run # print what would be written, write nothing
 */

import {getApps, initializeApp} from "firebase-admin/app";
import {
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";

const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ??
  process.env.FIREBASE_PROJECT ??
  "studio-8326696944-c3f9a";

const COMPANY_TIMEZONE = process.env.COMPANY_TIMEZONE ?? "Asia/Yangon";

/** Shared password for every demo account. Demo data only — never real users. */
const DEMO_PASSWORD = "CompanyOS2026!";

const WORKING_DAYS = 10;

const DRY_RUN = process.argv.includes("--dry-run");

if (getApps().length === 0) {
  initializeApp({projectId: PROJECT_ID});
}
const db = getFirestore();
const auth = getAuth();

// ---------------------------------------------------------------------------
// Time helpers (mirrors functions/src/time.ts)
// ---------------------------------------------------------------------------

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function companyDateString(when: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
}

/** Offset in ms between the given zone and UTC at a particular instant. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const read = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour") % 24,
    read("minute"),
    read("second"),
  );
  return asUtc - at.getTime();
}

/** Builds the UTC instant for a wall-clock time in the company timezone. */
function zonedTime(dateStr: string, hours: number, minutes: number): Date {
  const guess = new Date(`${dateStr}T${pad(hours)}:${pad(minutes)}:00Z`);
  return new Date(guess.getTime() - zoneOffsetMs(guess, COMPANY_TIMEZONE));
}

function minutesBetween(from: Date, to: Date): number {
  const diff = to.getTime() - from.getTime();
  return diff <= 0 ? 0 : Math.floor(diff / 60000);
}

/** The last N weekdays in company-local time, oldest first. */
function recentWorkingDays(count: number): string[] {
  const days: string[] = [];
  const cursor = new Date();
  while (days.length < count) {
    const dateStr = companyDateString(cursor);
    const weekday = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      days.push(dateStr);
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return days.reverse();
}

/**
 * Deterministic pseudo-randomness, so re-seeding produces identical data
 * instead of churning the demo dataset on every run.
 */
function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// The company
// ---------------------------------------------------------------------------

const ENGINEERING = "Engineering";
const DESIGN = "Design";
const OPERATIONS = "Operations";

type Role = "employee" | "manager" | "admin";

interface SeedPerson {
  uid: string;
  name: string;
  email: string;
  role: Role;
  department: string;
}

const PEOPLE: SeedPerson[] = [
  {
    uid: "demo-admin",
    name: "Nadia Rahman",
    email: "admin@nexus-code.studio",
    role: "admin",
    department: OPERATIONS,
  },
  {
    uid: "demo-eng-manager",
    name: "Thiri Aung",
    email: "thiri.manager@nexus-code.studio",
    role: "manager",
    department: ENGINEERING,
  },
  {
    uid: "demo-eng-1",
    name: "Kyaw Min Htet",
    email: "kyaw.dev@nexus-code.studio",
    role: "employee",
    department: ENGINEERING,
  },
  {
    uid: "demo-eng-2",
    name: "Su Myat Noe",
    email: "su.dev@nexus-code.studio",
    role: "employee",
    department: ENGINEERING,
  },
  {
    uid: "demo-eng-3",
    name: "Arjun Patel",
    email: "arjun.dev@nexus-code.studio",
    role: "employee",
    department: ENGINEERING,
  },
  {
    uid: "demo-design-manager",
    name: "Hnin Ei Phyu",
    email: "hnin.manager@nexus-code.studio",
    role: "manager",
    department: DESIGN,
  },
  {
    uid: "demo-design-1",
    name: "Zaw Lin Tun",
    email: "zaw.design@nexus-code.studio",
    role: "employee",
    department: DESIGN,
  },
  {
    uid: "demo-design-2",
    name: "Mia Fernandes",
    email: "mia.design@nexus-code.studio",
    role: "employee",
    department: DESIGN,
  },
];

type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
type TaskPriority = "low" | "medium" | "high" | "urgent";

interface SeedTask {
  id: string;
  title: string;
  description: string;
  assigneeUid: string;
  createdByUid: string;
  department: string;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  dueInDays: number | null;
}

const TASKS: SeedTask[] = [
  {
    id: "demo-task-auth",
    title: "Firebase Authentication for CompanyOS",
    description:
      "Email/password sign-in, session persistence, and the protected " +
      "route wrapper for the employee dashboard.",
    assigneeUid: "demo-eng-1",
    createdByUid: "demo-eng-manager",
    department: ENGINEERING,
    status: "done",
    priority: "urgent",
    progress: 100,
    dueInDays: -3,
  },
  {
    id: "demo-task-attendance",
    title: "Attendance check-in/check-out flow",
    description:
      "Wire the employee dashboard to the attendance callables, including " +
      "break start/stop and the live working-time counter.",
    assigneeUid: "demo-eng-2",
    createdByUid: "demo-eng-manager",
    department: ENGINEERING,
    status: "in_progress",
    priority: "high",
    progress: 65,
    dueInDays: 2,
  },
  {
    id: "demo-task-rules",
    title: "Harden Firestore security rules",
    description:
      "Department-scoped manager access, field-level task updates, and a " +
      "rules test suite covering cross-department reads.",
    assigneeUid: "demo-eng-3",
    createdByUid: "demo-eng-manager",
    department: ENGINEERING,
    status: "in_progress",
    priority: "urgent",
    progress: 80,
    dueInDays: 1,
  },
  {
    id: "demo-task-manager-dash",
    title: "Manager dashboard: team attendance table",
    description:
      "Show who is in, on break, or checked out today, with total working " +
      "hours per team member for the current week.",
    assigneeUid: "demo-eng-1",
    createdByUid: "demo-eng-manager",
    department: ENGINEERING,
    status: "todo",
    priority: "medium",
    progress: 0,
    dueInDays: 5,
  },
  {
    id: "demo-task-indexes",
    title: "Firestore composite indexes for dashboards",
    description:
      "Define and deploy the indexes backing the team attendance, task " +
      "board, and activity feed queries.",
    assigneeUid: "demo-eng-2",
    createdByUid: "demo-eng-manager",
    department: ENGINEERING,
    status: "blocked",
    priority: "medium",
    progress: 25,
    dueInDays: 4,
  },
  {
    id: "demo-task-design-system",
    title: "CompanyOS design system foundations",
    description:
      "Colour tokens, typography scale, and the shared button/input/table " +
      "components for the v0.1 prototype.",
    assigneeUid: "demo-design-1",
    createdByUid: "demo-design-manager",
    department: DESIGN,
    status: "in_progress",
    priority: "high",
    progress: 55,
    dueInDays: 3,
  },
  {
    id: "demo-task-dashboard-ux",
    title: "Employee dashboard layout",
    description:
      "Wireframes and high-fidelity mockups for the check-in card, assigned " +
      "task list, and the activity logging panel.",
    assigneeUid: "demo-design-2",
    createdByUid: "demo-design-manager",
    department: DESIGN,
    status: "done",
    priority: "high",
    progress: 100,
    dueInDays: -1,
  },
  {
    id: "demo-task-empty-states",
    title: "Empty and error states",
    description:
      "Design the no-tasks, not-checked-in, and permission-denied states so " +
      "the prototype does not show blank panels.",
    assigneeUid: "demo-design-1",
    createdByUid: "demo-design-manager",
    department: DESIGN,
    status: "todo",
    priority: "low",
    progress: 0,
    dueInDays: 7,
  },
];

const ACTIVITY_NOTES: Record<string, string[]> = {
  "demo-task-auth": [
    "Implemented email/password sign-in and wired session persistence.",
    "Added the protected-route wrapper and redirect on sign-out.",
    "Fixed the profile document not being created on first sign-up.",
  ],
  "demo-task-attendance": [
    "Hooked the check-in button up to the callable and handled errors.",
    "Built the live working-time counter with a one-second tick.",
    "Handled the on-break state so the counter pauses correctly.",
  ],
  "demo-task-rules": [
    "Wrote department-scoped helpers and the manager read path.",
    "Added rules tests for cross-department reads — all denied as expected.",
    "Locked task updates so an assignee can only change status/progress.",
  ],
  "demo-task-indexes": [
    "Drafted the composite indexes for the team attendance queries.",
    "Blocked: waiting on the final shape of the activity feed filters.",
  ],
  "demo-task-design-system": [
    "Defined the colour tokens and the type scale.",
    "Built the table and badge components used by both dashboards.",
  ],
  "demo-task-dashboard-ux": [
    "Wireframed the employee dashboard and reviewed with the team.",
    "Delivered high-fidelity mockups for the check-in card.",
  ],
  "demo-task-manager-dash": [],
  "demo-task-empty-states": [],
};

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

async function seedAuthUsers(): Promise<void> {
  for (const person of PEOPLE) {
    if (DRY_RUN) {
      console.log(`  [dry-run] auth user ${person.email} (${person.uid})`);
      continue;
    }
    try {
      await auth.updateUser(person.uid, {
        email: person.email,
        displayName: person.name,
        password: DEMO_PASSWORD,
        emailVerified: true,
      });
      console.log(`  updated  ${person.email}`);
    } catch {
      await auth.createUser({
        uid: person.uid,
        email: person.email,
        displayName: person.name,
        password: DEMO_PASSWORD,
        emailVerified: true,
      });
      console.log(`  created  ${person.email}`);
    }
  }
}

async function seedProfiles(): Promise<void> {
  const batch = db.batch();
  for (const person of PEOPLE) {
    const ref = db.collection("users").doc(person.uid);
    batch.set(
      ref,
      {
        uid: person.uid,
        name: person.name,
        email: person.email,
        role: person.role,
        department: person.department,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  }
  if (!DRY_RUN) {
    await batch.commit();
  }
  console.log(`  ${PEOPLE.length} profiles`);
}

async function seedAttendance(): Promise<void> {
  const days = recentWorkingDays(WORKING_DAYS);
  const today = companyDateString(new Date());
  let batch = db.batch();
  let pending = 0;
  let written = 0;

  for (const person of PEOPLE) {
    for (const date of days) {
      const random = seededRandom(`${person.uid}:${date}`);

      // A believable absence roughly one day in twelve.
      if (random() < 0.08 && date !== today) {
        continue;
      }

      const startHour = 9;
      const startMinute = Math.floor(random() * 40);
      const checkInAt = zonedTime(date, startHour, startMinute);

      const lunchStart = zonedTime(date, 12, 30 + Math.floor(random() * 20));
      const lunchMinutes = 35 + Math.floor(random() * 30);
      const lunchEnd = new Date(lunchStart.getTime() + lunchMinutes * 60000);

      const isToday = date === today;
      const workHours = 8 + Math.floor(random() * 2);
      const checkOutAt = new Date(
        checkInAt.getTime() +
          workHours * 3600000 +
          Math.floor(random() * 45) * 60000,
      );

      const id = `${person.uid}_${date}`;
      const ref = db.collection("attendance").doc(id);

      if (isToday) {
        // Leave today open so the dashboard has a live "checked in" state.
        batch.set(ref, {
          userId: person.uid,
          department: person.department,
          date,
          checkIn: Timestamp.fromDate(checkInAt),
          checkOut: null,
          breaks: [],
          breakMinutes: 0,
          workingMinutes: 0,
          status: "checked_in",
          createdAt: Timestamp.fromDate(checkInAt),
          updatedAt: Timestamp.fromDate(checkInAt),
        });
      } else {
        const breakMinutes = minutesBetween(lunchStart, lunchEnd);
        const workingMinutes = Math.max(
          0,
          minutesBetween(checkInAt, checkOutAt) - breakMinutes,
        );
        batch.set(ref, {
          userId: person.uid,
          department: person.department,
          date,
          checkIn: Timestamp.fromDate(checkInAt),
          checkOut: Timestamp.fromDate(checkOutAt),
          breaks: [
            {
              start: Timestamp.fromDate(lunchStart),
              end: Timestamp.fromDate(lunchEnd),
            },
          ],
          breakMinutes,
          workingMinutes,
          status: "checked_out",
          createdAt: Timestamp.fromDate(checkInAt),
          updatedAt: Timestamp.fromDate(checkOutAt),
        });
      }

      pending += 1;
      written += 1;
      if (pending >= 400) {
        if (!DRY_RUN) {
          await batch.commit();
        }
        batch = db.batch();
        pending = 0;
      }
    }
  }

  if (pending > 0 && !DRY_RUN) {
    await batch.commit();
  }
  console.log(`  ${written} attendance records across ${days.length} days`);
}

async function seedTasks(): Promise<void> {
  const batch = db.batch();
  const now = Date.now();

  for (const task of TASKS) {
    const ref = db.collection("tasks").doc(task.id);
    const dueDate =
      task.dueInDays === null ?
        null :
        Timestamp.fromDate(
          new Date(now + task.dueInDays * 24 * 3600000),
        );

    batch.set(ref, {
      title: task.title,
      description: task.description,
      assigneeId: task.assigneeUid,
      createdBy: task.createdByUid,
      department: task.department,
      status: task.status,
      priority: task.priority,
      progress: task.progress,
      dueDate,
      createdAt: Timestamp.fromDate(new Date(now - 9 * 24 * 3600000)),
      updatedAt: Timestamp.fromDate(new Date(now - 3600000)),
    });
  }

  if (!DRY_RUN) {
    await batch.commit();
  }
  console.log(`  ${TASKS.length} tasks`);
}

async function seedActivities(): Promise<void> {
  const batch = db.batch();
  const now = Date.now();
  let count = 0;

  for (const task of TASKS) {
    const notes = ACTIVITY_NOTES[task.id] ?? [];
    notes.forEach((note, index) => {
      const random = seededRandom(`${task.id}:${index}`);
      const id = `${task.id}-activity-${index + 1}`;
      const ref = db.collection("activities").doc(id);
      const createdAt = new Date(
        now - (notes.length - index) * 22 * 3600000,
      );

      batch.set(ref, {
        userId: task.assigneeUid,
        taskId: task.id,
        department: task.department,
        description: note,
        duration: 45 + Math.floor(random() * 180),
        createdAt: Timestamp.fromDate(createdAt),
      });
      count += 1;
    });
  }

  if (!DRY_RUN) {
    await batch.commit();
  }
  console.log(`  ${count} activities`);
}

async function main(): Promise<void> {
  console.log("CompanyOS seed");
  console.log(`  project:  ${PROJECT_ID}`);
  console.log(`  timezone: ${COMPANY_TIMEZONE}`);
  if (DRY_RUN) {
    console.log("  MODE:     dry run — nothing will be written\n");
  } else {
    console.log("  MODE:     writing to the live project\n");
  }

  console.log("Auth users");
  await seedAuthUsers();

  console.log("\nProfiles");
  await seedProfiles();

  console.log("\nAttendance");
  await seedAttendance();

  console.log("\nTasks");
  await seedTasks();

  console.log("\nActivities");
  await seedActivities();

  console.log("\nDone.");
  console.log(`Every demo account signs in with: ${DEMO_PASSWORD}`);
  console.log("  admin    admin@nexus-code.studio");
  console.log("  manager  thiri.manager@nexus-code.studio   (Engineering)");
  console.log("  manager  hnin.manager@nexus-code.studio    (Design)");
  console.log("  employee kyaw.dev@nexus-code.studio        (Engineering)");
  console.log("  employee zaw.design@nexus-code.studio      (Design)");
}

main().catch((error) => {
  console.error("\nSeed failed:", error);
  process.exit(1);
});
