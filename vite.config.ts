import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative paths, so the build works on GitHub Pages under any repo path.
  base: "./",
  test: {
    include: ["tests/**/*.test.ts"],
    // Long simulation tests run many thousand steps; CI machines can be slow.
    testTimeout: 60000,
  },
});
