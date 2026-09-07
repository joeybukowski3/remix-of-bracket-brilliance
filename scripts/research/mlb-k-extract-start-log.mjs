/**
 * RESEARCH ONLY -- study mlb-k-projection-v3-workload-model
 *
 * Builds the START LOG that the v3 workload model needs and the k-props v2
 * archive does not carry.
 *
 * The v2 archive (pregame-archive.json) keeps only five recent starts per row,
 * stripped down to k / ip / bf / pc with no date, no opponent and no site. The
 * v3 model needs, for every completed start in the window:
 *
 *   date, gamePk, pitcherId, opponent, home/away, outs, BF, pitches,
 *   strikeouts, hits allowed, walks allowed
 *
 * Source: every archived revision of public/data/mlb/strikeout-prop-details.json.
 * Each detail row carries pitcherRecentStarts / pitcherLastFiveStarts, which are
 * COMPLETED prior starts as known when that artifact was generated. A start is a
 * fact about a finished game, so the union across revisions is a start log; the
 * leakage rule is applied at USE time (a projection for slate D may read only
 * starts whose date is strictly before D), not at harvest time.
 *
 * Earned runs are NOT present in this source. The reliability model therefore
 * uses hits + walks (baserunners) and batters faced per out as its
 * performance-quality evidence; see compute-workload-projection-v3.mjs.
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

/** Strict numeric read: null / undefined / "" are ABSENT, never zero. */
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

/** "5.2" -> 17 outs. Baseball fractional innings are thirds, not decimals. */
function ipToOuts(ip) {
  if (ip === null || ip === undefined || ip === "") return null;
  const text = String(ip);
  if (!text.includes(".")) {
    const whole = Number(text);
    return Number.isFinite(whole) ? Math.round(whole * 3) : null;
  }
  const [whole, frac] = text.split(".");
  const w = Number(whole);
  const f = Number(frac);
  if (!Number.isFinite(w) || !Number.isFinite(f)) return null;
  return w * 3 + f;
}

const starts = new Map();
let revisionsScanned = 0;
let observationsSeen = 0;

function harvest(list, detail) {
  if (!Array.isArray(list)) return;
  const pitcherId = strictNum(detail?.pitcherId);
  if (pitcherId === null) return;
  for (const start of list) {
    const gamePk = strictNum(start?.gamePk);
    const date = start?.date ?? null;
    if (gamePk === null || !date) continue;
    // gamesStarted 0 means the appearance was in relief: not a start.
    const gamesStarted = strictNum(start?.gamesStarted);
    if (gamesStarted !== null && gamesStarted < 1) continue;
    const outs = start?.outsRecorded != null ? strictNum(start.outsRecorded) : ipToOuts(start?.inningsPitched);
    const bf = strictNum(start?.battersFaced);
    if (outs === null || outs < 0) continue;
    observationsSeen += 1;
    const key = `${gamePk}|${pitcherId}`;
    const existing = starts.get(key);
    const record = {
      gamePk,
      pitcherId,
      pitcher: detail?.pitcher ?? null,
      date,
      season: strictNum(start?.season),
      team: detail?.team ?? null,
      teamId: strictNum(detail?.teamId),
      opponent: start?.opponentAbbr ?? start?.opponent ?? null,
      opponentId: strictNum(start?.opponentId),
      isHome: typeof start?.isHome === "boolean" ? start.isHome : start?.site === "home" ? true : start?.site === "away" ? false : null,
      outs,
      ip: outs / 3,
      bf,
      pitches: strictNum(start?.pitchCount),
      strikeouts: strictNum(start?.strikeouts),
      hits: strictNum(start?.hitsAllowed),
      walks: strictNum(start?.walksAllowed),
    };
    // Prefer the most complete observation of the same start.
    const completeness = (r) =>
      [r.bf, r.pitches, r.strikeouts, r.hits, r.walks, r.opponentId, r.isHome].filter((v) => v !== null).length;
    if (!existing || completeness(record) > completeness(existing)) starts.set(key, record);
  }
}

for (const { sha } of revisions(DETAILS)) {
  const doc = showJson(sha, DETAILS);
  if (!doc || !Array.isArray(doc.details)) continue;
  revisionsScanned += 1;
  for (const detail of doc.details) {
    harvest(detail.pitcherRecentStarts, detail);
    harvest(detail.pitcherLastFiveStarts, detail);
  }
}

const log = [...starts.values()].sort((a, b) =>
  a.date === b.date ? a.pitcherId - b.pitcherId : a.date < b.date ? -1 : 1,
);

const dates = [...new Set(log.map((s) => s.date))].sort();
const pitchers = new Set(log.map((s) => s.pitcherId));
const perPitcher = [...pitchers].map((id) => log.filter((s) => s.pitcherId === id).length).sort((a, b) => a - b);
const q = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : null);

const meta = {
  studyId: "mlb-k-projection-v3-workload-model",
  extractedAt: new Date().toISOString(),
  source: DETAILS,
  revisionsScanned,
  observationsSeen,
  distinctStarts: log.length,
  distinctPitchers: pitchers.size,
  dateRange: { first: dates[0] ?? null, last: dates[dates.length - 1] ?? null, distinctDates: dates.length },
  startsPerPitcher: { min: perPitcher[0] ?? null, p25: q(perPitcher, 0.25), median: q(perPitcher, 0.5), p75: q(perPitcher, 0.75), max: perPitcher[perPitcher.length - 1] ?? null },
  fieldCoverage: Object.fromEntries(
    ["bf", "pitches", "strikeouts", "hits", "walks", "opponentId", "isHome"].map((f) => [
      f,
      log.filter((s) => s[f] !== null).length,
    ]),
  ),
  earnedRunsAvailable: false,
};

writeFileSync(path.join(OUT, "start-log.json"), `${JSON.stringify({ meta, starts: log }, null, 1)}\n`);
console.log(JSON.stringify(meta, null, 1));
