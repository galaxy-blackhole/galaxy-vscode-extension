import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss(resolve(__dirname, "tailwind.config.ts")), autoprefixer()],
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode),
  },
  build: {
    outDir: "dist/webview",
    emptyOutDir: false,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4096,
    sourcemap: mode !== "production",
    rollupOptions: {
      output: {
        entryFileNames: "chat.js",
        assetFileNames: "chat.css",
      },
    },
    lib: {
      entry: resolve(__dirname, "webview/src/main.tsx"),
      name: "GalaxyCodeChat",
      formats: ["iife"],
      fileName: () => "chat.js",
    },
  },
}));
