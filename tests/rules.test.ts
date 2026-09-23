/**
 * Firestore Security Rules test suite.
 *
 * This is the evidence behind every security claim made about CompanyOS. It
 * runs against the real rules file in the Firestore emulator, so a regression
 * in `firestore.rules` fails here rather than in production.
 *
 * Run with:  npm run test:rules
 */

import {readFileSync} from "node:fs";
import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {afterAll, beforeAll, beforeEach, describe, it} from "vitest";

const ENGINEERING = "Engineering";
const DESIGN = "Design";

const EMP_A = "emp-eng-a";
const EMP_B = "emp-eng-b";
const EMP_D = "emp-design";
const MGR_ENG = "mgr-eng";
const MGR_DESIGN = "mgr-design";
const ADMIN = "admin-user";
const OUTSIDER = "no-profile-user";

const TODAY = "2026-09-23";

let testEnv: RulesTestEnvironment;

function profile(
  uid: string,
  role: string,
  department: string,
): Record<string, unknown> {
  return {
    uid,
    name: `User ${uid}`,
    email: `${uid}@nexus-code.studio`,
    role,
    department,
    createdAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00Z")),
  };
}

function attendance(
  userId: string,
  department: string,
): Record<string, unknown> {
  return {
    userId,
    department,
    date: TODAY,
    checkIn: Timestamp.fromDate(new Date("2026-09-23T02:30:00Z")),
    checkOut: null,
    breaks: [],
    breakMinutes: 0,
    workingMinutes: 0,
    status: "checked_in",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
}

function task(
  assigneeId: string,
  createdBy: string,
  department: string,
): Record<string, unknown> {
  return {
    title: "Ship the prototype",
    description: "Internal testing build",
    assigneeId,
    createdBy,
    department,
    status: "todo",
    priority: "high",
    progress: 0,
    dueDate: null,
    createdAt: Timestamp.now(),
  };
}

function activity(
  userId: string,
  department: string,
): Record<string, unknown> {
  return {
    userId,
    taskId: "task-eng",
    department,
    description: "Wrote the attendance transaction",
    duration: 90,
    createdAt: Timestamp.now(),
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "companyos-rules-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users", EMP_A), profile(EMP_A, "employee", ENGINEERING));
    await setDoc(doc(db, "users", EMP_B), profile(EMP_B, "employee", ENGINEERING));
    await setDoc(doc(db, "users", EMP_D), profile(EMP_D, "employee", DESIGN));
    await setDoc(doc(db, "users", MGR_ENG), profile(MGR_ENG, "manager", ENGINEERING));
    await setDoc(
      doc(db, "users", MGR_DESIGN),
      profile(MGR_DESIGN, "manager", DESIGN),
    );
    await setDoc(doc(db, "users", ADMIN), profile(ADMIN, "admin", "Operations"));

    await setDoc(doc(db, "attendance", `${EMP_A}_${TODAY}`), attendance(EMP_A, ENGINEERING));
    await setDoc(doc(db, "attendance", `${EMP_D}_${TODAY}`), attendance(EMP_D, DESIGN));

    await setDoc(doc(db, "tasks", "task-eng"), task(EMP_A, MGR_ENG, ENGINEERING));
    await setDoc(doc(db, "tasks", "task-design"), task(EMP_D, MGR_DESIGN, DESIGN));

    await setDoc(doc(db, "activities", "act-eng"), activity(EMP_A, ENGINEERING));
    await setDoc(doc(db, "activities", "act-design"), activity(EMP_D, DESIGN));
  });
});

function as(uid: string) {
  return testEnv.authenticatedContext(uid).firestore();
}

function anon() {
  return testEnv.unauthenticatedContext().firestore();
}

// ---------------------------------------------------------------------------

describe("baseline", () => {
  it("denies all access to signed-out visitors", async () => {
    const db = anon();
    await assertFails(getDoc(doc(db, "users", EMP_A)));
    await assertFails(getDoc(doc(db, "tasks", "task-eng")));
    await assertFails(getDoc(doc(db, "activities", "act-eng")));
  });

  it("denies a signed-in account that has no profile document", async () => {
    const db = as(OUTSIDER);
    await assertFails(getDoc(doc(db, "users", EMP_A)));
    await assertFails(getDoc(doc(db, "attendance", `${EMP_A}_${TODAY}`)));
  });
});

describe("users — privacy and privilege escalation", () => {
  it("lets an employee read their own profile", async () => {
    await assertSucceeds(getDoc(doc(as(EMP_A), "users", EMP_A)));
  });

  it("stops an employee reading a colleague's profile", async () => {
    await assertFails(getDoc(doc(as(EMP_A), "users", EMP_B)));
  });

  it("stops a new account creating itself as an admin", async () => {
    const db = as("brand-new");
    await assertFails(
      setDoc(doc(db, "users", "brand-new"), {
        uid: "brand-new",
        name: "Sneaky",
        email: "sneaky@nexus-code.studio",
        role: "admin",
        department: "Unassigned",
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("stops a new account placing itself inside a real department", async () => {
    const db = as("brand-new");
    await assertFails(
      setDoc(doc(db, "users", "brand-new"), {
        uid: "brand-new",
        name: "Sneaky",
        email: "sneaky@nexus-code.studio",
        role: "employee",
        department: ENGINEERING,
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("allows a correctly-shaped self sign-up", async () => {
    const db = as("brand-new");
    await assertSucceeds(
      setDoc(doc(db, "users", "brand-new"), {
        uid: "brand-new",
        name: "New Joiner",
        email: "new.joiner@nexus-code.studio",
        role: "employee",
        department: "Unassigned",
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("stops an employee promoting themselves after sign-up", async () => {
    await assertFails(
      updateDoc(doc(as(EMP_A), "users", EMP_A), {
        role: "admin",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("stops an employee switching their own department", async () => {
    await assertFails(
      updateDoc(doc(as(EMP_A), "users", EMP_A), {
        department: DESIGN,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("stops a manager promoting anyone", async () => {
    await assertFails(
      updateDoc(doc(as(MGR_ENG), "users", EMP_A), {
        role: "manager",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("lets an employee rename themselves", async () => {
    await assertSucceeds(
      updateDoc(doc(as(EMP_A), "users", EMP_A), {
        name: "Renamed Person",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("lets a manager read a profile in their own department only", async () => {
    await assertSucceeds(getDoc(doc(as(MGR_ENG), "users", EMP_A)));
    await assertFails(getDoc(doc(as(MGR_ENG), "users", EMP_D)));
  });

  it("lets an admin read across departments", async () => {
    await assertSucceeds(getDoc(doc(as(ADMIN), "users", EMP_A)));
    await assertSucceeds(getDoc(doc(as(ADMIN), "users", EMP_D)));
  });

  it("stops any client deleting a profile except an admin", async () => {
    await assertFails(deleteDoc(doc(as(EMP_A), "users", EMP_A)));
    await assertFails(deleteDoc(doc(as(MGR_ENG), "users", EMP_A)));
  });
});

describe("attendance — server authority", () => {
  it("blocks every direct client write", async () => {
    const db = as(EMP_A);
    await assertFails(
      setDoc(doc(db, "attendance", `${EMP_A}_2026-09-22`), attendance(EMP_A, ENGINEERING)),
    );
    await assertFails(
      updateDoc(doc(db, "attendance", `${EMP_A}_${TODAY}`), {workingMinutes: 600}),
    );
    await assertFails(deleteDoc(doc(db, "attendance", `${EMP_A}_${TODAY}`)));
  });

  it("lets an employee read only their own record", async () => {
    await assertSucceeds(
      getDoc(doc(as(EMP_A), "attendance", `${EMP_A}_${TODAY}`)),
    );
    await assertFails(
      getDoc(doc(as(EMP_D), "attendance", `${EMP_A}_${TODAY}`)),
    );
  });

  it("scopes a manager's team query to their own department", async () => {
    const engQuery = query(
      collection(as(MGR_ENG), "attendance"),
      where("department", "==", ENGINEERING),
      where("date", "==", TODAY),
    );
    await assertSucceeds(getDocs(engQuery));

    const crossQuery = query(
      collection(as(MGR_ENG), "attendance"),
      where("department", "==", DESIGN),
      where("date", "==", TODAY),
    );
    await assertFails(getDocs(crossQuery));
  });

  it("rejects an unscoped attendance query from a manager", async () => {
    await assertFails(getDocs(collection(as(MGR_ENG), "attendance")));
  });
});

describe("tasks — field-level control", () => {
  it("lets the assignee update status and progress", async () => {
    await assertSucceeds(
      updateDoc(doc(as(EMP_A), "tasks", "task-eng"), {
        status: "in_progress",
        progress: 40,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("stops the assignee rewriting the task or reassigning it", async () => {
    const db = as(EMP_A);
    await assertFails(
      updateDoc(doc(db, "tasks", "task-eng"), {
        title: "Something else entirely",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(db, "tasks", "task-eng"), {
        assigneeId: EMP_B,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(db, "tasks", "task-eng"), {
        department: DESIGN,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("rejects an out-of-range progress value", async () => {
    await assertFails(
      updateDoc(doc(as(EMP_A), "tasks", "task-eng"), {
        progress: 150,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("rejects an unknown status value", async () => {
    await assertFails(
      updateDoc(doc(as(EMP_A), "tasks", "task-eng"), {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("stops an employee creating or deleting tasks", async () => {
    const db = as(EMP_A);
    await assertFails(
      setDoc(doc(db, "tasks", "new-task"), task(EMP_A, EMP_A, ENGINEERING)),
    );
    await assertFails(deleteDoc(doc(db, "tasks", "task-eng")));
  });

  it("lets a manager create work inside their own department", async () => {
    await assertSucceeds(
      setDoc(doc(as(MGR_ENG), "tasks", "new-eng-task"), {
        ...task(EMP_A, MGR_ENG, ENGINEERING),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("stops a manager assigning work into another department", async () => {
    await assertFails(
      setDoc(doc(as(MGR_ENG), "tasks", "cross-task"), {
        ...task(EMP_D, MGR_ENG, DESIGN),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("stops a manager forging another person as the creator", async () => {
    await assertFails(
      setDoc(doc(as(MGR_ENG), "tasks", "forged-task"), {
        ...task(EMP_A, MGR_DESIGN, ENGINEERING),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("stops a manager reading or editing another department's task", async () => {
    await assertFails(getDoc(doc(as(MGR_ENG), "tasks", "task-design")));
    await assertFails(
      updateDoc(doc(as(MGR_ENG), "tasks", "task-design"), {
        priority: "low",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("lets a manager fully edit a task in their own department", async () => {
    await assertSucceeds(
      updateDoc(doc(as(MGR_ENG), "tasks", "task-eng"), {
        title: "Ship the prototype (revised)",
        priority: "urgent",
        assigneeId: EMP_B,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("lets a manager delete a task in their own department", async () => {
    await assertSucceeds(deleteDoc(doc(as(MGR_ENG), "tasks", "task-eng")));
  });

  it("lets an admin edit a task in any department", async () => {
    await assertSucceeds(
      updateDoc(doc(as(ADMIN), "tasks", "task-design"), {
        priority: "low",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("stops a manager moving a task out of their department", async () => {
    await assertFails(
      updateDoc(doc(as(MGR_ENG), "tasks", "task-eng"), {
        department: DESIGN,
        updatedAt: serverTimestamp(),
      }),
    );
  });
});

describe("activities — ownership", () => {
  it("lets an employee log their own work", async () => {
    await assertSucceeds(
      setDoc(doc(as(EMP_A), "activities", "mine"), {
        ...activity(EMP_A, ENGINEERING),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("stops an employee logging work as someone else", async () => {
    await assertFails(
      setDoc(doc(as(EMP_A), "activities", "forged"), {
        ...activity(EMP_B, ENGINEERING),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("stops an employee filing work into another department", async () => {
    await assertFails(
      setDoc(doc(as(EMP_A), "activities", "misfiled"), {
        ...activity(EMP_A, DESIGN),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("rejects an implausible duration", async () => {
    await assertFails(
      setDoc(doc(as(EMP_A), "activities", "too-long"), {
        ...activity(EMP_A, ENGINEERING),
        duration: 5000,
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("stops an employee reading a colleague's activity log", async () => {
    await assertFails(getDoc(doc(as(EMP_B), "activities", "act-eng")));
  });

  it("lets a manager read their own department's feed only", async () => {
    await assertSucceeds(getDoc(doc(as(MGR_ENG), "activities", "act-eng")));
    await assertFails(getDoc(doc(as(MGR_ENG), "activities", "act-design")));

    const scoped = query(
      collection(as(MGR_ENG), "activities"),
      where("department", "==", ENGINEERING),
    );
    await assertSucceeds(getDocs(scoped));
    await assertFails(getDocs(collection(as(MGR_ENG), "activities")));
  });
});
