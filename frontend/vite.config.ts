import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (id.includes("@mui") || id.includes("@emotion")) {
            return "vendor-ui";
          }
          if (id.includes("react") || id.includes("scheduler")) {
            return "vendor-ui";
          }
          if (id.includes("axios")) {
            return "vendor-axios";
          }
          if (id.includes("recharts")) {
            return "vendor-charts";
          }
          return "vendor-misc";
        },
      },
    },
  },
});
