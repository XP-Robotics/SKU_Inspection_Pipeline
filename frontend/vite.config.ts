import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The FastAPI backend (core/backend chat) is expected at VITE_API_TARGET.
// In dev we proxy /api -> backend so the frontend uses same-origin relative
// URLs. When the mock layer is enabled (VITE_USE_MOCKS=true) requests never
// leave the browser, so the proxy target is irrelevant.
const apiTarget = process.env.VITE_API_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
