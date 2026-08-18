import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Each suite boots its own in-process Postgres; give the first one room.
    testTimeout: 30_000,
    hookTimeout: 60_000,

    /* One file at a time. Each PGlite instance is a whole Postgres compiled
       to WASM and holds its heap for the life of the process, so several
       files booting one each in parallel exhausts V8. */
    fileParallelism: false,

    pool: "forks",
    poolOptions: {
      forks: {
        /* A fresh fork per file, so a finished suite's WASM heap is actually
           returned to the OS. Reusing one process accumulated it until the
           seventh suite died with "Ineffective mark-compacts near heap
           limit" — and the failure looks like a test crash, not a memory
           one, which cost a while to place.

           The larger heap is belt and braces: it is set here rather than
           through NODE_OPTIONS so it works the same on Windows, where the
           inline env-var form of the npm script does not. */
        singleFork: false,
        maxForks: 1,
        execArgv: ["--max-old-space-size=4096"],
      },
    },
  },
});
