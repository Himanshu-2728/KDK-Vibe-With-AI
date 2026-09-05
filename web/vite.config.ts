import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const serverPort = process.env.PORT ?? "3001";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": `http://localhost:${serverPort}`,
      "/media": `http://localhost:${serverPort}`,
    },
  },
});