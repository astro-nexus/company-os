/**
 * Auth + profile context.
 *
 * Two subscriptions, not one: Firebase Auth tells us *who* is signed in, the
 * users/{uid} document tells us their role and department. Every screen needs
 * both, and the role must come from Firestore rather than the ID token so it
 * stays in step with what the Security Rules actually enforce.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {User} from "firebase/auth";

import {authService, type UserDoc} from "../lib";

export interface AuthState {
  /** "loading" until Firebase has restored any persisted session. */
  status: "loading" | "signedOut" | "signedIn";
  user: User | null;
  /** Null while the profile document is still loading, or if none exists. */
  profile: UserDoc | null;
  profileLoading: boolean;
  /** Set when the profile read was denied or failed. */
  profileError: string | null;
}

const initialState: AuthState = {
  status: "loading",
  user: null,
  profile: null,
  profileLoading: false,
  profileError: null,
};

const AuthContext = createContext<AuthState>(initialState);

export function AuthProvider({children}: {children: ReactNode}) {
  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    return authService.onAuthChange((next) => {
      setUser(next);
      setAuthResolved(true);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      setProfileError(null);
      return;
    }

    setProfileLoading(true);
    setProfileError(null);

    let cancelled = false;
    // watchUserDoc takes no error callback, so a denied read would otherwise
    // surface only in the console. getUserDoc first gives us a catchable read.
    authService
      .getUserDoc(user.uid)
      .then((doc) => {
        if (!cancelled) {
          setProfile(doc);
          setProfileLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setProfileError(describeError(error));
          setProfileLoading(false);
        }
      });

    const unsubscribe = authService.watchUserDoc(user.uid, (doc) => {
      if (!cancelled) {
        setProfile(doc);
        setProfileLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user]);

  const value = useMemo<AuthState>(
    () => ({
      status: !authResolved ? "loading" : user ? "signedIn" : "signedOut",
      user,
      profile,
      profileLoading,
      profileError,
    }),
    [authResolved, user, profile, profileLoading, profileError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** Firebase errors carry a `code`; anything else falls back to its message. */
export function describeError(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String((error as {code: unknown}).code);
    const message = (error as {message?: string}).message ?? "";
    return message ? `${code} — ${message}` : code;
  }
  return error instanceof Error ? error.message : String(error);
}
