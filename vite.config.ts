import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative paths, so the build works on GitHub Pages under any repo path.
  base: "./",
  build: {
    rollupOptions: {
      // Two pages: the game, and the performance test (bench.html).
      input: { main: "index.html", bench: "bench.html" },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
