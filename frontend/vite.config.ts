import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },
  build: {
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (id.includes("@mui/icons-material")) {
            return "vendor-mui-icons";
          }
          if (id.includes("@mui")) {
            return "vendor-mui";
          }
          if (id.includes("@emotion")) {
            return "vendor-emotion";
          }
          if (id.includes("react") || id.includes("scheduler")) {
            return "vendor-react";
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
