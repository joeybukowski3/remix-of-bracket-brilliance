#!/usr/bin/env node
/**
 * run-numerology-x-post-locally.mjs
 *
 * Starts the local built-site preview server (mlb-x-local-preview-server.mjs
 * -- serves the already-built dist/ with SPA fallback), points
 * NUMEROLOGY_X_SCREENSHOT_URL at its numerology export route, runs the
 * numerology X poster as a child process against it, and always stops the
 * server afterward regardless of outcome.
 *
 * Used by the automated confirmed-lineup delivery path (poll-mlb-numerology-
 * delivery.yml) so the X screenshot is a pure function of the locally-built
 * site -- which was itself built from the shared, live-fetched selection
 * artifact just before this runs -- and never depends on a production
 * deploy landing inside the tight delivery window. See post-mlb-numerology-
 * to-x.mjs's `usingSharedArtifact` gate, which is what allows a `local`
 * data source for a live post in exactly this case.
 *
 * Usage: node scripts/run-numerology-x-post-locally.mjs --post|--post-text-only|--dry-run
 */
import { execFileSync } from "node:child_process";
import process from "node:process";
import { startLocalPreviewServer } from "./lib/mlb-x-local-preview-server.mjs";

const posterArgs = process.argv.slice(2);
if (posterArgs.length === 0) {
  console.error("Usage: node scripts/run-numerology-x-post-locally.mjs --post|--post-text-only|--dry-run");
  process.exit(2);
}

const { url, close } = await startLocalPreviewServer();
console.log(`[run-numerology-x-post-locally] Local preview server listening at ${url}`);
try {
  execFileSync("node", ["scripts/post-mlb-numerology-to-x.mjs", ...posterArgs], {
    stdio: "inherit",
    env: { ...process.env, NUMEROLOGY_X_SCREENSHOT_URL: `${url}/mlb/numerology/x-export` },
  });
} finally {
  await close();
}
