import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Frontend unit/component tests (jsdom). Separate from the Tauri vite.config so the
// app build is untouched.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
