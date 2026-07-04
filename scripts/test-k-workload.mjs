import process from "node:process";
import { pathToFileURL } from "node:url";
import { generateShadow } from "./generate-mlb-k-workload-shadow.mjs";
import { getTodayEt, toFiniteNumber } from "./mlb-k/fetch-workload-data.mjs";

function fixtureResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
  };
}

function buildGameLog(pitcherId, season) {
  const reliever = pitcherId % 2 === 0;
  const base = reliever
    ? [17, 20, 15, 22, 18, 19]
    : [84, 87, 89, 82, 90, 85];
  return {
    stats: [{
      splits: base.map((pitches, index) => ({
        date: `${season}-06-${String(10 + index * 4).padStart(2, "0")}`,
        opponent: { name: index % 2 ? "Fixture B" : "Fixture A" },
        stat: {
          gamesStarted: reliever ? 0 : 1,
          numberOfPitches: pitches,
          battersFaced: reliever ? 4 + (index % 3) : 20 + (index % 3),
          strikeOuts: reliever ? 1 + (index % 2) : 4 + (index % 3),
          baseOnBalls: reliever ? index % 2 : 2,
          inningsPitched: reliever ? (index % 2 ? "1.0" : "0.2") : (index % 2 ? "6.0" : "5.2"),
          earnedRuns: reliever ? index % 2 : 2,
          hits: reliever ? 1 : 5,
          homeRuns: reliever ? 0 : 1,
        },
      })),
    }],
  };
}

function createFixtureFetch(targetDate) {
  const season = Number(targetDate.slice(0, 4));
  return async function fixtureFetch(url) {
    const text = String(url);
    if (text.includes("/schedule?")) {
      return fixtureResponse({
        dates: [{
          games: [{
            gamePk: 999001,
            gameDate: `${targetDate}T23:10:00Z`,
            venue: { name: "Fixture Park" },
            status: { detailedState: "Scheduled" },
            teams: {
              away: {
                team: { id: 101, abbreviation: "AAA" },
                probablePitcher: { id: 700001, fullName: "Starter Fixture" },
              },
              home: {
                team: { id: 102, abbreviation: "BBB" },
                probablePitcher: { id: 700002, fullName: "Reliever Fixture" },
              },
            },
          }],
        }],
      });
    }

    if (text.includes("/teams/101/stats")) {
      const recent = text.includes("byDateRange");
      return fixtureResponse({ stats: [{ splits: [{ stat: {
        plateAppearances: recent ? 420 : 3200,
        strikeOuts: recent ? 108 : 760,
        baseOnBalls: recent ? 38 : 285,
        numberOfPitches: recent ? 1680 : 12600,
      } }] }] });
    }

    if (text.includes("/teams/102/stats")) {
      const recent = text.includes("byDateRange");
      return fixtureResponse({ stats: [{ splits: [{ stat: {
        plateAppearances: recent ? 410 : 3150,
        strikeOuts: recent ? 82 : 620,
        baseOnBalls: recent ? 30 : 250,
        numberOfPitches: recent ? 1530 : 11800,
      } }] }] });
    }

    const pitcherMatch = text.match(/\/people\/(\d+)\/stats/);
    if (pitcherMatch) {
      return fixtureResponse(buildGameLog(Number(pitcherMatch[1]), season));
    }

    return fixtureResponse({ message: `Unknown fixture URL: ${text}` }, 404);
  };
}

function validateRow(row) {
  const issues = [];
  const expectedBF = toFiniteNumber(row.projection?.expectedBF);
  const expectedInnings = toFiniteNumber(row.projection?.expectedInnings);
  const adjustedRate = toFiniteNumber(row.projection?.teamAdjustedKRate);
  const fullKs = toFiniteNumber(row.projection?.fullShadowProjectedKs);
  const workloadKs = toFiniteNumber(row.projection?.workloadOnlyProjectedKs);

  if (expectedBF == null) issues.push("expectedBF missing");
  if (adjustedRate == null) issues.push("teamAdjustedKRate missing");
  if (fullKs == null) issues.push("fullShadowProjectedKs missing");
  if (workloadKs == null) issues.push("workloadOnlyProjectedKs missing");
  if (expectedBF != null && adjustedRate != null && fullKs != null && Math.abs(expectedBF * adjustedRate - fullKs) > 0.02) {
    issues.push(`full projection arithmetic mismatch: ${expectedBF} * ${adjustedRate} != ${fullKs}`);
  }
  if (!row.teamKAdjustment?.components || !row.teamKAdjustment?.diagnostics) {
    issues.push("team K diagnostics missing");
  }
  if (row.role === "reliever") {
    if (expectedBF != null && expectedBF > 10) issues.push(`reliever expectedBF exceeded cap: ${expectedBF}`);
    if (expectedInnings != null && expectedInnings > 3) issues.push(`reliever expected innings exceeded cap: ${expectedInnings}`);
    if (fullKs != null && fullKs > 5) issues.push(`reliever projected Ks exceeded cap: ${fullKs}`);
    if (!row.flags?.includes("RELIEVER_WORKLOAD_CAP")) issues.push("reliever cap flag missing");
  }
  return issues;
}

export async function runValidation(argv = process.argv.slice(2)) {
  const value = (prefix) => argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
  const targetDate = value("--date=") ?? getTodayEt();
  const fixtureMode = argv.includes("--fixture") || process.env.MLB_K_TEST_FIXTURE === "1";
  const output = await generateShadow({
    targetDate,
    concurrency: 2,
    fetchImpl: fixtureMode ? createFixtureFetch(targetDate) : globalThis.fetch,
  });

  const rows = Array.isArray(output.pitchers) ? output.pitchers : [];
  const errors = rows.flatMap((row) => validateRow(row).map((issue) => ({ pitcher: row.pitcher, issue })));

  console.table(rows.map((row) => ({
    pitcher: row.pitcher,
    role: row.role,
    matchup: `${row.team} ${row.isHome ? "vs" : "@"} ${row.opponent}`,
    expectedBF: row.projection?.expectedBF,
    expectedIP: row.projection?.expectedInnings,
    workloadKs: row.projection?.workloadOnlyProjectedKs,
    teamAdjustedKRate: row.projection?.teamAdjustedKRate,
    fullKs: row.projection?.fullShadowProjectedKs,
    delta: row.projection?.teamAdjustmentKsDelta,
    confidence: row.confidence?.grade,
  })));

  if (!rows.length) errors.push({ pitcher: "slate", issue: "no pitcher rows generated" });
  if (fixtureMode && rows.length !== 2) errors.push({ pitcher: "fixture", issue: `expected 2 pitchers, received ${rows.length}` });
  if (fixtureMode && rows.filter((row) => row.role === "reliever").length !== 1) {
    errors.push({ pitcher: "fixture", issue: "expected exactly one reliever fixture" });
  }

  if (errors.length) {
    console.error(`[test-k-workload] ${errors.length} validation error(s)`);
    console.table(errors);
    process.exitCode = 1;
    return { ok: false, errors, output };
  }

  console.log(`[test-k-workload] shadow validation passed for ${rows.length} pitcher(s); mode=${process.env.MLB_K_PROJECTION_MODE ?? "unset"}; fixture=${fixtureMode}`);
  return { ok: true, errors: [], output };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runValidation().catch((error) => {
    console.error(`[test-k-workload] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
