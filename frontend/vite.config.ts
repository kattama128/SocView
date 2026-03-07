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
          // @emotion before the generic react check because @emotion/react
          // contains "react" in its path but belongs with emotion
          if (id.includes("@emotion")) {
            return "vendor-emotion";
          }
          // Only core React runtime goes here — no wrapper libs like
          // react-markdown or @monaco-editor/react that pull in large
          // non-react dep trees and would create circular chunks
          if (
            /\/node_modules\/(react|react-dom|react-is|scheduler)(\/|$)/.test(id)
          ) {
            return "vendor-react";
          }
          if (id.includes("@mui/icons-material")) {
            return "vendor-mui-icons";
          }
          if (id.includes("@mui")) {
            return "vendor-mui";
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
