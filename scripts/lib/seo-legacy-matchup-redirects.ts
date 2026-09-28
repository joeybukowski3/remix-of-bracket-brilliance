/**
 * vercel.json 301 rules for legacy /nfl/matchups/:gameSlug URLs.
 *
 * The rules are derived from the 2026 schedule by buildLegacyNflMatchupRedirects
 * (one rule per week, each listing that week's slugs explicitly) and are never
 * hand-edited. `npm run seo:check` fails when vercel.json and the generator
 * disagree; `npm run seo:legacy-redirects` rewrites only those rules in place,
 * leaving every other byte of vercel.json untouched.
 *
 * Drift is safe but should be fixed: if a game later moves week, its stale rule
 * lands on the old week URL, which the page corrects to the new week client-side.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import {
  LEGACY_NFL_MATCHUP_SEASON,
  NFL_MATCHUPS_BASE_PATH,
  buildLegacyNflMatchupRedirects,
  type LegacyNflMatchupRedirect,
} from "@/lib/nfl/matchupRoutes";
import { loadNflSeasonGames } from "./seo-sitemap-routes";

export const VERCEL_CONFIG_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "vercel.json");

/** Rules this module owns are recognised by this exact source prefix. */
export const LEGACY_MATCHUP_SOURCE_PREFIX = `${NFL_MATCHUPS_BASE_PATH}/:gameSlug(`;

/** The rules are inserted directly after this existing rule. */
const ANCHOR_SOURCE = "/nfl/guide/team/:teamSlug";

type VercelRedirect = { source: string; destination: string; permanent?: boolean; has?: unknown };

export function expectedLegacyMatchupRedirects(): LegacyNflMatchupRedirect[] {
  const guide = getNflSeasonGuide(LEGACY_NFL_MATCHUP_SEASON);
  if (!guide) throw new Error(`No NFL season guide for ${LEGACY_NFL_MATCHUP_SEASON}`);
  return buildLegacyNflMatchupRedirects(loadNflSeasonGames(LEGACY_NFL_MATCHUP_SEASON), guide);
}

export function readVercelRedirects(text = readFileSync(VERCEL_CONFIG_PATH, "utf8")): VercelRedirect[] {
  const parsed = JSON.parse(text) as { redirects?: VercelRedirect[] };
  return parsed.redirects ?? [];
}

export function committedLegacyMatchupRedirects(text?: string): VercelRedirect[] {
  return readVercelRedirects(text).filter((rule) => rule.source.startsWith(LEGACY_MATCHUP_SOURCE_PREFIX));
}

export function legacyMatchupRedirectsInSync(text?: string): boolean {
  return JSON.stringify(committedLegacyMatchupRedirects(text)) === JSON.stringify(expectedLegacyMatchupRedirects());
}

function formatRule(rule: LegacyNflMatchupRedirect, eol: string): string {
  return [
    "    {",
    `      "source": ${JSON.stringify(rule.source)},`,
    `      "destination": ${JSON.stringify(rule.destination)},`,
    `      "permanent": ${rule.permanent}`,
    "    },",
  ].join(eol);
}

/**
 * Return vercel.json text with the legacy matchup rules replaced by the
 * generator output, placed right after the /nfl/guide/team rule. Text-level so
 * the rest of the file keeps its formatting; the result is re-parsed to prove
 * it is still valid JSON with unchanged non-matchup rules.
 */
export function spliceLegacyMatchupRedirects(text: string, rules = expectedLegacyMatchupRedirects()): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const ruleBlock = /[ \t]*\{\s*"source": "\/nfl\/matchups\/:gameSlug\([^"]*\)",\s*"destination": "[^"]*",\s*"permanent": true\s*\},\r?\n/g;
  const stripped = text.replace(ruleBlock, "");

  const anchor = stripped.indexOf(`"source": ${JSON.stringify(ANCHOR_SOURCE)}`);
  if (anchor < 0) throw new Error(`vercel.json has no ${ANCHOR_SOURCE} redirect to anchor the matchup rules`);
  const anchorEnd = stripped.indexOf(`},${eol}`, anchor);
  if (anchorEnd < 0) throw new Error(`Could not find the end of the ${ANCHOR_SOURCE} redirect`);
  const insertAt = anchorEnd + `},${eol}`.length;
  const block = rules.map((rule) => `${formatRule(rule, eol)}${eol}`).join("");
  const next = `${stripped.slice(0, insertAt)}${block}${stripped.slice(insertAt)}`;

  const before = readVercelRedirects(text).filter((rule) => !rule.source.startsWith(LEGACY_MATCHUP_SOURCE_PREFIX));
  const after = readVercelRedirects(next).filter((rule) => !rule.source.startsWith(LEGACY_MATCHUP_SOURCE_PREFIX));
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Splice altered non-matchup redirects");
  if (JSON.stringify(committedLegacyMatchupRedirects(next)) !== JSON.stringify(rules)) {
    throw new Error("Splice did not produce the expected matchup redirects");
  }
  return next;
}
