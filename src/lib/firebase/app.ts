/**
 * Memoised Firebase client singletons.
 *
 * Next.js fast refresh and Vite HMR both re-execute modules, so everything
 * here is guarded against double initialisation.
 */

import {FirebaseApp, getApps, initializeApp} from "firebase/app";
import {Auth, connectAuthEmulator, getAuth} from "firebase/auth";
import {
  Firestore,
  connectFirestoreEmulator,
  getFirestore,
} from "firebase/firestore";
import {
  Functions,
  connectFunctionsEmulator,
  getFunctions,
} from "firebase/functions";

import {FirebaseClientConfig, getFirebaseConfigFromEnv} from "./config";

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;
let functionsInstance: Functions | undefined;
let emulatorsConnected = false;

/**
 * Initialises the Firebase client app.
 *
 * @param config Optional explicit config. Omit it to read `NEXT_PUBLIC_*`
 *   environment variables; pass one when the bundler exposes env vars
 *   differently (for example Vite's `import.meta.env`).
 */
export function initFirebase(config?: FirebaseClientConfig): FirebaseApp {
  if (app) {
    return app;
  }
  const existing = getApps();
  app = existing.length > 0 ?
    existing[0] :
    initializeApp(config ?? getFirebaseConfigFromEnv());
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(initFirebase());
  }
  return authInstance;
}

export function getDb(): Firestore {
  if (!dbInstance) {
    dbInstance = getFirestore(initFirebase());
  }
  return dbInstance;
}

export function getFns(): Functions {
  if (!functionsInstance) {
    functionsInstance = getFunctions(initFirebase());
  }
  return functionsInstance;
}

/**
 * Points the client at the local emulator suite. Call once, early, during
 * local development only.
 */
export function connectEmulators(host = "127.0.0.1"): void {
  if (emulatorsConnected) {
    return;
  }
  emulatorsConnected = true;
  connectAuthEmulator(getFirebaseAuth(), `http://${host}:9099`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(getDb(), host, 8080);
  connectFunctionsEmulator(getFns(), host, 5001);
}
