import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const appBasePath = process.env.VITE_APP_BASE_PATH || "/";
  const normalizedBase = appBasePath.endsWith("/") ? appBasePath : `${appBasePath}/`;

  return ({
  base: normalizedBase,
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    fs: {
      // Vite's defaults plus local NBA.com research data, which NBA.com Terms
      // of Use restrict and which must not be served (the dev server binds
      // every interface). See docs/nba-player-props-phase-2a.md.
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/data/nba/**"],
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  });
});
