import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateFreshness,
  assessSlateAlignment,
  evaluateArtifact,
  inspectMlbDataFreshness,
  resolveExpectedSlateDate,
  runFreshnessCli,
} from "./mlb-data-freshness.mjs";

const TODAY = "2026-08-28";
const YESTERDAY = "2026-08-27";

function fakeReader(map) {
  return (absPath) => {
    for (const [needle, value] of Object.entries(map)) {
      if (absPath.replace(/\\/g, "/").endsWith(needle)) return value;
    }
    return null;
  };
}

function hrRaw(date, { withLines = true } = {}) {
  return JSON.stringify({
    date,
    batters: withLines ? [{ player: "A", hrOddsYes: "+250" }] : [{ player: "A" }],
    pitchers: withLines ? [{ pitcher: "B", kLine: 6.5 }] : [{ pitcher: "B" }],
  });
}

function kDetails(date) {
  return JSON.stringify({ date, details: [{ pitcherId: 1 }] });
}

// 1. today + populated HR/K => current
test("today's artifacts read as current", () => {
  const verdict = inspectMlbDataFreshness({
    expectedDate: TODAY,
    readFileImpl: fakeReader({
      "public/data/mlb/hr-props-raw.json": hrRaw(TODAY),
      "public/data/mlb/strikeout-prop-details.json": kDetails(TODAY),
    }),
  });
  assert.equal(verdict.status, "current");
  assert.equal(verdict.blocking, false);
  assert.equal(verdict.degraded, false);
});

// 2. yesterday + populated HR/K => stale (populated lines must not mask staleness)
test("yesterday's populated artifacts read as stale and blocking", () => {
  const verdict = inspectMlbDataFreshness({
    expectedDate: TODAY,
    readFileImpl: fakeReader({
      "public/data/mlb/hr-props-raw.json": hrRaw(YESTERDAY),
      "public/data/mlb/strikeout-prop-details.json": kDetails(YESTERDAY),
    }),
  });
  assert.equal(verdict.status, "stale");
  assert.equal(verdict.blocking, true);
  assert.equal(verdict.degraded, true);
});

// 3. missing hr-props => missing
test("absent hr-props artifact reads as missing / blocking", () => {
  const verdict = inspectMlbDataFreshness({
    expectedDate: TODAY,
    readFileImpl: fakeReader({
      "public/data/mlb/strikeout-prop-details.json": kDetails(TODAY),
    }),
  });
  assert.equal(verdict.artifacts.hrProps.status, "missing");
  assert.equal(verdict.status, "partial");
  assert.equal(verdict.blocking, true);
});

// 4. current HR + stale strikeout details => partial, NOT blocking (soft artifact)
test("current hard artifact + stale soft artifact reads as partial, non-blocking", () => {
  const verdict = inspectMlbDataFreshness({
    expectedDate: TODAY,
    readFileImpl: fakeReader({
      "public/data/mlb/hr-props-raw.json": hrRaw(TODAY),
      "public/data/mlb/strikeout-prop-details.json": kDetails(YESTERDAY),
    }),
  });
  assert.equal(verdict.status, "partial");
  assert.equal(verdict.blocking, false);
  assert.equal(verdict.degraded, true);
});

// 5. malformed JSON => missing/error state, never false-current
test("malformed JSON never reads as current", () => {
  const evaluation = evaluateArtifact({
    label: "hr-props-raw.json",
    required: "hard",
    present: true,
    text: "{ not json",
    expectedDate: TODAY,
  });
  assert.equal(evaluation.status, "missing");
  assert.equal(evaluation.parseError, true);
});

test("present-but-dateless JSON never reads as current", () => {
  const evaluation = evaluateArtifact({
    label: "hr-props-raw.json",
    required: "hard",
    present: true,
    text: JSON.stringify({ batters: [] }),
    expectedDate: TODAY,
  });
  assert.equal(evaluation.status, "missing");
});

// 6. stale mlb-odds.json cannot be injected into today
test("assessSlateAlignment refuses stale odds against a current model", () => {
  const alignment = assessSlateAlignment({
    expectedDate: TODAY,
    rawData: { date: TODAY },
    oddsData: { fetchedAt: `${YESTERDAY}T18:00:00Z` },
  });
  assert.equal(alignment.modelCurrent, true);
  assert.equal(alignment.oddsCurrent, false);
  assert.equal(alignment.injectable, false);
});

test("assessSlateAlignment refuses when BOTH model and odds are stale by the same wrong date", () => {
  const alignment = assessSlateAlignment({
    expectedDate: TODAY,
    rawData: { date: YESTERDAY },
    oddsData: { date: YESTERDAY },
  });
  assert.equal(alignment.injectable, false);
  assert.match(alignment.reason, /model slate 2026-08-27 != expected 2026-08-28/);
});

// 7. current mlb-odds.json remains valid
test("assessSlateAlignment allows injection when model and odds both belong to today", () => {
  const alignment = assessSlateAlignment({
    expectedDate: TODAY,
    rawData: { date: TODAY },
    oddsData: { date: TODAY },
  });
  assert.equal(alignment.injectable, true);
});

test("assessSlateAlignment resolves the odds slate from fetchedAt when there is no explicit date", () => {
  const alignment = assessSlateAlignment({
    expectedDate: TODAY,
    rawData: { date: TODAY },
    // 2026-08-28T05:00:00Z is still 2026-08-28 in ET (01:00 EDT)
    oddsData: { fetchedAt: `${TODAY}T05:00:00Z` },
  });
  assert.equal(alignment.oddsCurrent, true);
  assert.equal(alignment.injectable, true);
});

// 8/9. watchdog-style dry-run dispatch decision
test("aggregateFreshness verdict drives a no-dispatch decision when current", () => {
  const verdict = aggregateFreshness(TODAY, [
    { label: "hr-props-raw.json", required: "hard", status: "current", artifactDate: TODAY, reason: "" },
    { label: "strikeout-prop-details.json", required: "soft", status: "current", artifactDate: TODAY, reason: "" },
  ]);
  const shouldDispatch = verdict.status !== "current";
  assert.equal(shouldDispatch, false);
});

test("aggregateFreshness verdict drives a dispatch decision when stale/missing/partial", () => {
  for (const evaluations of [
    [{ label: "hr-props-raw.json", required: "hard", status: "stale", artifactDate: YESTERDAY, reason: "r" }],
    [{ label: "hr-props-raw.json", required: "hard", status: "missing", artifactDate: null, reason: "r" }],
    [
      { label: "hr-props-raw.json", required: "hard", status: "current", artifactDate: TODAY, reason: "" },
      { label: "strikeout-prop-details.json", required: "soft", status: "missing", artifactDate: null, reason: "r" },
    ],
  ]) {
    const verdict = aggregateFreshness(TODAY, evaluations);
    assert.equal(verdict.status !== "current", true);
  }
});

// 10. expected ET slate date around the UTC/ET boundary
test("resolveExpectedSlateDate returns the ET calendar date across the UTC midnight boundary", () => {
  // 2026-08-28T03:30:00Z == 2026-08-27 23:30 EDT -> still the 27th in ET
  assert.equal(resolveExpectedSlateDate({ now: new Date("2026-08-28T03:30:00Z") }), "2026-08-27");
  // 2026-08-28T05:30:00Z == 2026-08-28 01:30 EDT -> the 28th in ET
  assert.equal(resolveExpectedSlateDate({ now: new Date("2026-08-28T05:30:00Z") }), "2026-08-28");
});

test("resolveExpectedSlateDate honours an explicit date over the clock", () => {
  assert.equal(
    resolveExpectedSlateDate({ now: new Date("2026-08-28T18:00:00Z"), explicitDate: "2026-09-01" }),
    "2026-09-01",
  );
});

// --assert-hard exit code contract used by the canonical workflow's post-publish gate
test("runFreshnessCli --assert-hard exits non-zero only when a hard artifact is not current", () => {
  const logs = [];
  const currentRoot = runFreshnessCli({
    argv: ["--assert-hard", "--date", TODAY],
    now: new Date(`${TODAY}T16:00:00Z`),
    rootDir: "/fake",
    log: (m) => logs.push(m),
    logError: (m) => logs.push(m),
    githubOutputPath: undefined,
    githubSummaryPath: undefined,
  });
  // /fake has no artifacts -> hard artifact missing -> exit 1
  assert.equal(currentRoot, 1);
});
