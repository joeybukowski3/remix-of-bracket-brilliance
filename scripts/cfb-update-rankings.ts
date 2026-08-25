import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  normalizeOfficialPoll,
  toRankMap,
  type CfbdRankingWeekRaw,
  type CfbOfficialPollKind,
  type CfbOfficialPollResult,
} from "../src/lib/cfb/pipeline/normalizeRankings";
import type {
  CfbOfficialPollArtifact,
  CfbOfficialRankingsArtifact,
} from "../src/data/cfb/season2026/officialRankings";
import { writeAtomic } from "./lib/cfb-cfbd-client";

const ROOT = process.env.CFB_TEST_ROOT?.trim() || resolve(import.meta.dirname, "..");
const RAW = resolve(ROOT, "data", "cfb", "cfbd", "raw");
const OUTPUT_PATH = resolve(ROOT, "data", "generated", "cfb", "2026-rankings.json");
const SEASON = Number(process.env.CFB_SEASON ?? 2026);

const read = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

/**
 * Rankings-only artifact update.
 *
 * Reads the raw /rankings cache, selects+validates the latest AP and CFP polls,
 * and rewrites data/generated/cfb/<season>-rankings.json. Nothing else in the
 * repo is touched — no schedule, no ratings, no calibration.
 *
 * Last-known-good policy. Four outcomes are distinguished, and only the first
 * two are failures:
 *   A. endpoint/cache failure (unreadable or non-array raw cache)
 *        -> keep the previously committed poll for BOTH kinds, exit non-zero.
 *   B. a poll was found but failed validation (wrong size, duplicate ranks or
 *      teams, ranks outside 1-25, unmapped/non-FBS school)
 *        -> keep that poll's previously committed value, exit non-zero.
 *   C. a poll is legitimately absent (no CFP poll before November; no AP poll
 *      before the preseason release)
 *        -> publish null for that poll, exit zero. This is a normal state.
 *   D. an individual team is simply unranked
 *        -> it is absent from the rank map; the UI shows its JKB fallback.
 *
 * A team is never assigned rank 26+, and receiving-votes teams never become
 * numeric ranks: only the poll's own 1-25 entries are ingested.
 */

type PollOutcome = {
  artifact: CfbOfficialPollArtifact | null;
  status: "published" | "absent" | "kept-last-known-good";
  errors: string[];
};

function readPreviousArtifact(): CfbOfficialRankingsArtifact | null {
  try {
    return read<CfbOfficialRankingsArtifact>(OUTPUT_PATH);
  } catch {
    return null;
  }
}

function resolvePoll(
  kind: CfbOfficialPollKind,
  result: CfbOfficialPollResult,
  previous: CfbOfficialPollArtifact | null,
): PollOutcome {
  if (result.ok) {
    return {
      artifact: {
        pollName: result.selection.pollName,
        seasonType: result.selection.seasonType,
        week: result.selection.week,
        ranks: toRankMap(result.selection),
      },
      status: "published",
      errors: [],
    };
  }
  if (result.reason === "absent") {
    // Case C: legitimately not published yet. Publishing null here is correct —
    // and because a previously-published poll can never "unpublish", a poll
    // that WAS committed is preserved rather than blanked.
    if (previous !== null) {
      return { artifact: previous, status: "kept-last-known-good", errors: result.errors };
    }
    return { artifact: null, status: "absent", errors: result.errors };
  }
  // Case B: present but invalid — never overwrite good data with bad.
  return { artifact: previous, status: "kept-last-known-good", errors: result.errors };
}

function main() {
  const previous = readPreviousArtifact();
  const previousAp = previous?.polls?.ap ?? null;
  const previousCfp = previous?.polls?.cfp ?? null;

  let rawWeeks: CfbdRankingWeekRaw[] | null = null;
  let endpointError: string | null = null;
  try {
    const parsed = read<unknown>(resolve(RAW, `rankings-${SEASON}.json`));
    if (!Array.isArray(parsed)) throw new Error("raw rankings cache is not a JSON array");
    rawWeeks = parsed as CfbdRankingWeekRaw[];
  } catch (error) {
    endpointError = (error as Error).message;
  }

  if (rawWeeks === null) {
    // Case A. Leave the committed artifact exactly as-is (no write at all, so a
    // ranked team can never suddenly fall back to a JKB badge) and fail loudly.
    console.error(
      `[cfb:update-rankings] raw rankings cache unavailable — keeping last-known-good artifact untouched: ${endpointError}`,
    );
    process.exitCode = 1;
    return;
  }

  const ap = resolvePoll("ap", normalizeOfficialPoll(rawWeeks, "ap"), previousAp);
  const cfp = resolvePoll("cfp", normalizeOfficialPoll(rawWeeks, "cfp"), previousCfp);

  const invalid = [
    ...(ap.status === "kept-last-known-good" && ap.errors.length > 0 ? [`AP: ${ap.errors.join("; ")}`] : []),
    ...(cfp.status === "kept-last-known-good" && cfp.errors.length > 0 ? [`CFP: ${cfp.errors.join("; ")}`] : []),
  ];

  const next: CfbOfficialRankingsArtifact = {
    season: SEASON,
    source: "cfbd:/rankings",
    generatedAt: new Date().toISOString(),
    polls: { ap: ap.artifact, cfp: cfp.artifact },
  };

  // Deterministic output: rank maps are team-id sorted by toRankMap, and a
  // re-run over identical input differs only in generatedAt — which is why the
  // workflow's change detection compares polls, not the whole file.
  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  const pollsUnchanged =
    previous !== null &&
    JSON.stringify(previous.polls) === JSON.stringify(next.polls) &&
    previous.season === next.season;

  if (pollsUnchanged) {
    console.log("[cfb:update-rankings] no official poll changes; artifact left untouched.");
  } else {
    writeAtomic(OUTPUT_PATH, serialized);
  }

  const describe = (kind: string, outcome: PollOutcome) =>
    `${kind}=${outcome.status}` +
    (outcome.artifact ? ` (${outcome.artifact.pollName} wk ${outcome.artifact.week}, ${Object.keys(outcome.artifact.ranks).length} teams)` : " (none)");

  console.log(`[cfb:update-rankings] ${describe("AP", ap)}; ${describe("CFP", cfp)}`);

  if (invalid.length > 0) {
    console.error(
      `[cfb:update-rankings] rejected invalid poll data, kept last-known-good: ${invalid.join(" | ")}`,
    );
    process.exitCode = 1;
  }
}

main();
