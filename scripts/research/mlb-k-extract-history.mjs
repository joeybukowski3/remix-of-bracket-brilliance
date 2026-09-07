/**
 * RESEARCH ONLY -- study mlb-k-high-line-calibration-v1
 *
 * Extracts a leakage-safe pregame archive from git history.
 *
 * Pregame rows come from every archived revision of k-props-v2-shadow.json.
 * For each (slateDate, pitcherId) we keep the last revision whose own
 * slateDate equals the row slateDate, which is by construction a pregame
 * artifact: the generator only runs before first pitch, and the artifact is
 * regenerated (not back-edited) on later slates.
 *
 * Actual outcomes come from a separate harvest of start logs found in later
 * snapshots of strikeout-prop-details.json, keyed by (gamePk, pitcherId),
 * plus the independently graded top-k-performance.json records. Nothing about
 * an outcome is reconstructed from the projection itself.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "mlb", "k-research", "high-line-calibration");
mkdirSync(OUT, { recursive: true });

const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 512 });

function revisions(file) {
  return git(["log", "--format=%H|%cI", "--", file])
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, iso] = line.split("|");
      return { sha, iso };
    });
}

function showJson(sha, file) {
  try {
    return JSON.parse(git(["show", `${sha}:${file}`]));
  } catch {
    return null;
  }
}

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Number(null) is 0 and Number("") is 0, so `num` reports an ABSENT value as a
 * real zero. That is harmless for the pregame fields above, where a zero and a
 * blank mean the same thing to the study, but it is not harmless for a graded
 * outcome: an unplayed game whose actualStrikeOuts and battersFaced are still
 * null would otherwise be admitted as a genuine appearance of 0 strikeouts over
 * 0 batters faced. Outcome fields therefore use this strict reader instead.
 */
const strictNum = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** A graded outcome is real only if the pitcher actually faced someone. */
const isResolvedOutcome = (strikeouts, battersFaced) =>
  strikeouts !== null && battersFaced !== null && battersFaced > 0;

// ---------- pregame projections ----------
const V2 = "public/data/mlb/k-props-v2-shadow.json";
const v2Revs = revisions(V2);
// Oldest first, so a newer same-slate revision overwrites: last pregame snapshot wins.
v2Revs.reverse();

const pregame = new Map();
let scannedV2 = 0;

for (const { sha, iso } of v2Revs) {
  const doc = showJson(sha, V2);
  if (!doc || !Array.isArray(doc.rows)) continue;
  scannedV2 += 1;
  for (const row of doc.rows) {
    const slateDate = row.slateDate ?? doc.slateDate ?? null;
    const pitcherId = row?.pitcher?.id ?? null;
    if (!slateDate || pitcherId == null) continue;
    const v2 = row.v2 ?? {};
    const input = row?.inputs?.v2Input ?? {};
    const starts = Array.isArray(input?.pitcher?.recentStarts) ? input.pitcher.recentStarts : [];
    pregame.set(`${slateDate}|${pitcherId}`, {
      slateDate,
      snapshotSha: sha,
      snapshotAt: iso,
      artifactGeneratedAt: doc.generatedAt ?? null,
      pitcherId,
      pitcher: row?.pitcher?.name ?? null,
      team: row?.pitcher?.team ?? null,
      opponent: row?.pitcher?.opponent ?? null,
      handedness: row?.pitcher?.handedness ?? null,
      gamePk: row?.game?.gameId ?? null,
      pitcherIsHome: row?.game?.pitcherIsHome ?? null,
      kLine: num(row?.market?.kLine),
      oddsOver: row?.market?.oddsOver ?? null,
      oddsUnder: row?.market?.oddsUnder ?? null,
      book: row?.market?.book ?? null,
      legacyProjectedKs: num(row?.legacy?.projectedKs),
      legacyProjectedIP: num(row?.legacy?.projectedIP),
      legacyProjectedK9: num(row?.legacy?.projectedK9),
      v2ProjectedKs: num(v2.projectedStrikeouts),
      v2ProjectedKRate: num(v2.projectedKRate),
      v2ProjectedBF: num(v2.projectedBattersFaced),
      v2ProjectedInnings: num(v2.projectedInnings),
      v2PitcherSkillRate: num(v2.pitcherSkillRate),
      v2PitcherSkillRateShrunk: num(v2.pitcherSkillRateShrunk),
      v2OpponentEnvRate: num(v2.opponentEnvironmentRate),
      v2MatchupAdjustment: num(v2.matchupAdjustment),
      v2Confidence: v2.confidence ?? null,
      v2ModelVersion: v2.modelVersion ?? doc.modelVersion ?? null,
      inSeasonKRate: num(input?.pitcher?.seasonKRate),
      inSeasonKPer9: num(input?.pitcher?.seasonKPer9),
      inSeasonWhiffRate: num(input?.pitcher?.seasonWhiffRate),
      inRecentKRate: num(input?.pitcher?.recentKRate),
      inRecentKPer9: num(input?.pitcher?.recentKPer9),
      inBfPerInning: num(input?.pitcher?.averageBattersFacedPerInning),
      inPitchCountTrend: num(input?.pitcher?.pitchCountTrend),
      inOppSeasonKRate: num(input?.opponent?.seasonKRate),
      inOppRecentKRate: num(input?.opponent?.recentKRate),
      inOppVsLhpKRate: num(input?.opponent?.vsLhpKRate),
      inOppVsRhpKRate: num(input?.opponent?.vsRhpKRate),
      inOppLineupKRate: num(input?.opponent?.projectedLineupKRate),
      recentStartsN: starts.length,
      recentStarts: starts.map((start) => ({
        k: num(start.strikeouts),
        ip: num(start.inningsPitched),
        bf: num(start.battersFaced),
        pc: num(start.pitchCount),
      })),
    });
  }
}

// ---------- actual outcomes ----------
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

const actuals = new Map();

function harvestStarts(list, pitcherId) {
  if (!Array.isArray(list) || pitcherId == null) return;
  for (const start of list) {
    if (start?.gamePk == null) continue;
    const outs = start.outsRecorded != null ? strictNum(start.outsRecorded) : ipToOuts(start.inningsPitched);
    const strikeouts = strictNum(start.strikeouts);
    const battersFaced = strictNum(start.battersFaced);
    if (outs == null) continue;
    if (!isResolvedOutcome(strikeouts, battersFaced)) continue;
    actuals.set(`${start.gamePk}|${pitcherId}`, {
      gamePk: start.gamePk,
      pitcherId,
      date: start.date ?? null,
      actualKs: strikeouts,
      actualOuts: outs,
      actualIP: outs / 3,
      actualBF: battersFaced,
      actualPitches: strictNum(start.pitchCount),
      source: "start-log",
    });
  }
}

const DET = "public/data/mlb/strikeout-prop-details.json";
const detRevs = revisions(DET);
for (const { sha } of detRevs) {
  const doc = showJson(sha, DET);
  if (!doc || !Array.isArray(doc.details)) continue;
  for (const detail of doc.details) {
    harvestStarts(detail.pitcherRecentStarts, detail.pitcherId);
    harvestStarts(detail.pitcherLastFiveStarts, detail.pitcherId);
  }
}

const TOPK = "public/data/mlb/top-k-performance.json";
const topkRevs = revisions(TOPK);
for (const { sha } of topkRevs) {
  const doc = showJson(sha, TOPK);
  if (!doc || !Array.isArray(doc.records)) continue;
  for (const record of doc.records) {
    if (record.gameId == null || record.pitcherId == null) continue;
    const key = `${record.gameId}|${record.pitcherId}`;
    if (actuals.has(key)) continue;
    const strikeouts = strictNum(record.actualStrikeOuts);
    const battersFaced = strictNum(record.battersFaced);
    // This is the path that admitted 8 unplayed games into the v1/v2 archive:
    // top-k-performance.json carries scheduled starters with null outcomes, and
    // the old `num` turned those nulls into a 0-K, 0-BF "appearance".
    if (!isResolvedOutcome(strikeouts, battersFaced)) continue;
    const outs = ipToOuts(record.actualInningsPitched);
    actuals.set(key, {
      gamePk: record.gameId,
      pitcherId: record.pitcherId,
      date: record.date ?? null,
      actualKs: strikeouts,
      actualOuts: outs,
      actualIP: outs == null ? null : outs / 3,
      actualBF: battersFaced,
      actualPitches: null,
      source: "top-k-grading",
    });
  }
}

// ---------- join ----------
const rows = [];
for (const row of pregame.values()) {
  const actual = row.gamePk != null ? actuals.get(`${row.gamePk}|${row.pitcherId}`) : null;
  rows.push({
    ...row,
    actualKs: actual?.actualKs ?? null,
    actualOuts: actual?.actualOuts ?? null,
    actualIP: actual?.actualIP ?? null,
    actualBF: actual?.actualBF ?? null,
    actualPitches: actual?.actualPitches ?? null,
    actualsSource: actual?.source ?? null,
  });
}
rows.sort((a, b) => (a.slateDate < b.slateDate ? -1 : a.slateDate > b.slateDate ? 1 : 0));

const dates = [...new Set(rows.map((row) => row.slateDate))].sort();
const graded = rows.filter((row) => row.actualKs != null);
const meta = {
  studyId: "mlb-k-high-line-calibration-v1",
  extractedAt: new Date().toISOString(),
  v2RevisionsScanned: scannedV2,
  detailRevisionsScanned: detRevs.length,
  topKRevisionsScanned: topkRevs.length,
  pregameRows: rows.length,
  gradedRows: graded.length,
  gradedWithLine: graded.filter((row) => row.kLine != null).length,
  gradedWithLineAndV2: graded.filter((row) => row.kLine != null && row.v2ProjectedKs != null).length,
  dateRange: { first: dates[0] ?? null, last: dates[dates.length - 1] ?? null, distinctDates: dates.length },
  actualsUniverse: actuals.size,
};

writeFileSync(path.join(OUT, "pregame-archive.json"), `${JSON.stringify({ meta, rows }, null, 1)}\n`);
console.log(JSON.stringify(meta, null, 1));
