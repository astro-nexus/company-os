/**
 * Browser entry point.
 *
 * Firebase is initialised once, before React mounts, so that any component
 * may call the src/lib services without ordering concerns. A missing or
 * malformed .env.local is reported on the page rather than as a blank screen.
 */

import {StrictMode} from "react";
import {createRoot} from "react-dom/client";

import {connectEmulators, initFirebase} from "./lib";
import {App} from "./app/App";
import "./app/styles.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("index.html is missing <div id=\"root\">");
}

const root = createRoot(container);

try {
  initFirebase();
  if (import.meta.env.VITE_USE_EMULATORS === "true") {
    connectEmulators();
  }
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} catch (error) {
  root.render(
    <main className="shell shell--centered">
      <div className="card card--form">
        <h1 className="title">Configuration error</h1>
        <p className="alert alert--error">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <p className="hint">
          Copy <code>.env.example</code> to <code>.env.local</code>, then
          restart <code>npm run dev</code> — Vite only reads env files at
          startup.
        </p>
      </div>
    </main>,
  );
}
