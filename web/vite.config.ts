import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const rootEnvironment = loadEnv(mode, "..", "");
  const apiPort = rootEnvironment.PORT ?? "8080";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": `http://localhost:${apiPort}`,
      },
    },
    build: {
      target: "es2022",
      sourcemap: false,
    },
  };
});
