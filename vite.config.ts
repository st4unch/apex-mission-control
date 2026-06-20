import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// Escape hatch: agents editing watched worktrees can trigger HMR/watcher storms
// and UI flicker. Set DISABLE_HMR=true to stop it (carried over from the prototype).
// @ts-expect-error process is a nodejs global
const disableHmr = process.env.DISABLE_HMR === "true";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: disableHmr
      ? false
      : host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: disableHmr
      ? null
      : {
          // 3. tell Vite to ignore watching `src-tauri`
          ignored: ["**/src-tauri/**"],
        },
  },
}));
