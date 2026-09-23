/**
 * Landing screen for v0.1.
 *
 * No auth gate yet: the app opens straight onto this so the UI can be built
 * out without signing in first. The AuthProvider still runs underneath, so
 * screens added here can call useAuth() as soon as sign-in is reintroduced.
 *
 * Note that Firestore reads will be denied while signed out — the rules
 * require an authenticated caller. Wire real data once a session exists.
 */

import {COMPANY_TIMEZONE, initFirebase} from "../lib";
import {useAuth} from "./AuthProvider";

interface ModuleCard {
  name: string;
  summary: string;
}

/** The v0.1 scope from CLAUDE.md, as placeholders to build into. */
const MODULES: ModuleCard[] = [
  {
    name: "Authentication",
    summary: "Sign in, session, and the users/{uid} profile behind it.",
  },
  {
    name: "Attendance",
    summary: "Check in, breaks, check out. Server-authoritative.",
  },
  {
    name: "Tasks",
    summary: "What needs to be accomplished. Assigned by a manager.",
  },
  {
    name: "Activities",
    summary: "What the employee actually did against a task.",
  },
  {
    name: "Employee Dashboard",
    summary: "Today at a glance: attendance, assigned work, logging.",
  },
  {
    name: "Manager Dashboard",
    summary: "Team attendance, task progress, and team activity.",
  },
];

export function Welcome() {
  const {user, profile} = useAuth();
  const projectId = initFirebase().options.projectId ?? "—";

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <h1 className="title">CompanyOS</h1>
          <p className="subtitle">
            NexusCode internal operations · v0.1 prototype
          </p>
        </div>
      </header>

      <p className="lede">
        The frontend is wired to Firebase and ready to build on. Each module
        below is a placeholder — replace them as the screens land.
      </p>

      <section className="grid">
        {MODULES.map((module) => (
          <article className="card" key={module.name}>
            <h2 className="card__title">{module.name}</h2>
            <p className="muted">{module.summary}</p>
            <p className="card__foot">
              <span className="tag tag--muted">Not built yet</span>
            </p>
          </article>
        ))}
      </section>

      <footer className="statusbar">
        <span className="statusbar__item">
          Firebase project <code>{projectId}</code>
        </span>
        <span className="statusbar__item">
          Timezone <code>{COMPANY_TIMEZONE}</code>
        </span>
        <span className="statusbar__item">
          {user ?
            `Signed in as ${profile?.name ?? user.email}` :
            "Signed out — Firestore reads will be denied until a session exists"}
        </span>
      </footer>
    </div>
  );
}
