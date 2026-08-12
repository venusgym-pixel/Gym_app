import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Each suite boots its own in-process Postgres; give the first one room.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
