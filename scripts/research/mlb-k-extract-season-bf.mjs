/**
 * RESEARCH ONLY -- study mlb-k-high-line-calibration-v2 (shrinkage experiment)
 *
 * Builds a leakage-safe pregame index of SEASON BATTERS FACED per
 * (slateDate, pitcherId).
 *
 * Source: archived revisions of public/data/mlb/strikeout-prop-details.json.
 * Each detail row carries pitcherVenueSplits.{home,away}.season.battersFaced,
 * which is the pitcher's season BF as known when the artifact was generated --
 * i.e. before the slate's first pitch. Season BF is the sample-size signal
 * Variant A needs and it is not present in the k-props v2 archive.
 *
 * Leakage rules (identical to mlb-k-extract-history.mjs):
 *   - a revision only contributes rows for its own slateDate
 *   - the commit date of the revision must not post-date that slateDate
 *   - the LAST qualifying revision for a slate wins (latest pregame snapshot)
 *
 * The current game's own batters faced can never be included: the artifact is
 * generated pregame, so the season totals stop at the prior start.
 *
 * Writes research-only output. No production file is read for state or written.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "mlb", "k-research", "high-line-calibration", "shrinkage-experiment");
mkdirSync(OUT, { recursive: true });

const DETAILS = "public/data/mlb/strikeout-prop-details.json";

const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 512 });

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function revisions(file) {
  return git(["log", "--format=%H|%cI", "--", file])
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, iso] = line.split("|");
      return { sha, iso };
    })
    .reverse(); // oldest first: a later qualifying revision overwrites
}

function showJson(sha, file) {
  try {
    return JSON.parse(git(["show", `${sha}:${file}`]));
  } catch {
    return null;
  }
}

/** Season BF = home season BF + away season BF, when either side is present. */
function seasonBattersFaced(detail) {
  const splits = detail?.pitcherVenueSplits ?? null;
  if (!splits) return null;
  const home = num(splits?.home?.season?.battersFaced);
  const away = num(splits?.away?.season?.battersFaced);
  if (home === null && away === null) return null;
  return (home ?? 0) + (away ?? 0);
}

/** Season games started, same construction. Used only for diagnostics. */
function seasonGamesStarted(detail) {
  const splits = detail?.pitcherVenueSplits ?? null;
  if (!splits) return null;
  const home = num(splits?.home?.season?.gamesUsed);
  const away = num(splits?.away?.season?.gamesUsed);
  if (home === null && away === null) return null;
  return (home ?? 0) + (away ?? 0);
}

const index = new Map();
let scanned = 0;
let skippedPostSlate = 0;

for (const { sha, iso } of revisions(DETAILS)) {
  const doc = showJson(sha, DETAILS);
  if (!doc || !Array.isArray(doc.details)) continue;
  scanned += 1;
  const commitDate = String(iso).slice(0, 10);
  for (const detail of doc.details) {
    const slateDate = detail?.slateDate ?? doc.date ?? null;
    const pitcherId = detail?.pitcherId ?? null;
    if (!slateDate || pitcherId == null) continue;
    if (commitDate > String(slateDate)) {
      skippedPostSlate += 1;
      continue;
    }
    const bf = seasonBattersFaced(detail);
    if (bf === null) continue;
    index.set(`${slateDate}|${pitcherId}`, {
      slateDate,
      pitcherId,
      snapshotSha: sha,
      snapshotAt: iso,
      seasonBattersFaced: bf,
      seasonGamesStarted: seasonGamesStarted(detail),
    });
  }
}

const entries = [...index.values()].sort((a, b) =>
  a.slateDate === b.slateDate ? a.pitcherId - b.pitcherId : a.slateDate < b.slateDate ? -1 : 1,
);

const payload = {
  meta: {
    study: "mlb-k-high-line-calibration-v2-shrinkage",
    generatedAt: new Date().toISOString(),
    source: DETAILS,
    revisionsScanned: scanned,
    rowsSkippedPostSlateSnapshot: skippedPostSlate,
    entries: entries.length,
    slates: [...new Set(entries.map((entry) => entry.slateDate))].length,
    note:
      "seasonBattersFaced is pregame-only: the artifact is generated before first pitch and the " +
      "current game is therefore excluded from the season totals by construction.",
  },
  entries,
};

writeFileSync(path.join(OUT, "season-bf-index.json"), `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify(payload.meta, null, 2));
