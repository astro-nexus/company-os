/**
 * Vite configuration for the CompanyOS frontend.
 *
 * `envPrefix` deliberately includes NEXT_PUBLIC_ alongside VITE_. The data
 * layer in src/lib and the .env.example that ships with it were written
 * against NEXT_PUBLIC_* names; exposing that prefix here means a single
 * .env.local serves both, with no duplicated Firebase config to drift.
 *
 * Only client-safe values may ever carry these prefixes — every prefixed
 * variable is inlined into the browser bundle. Firebase web config is safe by
 * design (Security Rules are the boundary); an Admin service-account key is
 * not, and must never be named with either prefix.
 */

import {fileURLToPath} from "node:url";

import react from "@vitejs/plugin-react";
import {defineConfig} from "vite";

export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
