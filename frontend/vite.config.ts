import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backend = process.env.PINPOP_BACKEND ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": backend,
      "/uploads": backend,
      "/mcp": backend,
      "/socket.io": { target: backend, ws: true },
    },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
  },
});
