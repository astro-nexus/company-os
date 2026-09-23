/**
 * Top-level shell.
 *
 * There is no auth gate and no router yet — one screen, mounted directly, so
 * UI work is not blocked behind signing in. Add routing when there is more
 * than one destination to route to.
 */

import {AuthProvider} from "./AuthProvider";
import {Welcome} from "./Welcome";

export function App() {
  return (
    <AuthProvider>
      <Welcome />
    </AuthProvider>
  );
}
