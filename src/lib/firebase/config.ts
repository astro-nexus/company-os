/**
 * Firebase client configuration.
 *
 * Reads from whichever env mechanism the host provides, in order:
 *   1. `import.meta.env` — Vite (the frontend). vite.config.ts sets
 *      envPrefix to ["VITE_", "NEXT_PUBLIC_"], so either name works.
 *   2. `process.env` — Node scripts, tests, and Next.js if it ever lands.
 *
 * Both prefixes are accepted for every value, so one .env.local serves the
 * whole repo with nothing duplicated to drift out of sync.
 *
 * NOTE ON SECRECY: Firebase web config is not a secret — it ships inside every
 * client bundle by design, and Firestore Security Rules are the real access
 * boundary. A Firebase Admin service-account key is the opposite: it must
 * never carry a VITE_/NEXT_PUBLIC_ prefix, live under src/, or be committed.
 */

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

type EnvBag = Record<string, string | undefined>;

/**
 * Vite statically replaces `import.meta.env` with the inlined env object at
 * build time, so indexing into it works in both dev and production builds.
 * In plain Node, `import.meta.env` is simply absent and this yields {}.
 */
const viteEnv: EnvBag =
  (import.meta as unknown as {env?: EnvBag}).env ?? {};

const nodeEnv: EnvBag =
  typeof process !== "undefined" && process.env ? process.env : {};

/** Looks up a bare key under both supported prefixes, Vite first. */
function readEnv(bareKey: string): string | undefined {
  const candidates = [`VITE_${bareKey}`, `NEXT_PUBLIC_${bareKey}`];
  for (const key of candidates) {
    const value = viteEnv[key] ?? nodeEnv[key];
    if (value && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

const CONFIG_KEYS: Record<keyof FirebaseClientConfig, string> = {
  apiKey: "FIREBASE_API_KEY",
  authDomain: "FIREBASE_AUTH_DOMAIN",
  projectId: "FIREBASE_PROJECT_ID",
  storageBucket: "FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "FIREBASE_MESSAGING_SENDER_ID",
  appId: "FIREBASE_APP_ID",
};

/**
 * The IANA timezone that defines a working day. Must match COMPANY_TIMEZONE
 * in the Cloud Functions environment, otherwise client and server disagree
 * about which day a check-in belongs to.
 */
export const COMPANY_TIMEZONE: string =
  readEnv("COMPANY_TIMEZONE") ?? "Asia/Yangon";

/** True when the app should talk to the local emulator suite. */
export const USE_EMULATORS: boolean = readEnv("USE_EMULATORS") === "true";

/**
 * Builds the client config from environment variables.
 *
 * Reports every missing variable at once rather than failing later inside the
 * Firebase SDK with an opaque error.
 */
export function getFirebaseConfigFromEnv(): FirebaseClientConfig {
  const entries = Object.entries(CONFIG_KEYS) as [
    keyof FirebaseClientConfig,
    string,
  ][];

  const missing: string[] = [];
  const config = {} as FirebaseClientConfig;

  for (const [field, bareKey] of entries) {
    const value = readEnv(bareKey);
    if (!value) {
      missing.push(`VITE_${bareKey}`);
    } else {
      config[field] = value;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      "Missing Firebase environment variables: " +
        missing.join(", ") +
        ". Copy .env.example to .env.local, then restart the dev server — " +
        "Vite only reads env files at startup.",
    );
  }

  return config;
}
