import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// Keep the app shell, editor stack, drawing stack, and platform bridge in separate
// cacheable bundles. Glyphary is a desktop app, so chunking is mostly about
// parse/cache behavior and useful build warnings rather than mobile network
// waterfalls.
function manualChunks(id: string) {
  if (!id.includes("node_modules")) {
    return undefined;
  }

  if (id.includes("@tiptap/") || id.includes("prosemirror-")) {
    return "editor-vendor";
  }

  if (id.includes("highlight.js") || id.includes("lowlight")) {
    return "syntax-vendor";
  }

  if (id.includes("@tauri-apps/") || id.includes("tauri-plugin-")) {
    return "tauri-vendor";
  }

  if (id.includes("react") || id.includes("scheduler")) {
    return "react-vendor";
  }

  return undefined;
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    // Excalidraw is loaded only when a drawing is opened and currently emits one
    // large async chunk. Keep the threshold above that known lazy feature while
    // still warning if a future bundle grows into genuinely accidental bloat.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
}));
