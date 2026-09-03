import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // Pinned so the local-time date maths in logQuery is deterministic, and so the
  // UK DST switchovers (both Sundays) are real cases the tests can assert on.
  test: { include: ["tests/**/*.test.{ts,tsx}"], env: { TZ: "Europe/London" } },
});
