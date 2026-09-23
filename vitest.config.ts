import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
    // The emulator is a single shared instance; parallel files would race on
    // the seeded fixture data.
    fileParallelism: false,
  },
});
