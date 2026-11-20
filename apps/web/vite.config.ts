import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
            return "vendor-react";
          }
          if (id.includes("/@tanstack/")) {
            return "vendor-query";
          }
          if (id.includes("/@xyflow/") || id.includes("/d3-")) {
            return "vendor-xyflow";
          }
          if (id.includes("/lucide-react/")) {
            return "vendor-icons";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 3200,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8280",
        changeOrigin: true,
      },
      "/mcp": {
        target: "http://127.0.0.1:8280",
        changeOrigin: true,
      },
      "/metrics": {
        target: "http://127.0.0.1:8280",
        changeOrigin: true,
      },
    },
  },
});
