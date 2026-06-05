import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Project "eval" — CHỈ gom scripts/eval/**/*.eval.ts (live, host-only). `npm test`
// dùng vitest.config.ts (mặc định gom *.test.ts) nên KHÔNG đụng file *.eval.ts này.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["scripts/eval/**/*.eval.ts"],
    passWithNoTests: true,  // Task 1: chưa có *.eval.ts (suite.eval.ts ở Task sau) → exit 0
    testTimeout: 180_000,   // model 8B + k lần
    hookTimeout: 60_000,
    pool: "forks",
    maxWorkers: 1,          // tuần tự — không nã song song vào Ollama (Vitest 4: thay singleFork)
    isolate: false,
  },
});
