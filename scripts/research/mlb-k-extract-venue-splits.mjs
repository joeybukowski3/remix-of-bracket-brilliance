/**
 * RESEARCH ONLY -- study mlb-k-projection-v3-workload-model
 *
 * Builds a leakage-safe PREGAME index of the pitcher's true season workload by
 * site, per (slateDate, pitcherId).
 *
 * Source: archived revisions of public/data/mlb/strikeout-prop-details.json.
 * pitcherVenueSplits.{home,away}.season carries gamesUsed, totalOuts,
 * battersFaced and strikeouts as known when the artifact was generated -- i.e.
 * before the slate's first pitch, so the current start is excluded by
 * construction. These are TRUE season totals, deeper than the 13-start ceiling
 * of the harvested start log, which is why the v3 neutral baseline anchors its
 * season term here rather than on the log.
 *
 * Leakage rules are identical to mlb-k-extract-season-bf.mjs:
 *   - a revision only contributes rows for its own slateDate
 *   - the commit date of the revision must not post-date that slateDate
 *   - the LAST qualifying revision for a slate wins (latest pregame snapshot)
 *
 * Also harvests, per (slateDate, team), the opposing-starter innings the team's
 * last five games produced. That is used ONLY as a coverage diagnostic for the
 * opponent model, never as a model input, because those rows do not identify a
 * starter whose own baseline could be reconstructed.
 *
 * Writes research-only output. No production file is read for state or written.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "mlb", "k-research", "v3-workload-model");
mkdirSync(OUT, { recursive: true });

const DETAILS = "public/data/mlb/strikeout-prop-details.json";

const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 512 });

const strictNum = (value) => {
  if (value === null || value === undefined || value === "") return null;
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
    .reverse();
}

function showJson(sha, file) {
  try {
    return JSON.parse(git(["show", `${sha}:${file}`]));
  } catch {
    return null;
  }
}

function siteSeason(splits, site) {
  const season = splits?.[site]?.season ?? null;
  if (!season) return null;
  const games = strictNum(season.gamesUsed);
  const outs = strictNum(season.totalOuts);
  if (games === null || outs === null || games <= 0) return null;
  return {
    games,
    outs,
    ip: outs / 3,
    ipPerStart: outs / 3 / games,
    battersFaced: strictNum(season.battersFaced),
    strikeouts: strictNum(season.strikeouts),
  };
}

const index = new Map();
const oppCoverage = new Map();
let scanned = 0;
let skippedPostSlate = 0;

for (const { sha, iso } of revisions(DETAILS)) {
  const doc = showJson(sha, DETAILS);
  if (!doc || !Array.isArray(doc.details)) continue;
  scanned += 1;
  const commitDate = String(iso).slice(0, 10);
  for (const detail of doc.details) {
    const slateDate = detail?.slateDate ?? doc.date ?? null;
    const pitcherId = strictNum(detail?.pitcherId);
    if (!slateDate || pitcherId === null) continue;
    if (commitDate > String(slateDate)) {
      skippedPostSlate += 1;
      continue;
    }

    const splits = detail?.pitcherVenueSplits ?? null;
    const home = siteSeason(splits, "home");
    const away = siteSeason(splits, "away");
    if (home || away) {
      const games = (home?.games ?? 0) + (away?.games ?? 0);
      const outs = (home?.outs ?? 0) + (away?.outs ?? 0);
      const bf = (home?.battersFaced ?? 0) + (away?.battersFaced ?? 0);
      index.set(`${slateDate}|${pitcherId}`, {
        slateDate,
        pitcherId,
        pitcher: detail?.pitcher ?? null,
        snapshotSha: sha,
        seasonGamesStarted: games > 0 ? games : null,
        seasonOuts: games > 0 ? outs : null,
        seasonIp: games > 0 ? outs / 3 : null,
        seasonIpPerStart: games > 0 ? outs / 3 / games : null,
        seasonBattersFaced: bf > 0 ? bf : null,
        seasonBfPerStart: games > 0 && bf > 0 ? bf / games : null,
        seasonBfPerIp: outs > 0 && bf > 0 ? bf / (outs / 3) : null,
        home: home ?? null,
        away: away ?? null,
      });
    }

    // Coverage diagnostic only.
    const team = detail?.opponent ?? null;
    const games = Array.isArray(detail?.opponentLastFiveGames) ? detail.opponentLastFiveGames : [];
    if (team && games.length) {
      const key = `${slateDate}|${team}`;
      oppCoverage.set(key, {
        slateDate,
        team,
        games: games.map((g) => ({
          date: g?.date ?? null,
          starterId: strictNum(g?.opposingStartingPitcherId),
          starter: g?.opposingStartingPitcher ?? null,
          ip: g?.opposingStarterInningsPitched ?? null,
        })),
      });
    }
  }
}

const entries = [...index.values()].sort((a, b) =>
  a.slateDate === b.slateDate ? a.pitcherId - b.pitcherId : a.slateDate < b.slateDate ? -1 : 1,
);

const payload = {
  meta: {
    studyId: "mlb-k-projection-v3-workload-model",
    generatedAt: new Date().toISOString(),
    source: DETAILS,
    revisionsScanned: scanned,
    rowsSkippedPostSlateSnapshot: skippedPostSlate,
    entries: entries.length,
    slates: [...new Set(entries.map((e) => e.slateDate))].length,
    withBothSites: entries.filter((e) => e.home && e.away).length,
    opponentCoverageRows: oppCoverage.size,
    note:
      "Season totals are pregame-only: the artifact is generated before first pitch, so the current " +
      "start is excluded by construction. Earned runs are not carried by this source.",
  },
  entries,
  opponentCoverage: [...oppCoverage.values()],
};

writeFileSync(path.join(OUT, "venue-split-index.json"), `${JSON.stringify(payload, null, 1)}\n`);
console.log(JSON.stringify(payload.meta, null, 2));
