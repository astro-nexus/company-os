We are building CompanyOS, an internal company operations platform for NexusCode.

Current status:
- Project directory: company-os
- Firebase project: studio-8326696944-c3f9a
- Existing Firebase Web App: CompanyOS
- Web App ID: 1:534950805700:web:6f723477f929645c7fc991
- Firebase CLI is initialized in this directory.
- Firestore is initialized.
- Firestore rules: firestore.rules
- Firestore indexes: firestore.indexes.json
- Firebase Functions is also initialized.
- Do NOT create a new Firebase project or Firebase Web App.

Goal:
Build a working v0.1 prototype for internal testing by Friday.

Tech stack:
- Existing frontend: inspect the repository first and preserve the existing framework/design.
- Firebase Authentication
- Cloud Firestore
- Firebase Cloud Functions / Node.js only where server-side logic is actually needed.
- Tailwind if already used by the project.
- Do not unnecessarily rewrite the existing frontend.

Core modules for v0.1:
1. Authentication
2. Attendance
3. Tasks
4. Activities
5. Employee Dashboard
6. Manager Dashboard

Firestore collections:

users
- uid
- name
- email
- role: employee | manager | admin
- department
- createdAt

attendance
- id
- userId
- date
- checkIn
- checkOut
- breaks
- workingMinutes

tasks
- id
- title
- description
- assigneeId
- createdBy
- status
- priority
- progress
- dueDate
- createdAt
- updatedAt

activities
- id
- userId
- taskId
- description
- duration
- createdAt

Permissions:
Employee:
- Read/update own profile
- Read own attendance
- Check in/out
- Read assigned tasks
- Update assigned task progress/status
- Create activities for their work

Manager:
- Everything relevant to their own account
- View team attendance
- Create and assign tasks
- View team tasks and progress
- View team activities

Admin:
- Full access

Security:
- Implement access control with Firestore Security Rules.
- Do NOT rely only on frontend role checks.
- Employees must not be able to read other employees' private data.
- Managers should only access appropriate team/company data.
- Never expose Firebase Admin credentials in frontend code.

Important product distinction:
Task = what needs to be accomplished.
Activity = what the employee actually did while working on a task.

Employee workflow:
Login
→ Dashboard
→ Check In
→ View assigned tasks
→ Work on task
→ Update progress/status
→ Record activity
→ Check Out

Manager workflow:
Login
→ Manager Dashboard
→ Team attendance
→ Task progress
→ Team activities

For now DO NOT build:
- Payroll
- Leave management
- Overtime
- Slack integration
- AI summaries
- Advanced analytics
- External SaaS/multi-tenancy
- Complex approval workflows

First inspect the existing project structure and current implementation.

Then:
1. Verify Firebase configuration.
2. Verify the existing CompanyOS Firebase Web App is used.
3. Inspect the existing UI and preserve it.
4. Set up Firebase client configuration using environment variables.
5. Set up Firebase Authentication.
6. Create Firestore data access functions/hooks/services.
7. Implement the Firestore schema.
8. Implement secure Firestore rules.
9. Implement the employee workflow.
10. Implement the manager dashboard.
11. Add seed/demo data if useful.
12. Run the project and fix TypeScript/build/lint errors.
13. Do not make unnecessary architectural changes.

Before making major changes, explain the current project structure and the implementation plan.
---

# Backend Implementation Notes (Developer 1)

Status of the v0.1 backend as actually built. This section is the contract the
frontend is written against.

## What was found vs. what CLAUDE.md assumed

- **There was no existing frontend.** No root `package.json`, no `src/`, no
  framework. "Preserve the existing frontend" had nothing to preserve, so a
  framework-agnostic data layer was built instead of a UI. Developer 2 chooses
  the framework and imports `src/lib`.
- **`firestore.rules` was boilerplate for a different app** ("GoalWise":
  nested goals/milestones/subtasks, no roles at all). It was fully replaced.
- **`firestore.indexes.json` was empty**, so every manager query would have
  failed at runtime. Twelve composite indexes are now defined.
- Firebase project `studio-8326696944-c3f9a`, the `(default)` Firestore
  database, and the existing **CompanyOS** web app
  (`1:534950805700:web:6f723477f929645c7fc991`) were reused. Nothing new was
  created.

## Repository layout

```
firestore.rules              Security rules — the actual access boundary
firestore.indexes.json       Composite indexes backing every dashboard query
functions/src/
  index.ts                   Callable exports + global options
  attendance.ts              checkIn / checkOut / startBreak / endBreak
  admin.ts                   setUserRole (admin only)
  firebase.ts                Admin SDK singletons + collection names
  time.ts                    Company-local date handling
  types.ts                   Server-side domain types
src/lib/
  types.ts                   Shared domain types + small display helpers
  date.ts                    Company-local date helpers (mirrors time.ts)
  firebase/config.ts         Env-var config, COMPANY_TIMEZONE
  firebase/app.ts            Memoised app/auth/db/functions + emulator hookup
  services/auth.ts           signIn / signUp / profile reads
  services/attendance.ts     Callable wrappers + attendance queries
  services/tasks.ts          Task CRUD + dashboards
  services/activities.ts     Activity logging + feeds
  services/users.ts          Team directory + setUserRole
  index.ts                   Public barrel
scripts/seed.ts              Idempotent demo data (Admin SDK via ADC)
tests/rules.test.ts          Security rules test suite
```

## Firestore schema (as implemented)

Two fields were added beyond the original spec. Both are load-bearing:

1. **`department` is denormalized onto `attendance`, `tasks` and
   `activities`.** Without it, a manager-scoped rule needs a
   `get(/users/{ownerId})` per document, which exceeds Firestore's
   20-`get()`-per-query limit and makes dashboards fail outright. With it,
   every manager check is one cached lookup of the caller's own profile.
2. **`status` on `attendance`** — makes the check-in/break/check-out state
   machine explicit and server-enforced rather than inferred from null checks.

### `users/{uid}` — document ID is the Auth UID

| Field | Type | Notes |
|---|---|---|
| `uid` | string | Required, immutable, equals the document ID |
| `name` | string | Required, 1–100 chars. The only field a user may edit |
| `email` | string | Required, immutable from clients |
| `role` | `employee` \| `manager` \| `admin` | **Never client-writable.** Forced to `employee` on sign-up |
| `department` | string | **Never client-writable.** Forced to `Unassigned` on sign-up |
| `photoURL` | string? | Optional, ≤2000 chars |
| `createdAt` | timestamp | Required, immutable |
| `updatedAt` | timestamp? | Optional |

### `attendance/{userId}_{YYYY-MM-DD}` — one record per user per day

| Field | Type | Notes |
|---|---|---|
| `userId` | string | Owner |
| `department` | string | Denormalized; scopes manager reads |
| `date` | string | `YYYY-MM-DD` in `COMPANY_TIMEZONE`; also in the doc ID |
| `checkIn` | timestamp | Server clock |
| `checkOut` | timestamp \| null | Null until checked out |
| `breaks` | array of `{start, end\|null}` | `end` null while a break is open |
| `breakMinutes` | number | Accumulated, server-computed |
| `workingMinutes` | number | `(checkOut − checkIn) − breakMinutes` |
| `status` | `checked_in` \| `on_break` \| `checked_out` | State machine |
| `createdAt` / `updatedAt` | timestamp | |

**Client writes are denied entirely.** The deterministic document ID makes
check-in idempotent — a double tap cannot create two records for one day.

### `tasks/{autoId}` — what needs to be accomplished

| Field | Type | Notes |
|---|---|---|
| `title` | string | Required, 1–200 |
| `description` | string? | ≤5000 |
| `assigneeId` | string | The employee doing the work |
| `createdBy` | string | Immutable; must equal the creator's UID |
| `department` | string | Pinned to the creating manager's department |
| `status` | `todo` \| `in_progress` \| `blocked` \| `done` | |
| `priority` | `low` \| `medium` \| `high` \| `urgent` | |
| `progress` | number | 0–100, enforced by rules |
| `dueDate` | timestamp \| null | |
| `createdAt` | timestamp | Immutable |
| `updatedAt` | timestamp? | |

### `activities/{autoId}` — what the employee actually did

| Field | Type | Notes |
|---|---|---|
| `userId` | string | Immutable; must equal the creator's UID |
| `taskId` | string | Immutable; the task this work belongs to |
| `department` | string | Immutable; pinned to the creator's department |
| `description` | string | Required, 1–2000 |
| `duration` | number | Minutes, 1–1440 |
| `createdAt` | timestamp | Immutable |
| `updatedAt` | timestamp? | |

## Permission matrix

| Action | Employee | Manager | Admin |
|---|---|---|---|
| Read own profile | Yes | Yes | Yes |
| Read another profile | **No** | Own department only | Any |
| Edit own `name` / `photoURL` | Yes | Yes | Yes |
| Change any `role` / `department` | **No** | **No** | Via `setUserRole` only |
| Read own attendance | Yes | Yes | Yes |
| Read team attendance | **No** | Own department | Any |
| Write attendance directly | **No** | **No** | **No** (Functions only) |
| Check in/out, breaks | Yes (own) | Yes (own) | Yes (own) |
| Read assigned tasks | Yes | Yes | Yes |
| Update task `status`/`progress` | Assigned only | Yes | Yes |
| Edit task title/assignee/priority | **No** | Own department | Any |
| Create / delete tasks | **No** | Own department | Any |
| Create activities | Own only | Own only | Own only |
| Read team activities | **No** | Own department | Any |

## Required query shapes

**Security rules are not filters** — and for `list` operations this is
stricter than it sounds. Firestore binds `resource.data` to **only the fields
the query constrains**, then requires the rule to pass for every possible
match. A field the rule reads but the query does not filter on is `undefined`,
and the rule *errors* rather than returning false.

So every list query must filter on a field that makes one clause of the read
rule evaluate to true:

| Collection | Must filter on |
|---|---|
| `users` | `department` (manager/admin) |
| `attendance` | `userId` (own) or `department` (manager/admin) |
| `tasks` | `assigneeId`, `createdBy`, or `department` |
| `activities` | `userId` (own) or `department` (manager/admin) |

```ts
// Correct — the rule can prove every match is readable
where("department", "==", myProfile.department)
where("userId", "==", myProfile.uid)

// Denied — resource.data.userId is undefined during evaluation,
// even though every stored document has the field
query(collection(db, "activities"), where("taskId", "==", id))
```

That last case is why `getTaskActivities` takes a required `scope` argument:

```ts
// employee: their own work on the task
await activityService.getTaskActivities(taskId, {userId: profile.uid});
// manager/admin: the whole team's work on it
await activityService.getTaskActivities(taskId, {department: task.department});
```

The service layer in `src/lib/services/` handles all of this. Use it rather
than hand-writing queries — `tests/e2e.test.ts` carries a regression guard for
the unscoped case.

## Cloud Functions API

All are v2 callables (`firebase-functions` v7), invoked via `httpsCallable`.

| Function | Arguments | Behaviour |
|---|---|---|
| `checkIn` | none | Starts the day. Fails if already checked in or checked out |
| `startBreak` | none | Fails unless currently `checked_in` |
| `endBreak` | none | Fails unless currently `on_break` |
| `checkOut` | none | Closes any open break, computes `workingMinutes` |
| `setUserRole` | `{uid, role, department}` | **Admin only**, verified server-side |

Each attendance call runs in a transaction and returns the day's summary with
ISO-8601 timestamp strings.

Changing someone's department affects visibility **going forward only** —
existing records keep the department they were written with.

## Configuration

`COMPANY_TIMEZONE` decides where a working day starts and ends. It is set in
two places and **they must match**, or client and server will disagree about
which day a check-in belongs to:

- Cloud Functions: `COMPANY_TIMEZONE` env var (defaults to `Asia/Yangon`)
- Client: `NEXT_PUBLIC_COMPANY_TIMEZONE` in `.env.local`

Copy `.env.example` to `.env.local`. The Firebase web config values there are
public by design — they ship in every client bundle, and Security Rules are
the real boundary. A Firebase **Admin** service-account key must never be
committed or placed under `src/`.

## Demo accounts

Created by `npm run seed`. Password for all: `CompanyOS2026!`

| Email | Role | Department |
|---|---|---|
| `admin@nexus-code.studio` | admin | Operations |
| `thiri.manager@nexus-code.studio` | manager | Engineering |
| `hnin.manager@nexus-code.studio` | manager | Design |
| `kyaw.dev@nexus-code.studio` | employee | Engineering |
| `su.dev@nexus-code.studio` | employee | Engineering |
| `arjun.dev@nexus-code.studio` | employee | Engineering |
| `zaw.design@nexus-code.studio` | employee | Design |
| `mia.design@nexus-code.studio` | employee | Design |

Seeded data covers 10 working days of attendance (today left open so the
dashboard has a live "checked in" state), 8 tasks across every status and
priority, and activity logs against them.

## Commands

```bash
npm install                 # root data layer + tooling
npm run typecheck           # tsc --noEmit over src/, scripts/, tests/
npm run test:rules          # 37 security rules tests
npm run test:e2e            # 18 auth + callable API tests, end to end
npm run emulators           # auth + firestore + functions emulators
npm run seed:emulator       # demo data into a RUNNING emulator (no credentials)
npm run seed                # demo data into the LIVE project (needs ADC)
npm run seed -- --dry-run   # preview without writing

cd functions && npm run lint && npm run build

firebase deploy --only firestore:rules,firestore:indexes,functions
```

The emulator needs a Java runtime. If `java -version` fails:
`brew install openjdk`, then prefix commands with
`PATH="/opt/homebrew/opt/openjdk/bin:$PATH"`.

Seeding the **live** project uses Application Default Credentials — run
`gcloud auth application-default login` once first. No service-account key file
is used or created. Seeding the **emulator** needs no credentials at all.

## How to test

**Against the emulator — works with no setup, no live risk:**

```bash
npm run test:rules   # security boundary
npm run test:e2e     # sign-in, check-in/breaks/check-out, tasks, activities
```

To click through the real UI with realistic data:

```bash
npm run emulators              # terminal 1
npm run seed:emulator          # terminal 2, once the emulators are up
# set VITE_USE_EMULATORS=true in .env.local
npm run dev                    # terminal 3
```

**Against the live project**, two things must be done first:

1. Enable **Email/Password** in Firebase Console -> Authentication -> Sign-in
   method. Until then every sign-in returns `PASSWORD_LOGIN_DISABLED`. The CLI
   cannot toggle this.
2. `gcloud auth application-default login` then `npm run seed`.

## Security caveat

These rules are a reviewed prototype, not an audited production ruleset. They
are designed to be secure for this model: default-deny, no self-escalation of
role or department, department-scoped manager access, field-level restriction
on task updates, and server-authoritative attendance. That claim is backed by
`tests/rules.test.ts`, which exercises each of those paths against the real
rules file. Review before using beyond internal testing.

---

# Frontend Scaffold (Vite + React)

The v0.1 frontend is **Vite 6 + React 19 + TypeScript**, added on top of the
existing `src/lib` data layer. No part of the data layer's public surface was
changed.

## Layout

```
index.html                  Vite entry document
vite.config.ts              React plugin, envPrefix, @ alias
src/main.tsx                Initialises Firebase, then mounts React
src/app/App.tsx             Single-screen shell (no auth gate, no router yet)
src/app/AuthProvider.tsx    Auth + users/{uid} profile context
src/app/Welcome.tsx         Landing screen with module placeholders
src/app/styles.css          Plain CSS tokens (Tailwind was not already in use)
```

## Environment variables

`vite.config.ts` sets `envPrefix: ["VITE_", "NEXT_PUBLIC_"]`, so the existing
`NEXT_PUBLIC_*` values in `.env.local` reach the browser unchanged — there is
no second copy of the Firebase config to drift out of sync.

`src/lib/firebase/config.ts` now reads `import.meta.env` first and falls back
to `process.env`, so the same module works under Vite, Node (`npm run seed`)
and Vitest. `initFirebase(config)` with an explicit object still overrides it.

Every prefixed variable is inlined into the shipped bundle. That is fine for
Firebase web config — Security Rules are the boundary — and must never be done
with an Admin service-account key.

Set `VITE_USE_EMULATORS=true` to point the app at `npm run emulators` instead
of the live project.

## Commands

```bash
npm run dev       # Vite dev server on http://localhost:5173
npm run build     # tsc --noEmit && vite build  → dist/
npm run preview   # serve the production build
```

## Current state

**There is no auth gate.** The app opens directly onto `src/app/Welcome.tsx`
so UI work is not blocked behind signing in. `AuthProvider` still runs
underneath and `useAuth()` is available, but nothing is currently signed in.

The consequence worth remembering: **Firestore reads will be denied while
signed out**, because the rules require an authenticated caller. The module
cards on the welcome screen are static placeholders for exactly that reason.
Reintroduce a sign-in screen before wiring any screen to live data — the
`authService.signIn` / `onAuthChange` path in `src/lib` is unchanged and
ready.

The six core modules still need building on top of this shell.
