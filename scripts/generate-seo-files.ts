/**
 * Generates the sitemap index (public/sitemap.xml) and its child sitemaps from
 * committed repository data only -- no network, no clock.
 *
 *   npm run seo:generate          write public/sitemap*.xml
 *   npm run seo:check             exit 1 if the committed sitemaps or the
 *                                 vercel.json legacy matchup redirects are stale
 *   npm run seo:legacy-redirects  rewrite only the legacy matchup redirects in
 *                                 vercel.json (production-sensitive: review the diff)
 *
 * `npm run build` runs this first (prebuild -> seo:generate), so GitHub
 * workflows that invoke `npm run build` regenerate the sitemaps. Current
 * Vercel production evidence (docs/vercel-automation-preview-builds.md)
 * suggests Vercel may invoke `vite build` directly, skipping prebuild; Vercel
 * may therefore deploy the committed sitemap files without running this
 * script. Those files are intentionally tracked as the production-safe
 * fallback -- keep them current with `npm run seo:check`.
 *
 * public/robots.txt is a static committed file that declares /sitemap.xml.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSitemaps } from "./lib/seo-sitemap";
import {
  VERCEL_CONFIG_PATH,
  expectedLegacyMatchupRedirects,
  legacyMatchupRedirectsInSync,
  spliceLegacyMatchupRedirects,
} from "./lib/seo-legacy-matchup-redirects";

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public");

function writeLegacyRedirects() {
  const current = readFileSync(VERCEL_CONFIG_PATH, "utf8");
  const next = spliceLegacyMatchupRedirects(current);
  if (next !== current) writeFileSync(VERCEL_CONFIG_PATH, next, "utf8");
  console.log(`vercel.json: ${expectedLegacyMatchupRedirects().length} legacy matchup redirect rules ${next === current ? "already current" : "written"}.`);
}

function main() {
  if (process.argv.includes("--write-legacy-redirects")) return writeLegacyRedirects();
  const checkOnly = process.argv.includes("--check");
  const { sections, files } = generateSitemaps();

  const stale: string[] = [];
  for (const [name, content] of files) {
    const target = resolve(PUBLIC_DIR, name);
    // Compare ignoring CRLF: Windows checkouts with core.autocrlf=true smudge
    // line endings without any content change.
    const current = existsSync(target) ? readFileSync(target, "utf8").replace(/\r\n/g, "\n") : null;
    if (current === content) continue;
    if (checkOnly) stale.push(name);
    else writeFileSync(target, content, "utf8");
  }

  for (const section of sections) console.log(`${section.file}: ${section.entries.length} URLs`);

  // vercel.json is read by Vercel before any build step, so it is only ever
  // checked here, never rewritten as part of seo:generate / prebuild.
  if (checkOnly && !legacyMatchupRedirectsInSync()) stale.push("vercel.json legacy matchup redirects (run npm run seo:legacy-redirects)");

  if (checkOnly && stale.length > 0) {
    console.error(`Stale sitemap files (run npm run seo:generate): ${stale.join(", ")}`);
    process.exit(1);
  }
  console.log(checkOnly ? "Sitemaps are up to date." : "Generated public/sitemap.xml and child sitemaps.");
}

main();
