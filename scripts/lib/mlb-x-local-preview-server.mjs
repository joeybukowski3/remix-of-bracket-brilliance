/**
 * mlb-x-local-preview-server.mjs
 *
 * Minimal static file server for the built SPA (dist/), with SPA fallback to
 * index.html so client-side routes like /mlb/hr-props/x-export resolve. Used
 * to render the bare X-export routes LOCALLY during Playwright capture -- the
 * screenshot never depends on a production deploy landing between the
 * readiness selection and the capture, which is what would otherwise let the
 * live table drift away from the selected rows (TOCTOU).
 *
 * Ephemeral: listens on an OS-assigned free port on 127.0.0.1, returns
 * { url, close }, and serves nothing but the already-built dist assets.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

function resolveFile(distDir, urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  // Prevent path traversal: resolve under distDir and verify containment.
  const candidate = path.normalize(path.join(distDir, clean));
  if (!candidate.startsWith(distDir)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return null;
}

/**
 * Start the server. Resolves to { url, close } once listening.
 * @param {{ distDir?: string, host?: string }} [options]
 */
export function startLocalPreviewServer({ distDir = path.join(process.cwd(), "dist"), host = "127.0.0.1" } = {}) {
  const root = path.normalize(distDir);
  const indexHtml = path.join(root, "index.html");
  if (!existsSync(indexHtml)) {
    return Promise.reject(new Error(`Local preview server: no build found at ${indexHtml}. Run \`npm run build\` first.`));
  }

  const server = createServer((req, res) => {
    const filePath = resolveFile(root, req.url || "/") || indexHtml; // SPA fallback
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    createReadStream(filePath)
      .on("error", () => {
        res.statusCode = 500;
        res.end("read error");
      })
      .pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, host, () => {
      const { port } = server.address();
      resolve({
        url: `http://${host}:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
