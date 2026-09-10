/**
 * Regression guard for the production incident where a real DraftKings Week 1
 * slate produced "0 optimizer-eligible offense / 0 DST with usable matchup
 * context" while the board still rendered every player.
 *
 * Root cause was never the parser, week resolution, team normalization, the
 * schedule join, or the practical-pool gate -- all of those are exercised
 * here and pass. The candidate pool collapsed because the committed
 * `nfl-dfs-lineup-context` artifact had aged past the 48h freshness windows
 * in `optimizerEligibilityV1` / `dstMatchupV1` by the time the slate was
 * analysed, so every role/DST evidence row was discarded.
 *
 * Fixtures (src/lib/nfl/dfs/__fixtures__/real/):
 *  - dksalaries-2026-week1-sample.csv  -- 53 rows carved verbatim from the
 *    real 744-row export: all 24 slate DSTs (every one of the 12 games, incl.
 *    the alias-sensitive WAS/ARI joins), 25 eligible skill players spanning
 *    the salary range, and 4 deliberately pool-excluded fringe players
 *    (rank past cap / missing rank / IR).
 *  - lineup-context-2026-week1.json    -- a frozen artifact generated at a
 *    known instant; its newest embedded source timestamp is
 *    2026-09-09T16:35Z.
 *
 * Every clock below is a fixed string relative to that frozen artifact -- no
 * `new Date()` anywhere in the data path (assessDfsSlateCompatibility takes
 * an explicit `now`, generateLineups takes `now: () => 0`) -- so these tests
 * stay deterministic in 2027+.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { weeklyFantasyProjectionProductionArtifactSchema } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { weeklyFantasyResearchArtifactSchema } from "@/lib/fantasy/weekly/researchArtifact";
import { assessDfsSlateCompatibility } from "@/lib/nfl/dfs/artifactCompatibility";
import { parseDraftKingsNflClassicCsv } from "@/lib/nfl/dfs/draftKingsCsv";
import { isDfsCandidatePoolPlayer } from "@/lib/nfl/dfs/dfsPlayerPool";
import { isDraftKingsOffensiveRow, resolveOffensiveIdentity } from "@/lib/nfl/dfs/identity";
import { attachDfsLineupContext, lineupContextSchema } from "@/lib/nfl/dfs/lineupContext";
import { NFL_CLASSIC_RULES } from "@/lib/nfl/dfs/nflClassicRules";
import { assessDfsResearch } from "@/lib/nfl/dfs/research";
import { buildDfsSlateAnalysis, enrichDfsSlateAnalysis, type DfsEnrichedSlateAnalysis } from "@/lib/nfl/dfs/slateAnalyzer";
import { resolveNflWeekSelection } from "@/lib/nfl/weekSelection";
import { generateLineups } from "./generateLineups";

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const FIXTURES = "src/lib/nfl/dfs/__fixtures__/real";
const CSV = readFileSync(`${FIXTURES}/dksalaries-2026-week1-sample.csv`, "utf8");

const projectionArtifact = weeklyFantasyProjectionProductionArtifactSchema.parse(read("public/data/fantasy/projections/2026/week-01.json"));
const researchArtifact = weeklyFantasyResearchArtifactSchema.parse(read("public/data/fantasy/weekly-research/2026/week-01.json"));
const projections = Object.values(projectionArtifact.rows).flat();
const teams = read("public/data/nfl/teams.json").teams;
const games = read("public/data/nfl/2026/games.json").games;
const dkRows = parseDraftKingsNflClassicCsv(CSV).rows;

// Just after the frozen lineup-context artifact's newest embedded source
// timestamp -- inside every 48h window.
const FRESH_ASOF = "2026-09-10T09:00:00Z";
// Well past every 48h window (Sunday gameday, artifact never refreshed).
const STALE_ASOF = "2026-09-13T17:00:00Z";

function compatFor(asOf: string) {
  return assessDfsSlateCompatibility({
    dkRows,
    projectionArtifact,
    researchArtifact,
    selectedSeason: 2026,
    selectedWeek: 1,
    canonicalGames: games,
    now: asOf,
    offensiveIdentityResolutions: dkRows.filter(isDraftKingsOffensiveRow).map((row) => resolveOffensiveIdentity(row, projections)),
  });
}

function enrich(asOf: string): DfsEnrichedSlateAnalysis {
  return attachDfsLineupContext(
    enrichDfsSlateAnalysis(
      buildDfsSlateAnalysis({ dkRows, projectionRows: projections, teams }),
      assessDfsResearch(projections, researchArtifact, 2026, 1),
      compatFor(asOf),
    ),
    lineupContextSchema.parse(read(`${FIXTURES}/lineup-context-2026-week1.json`)),
    { season: 2026, week: 1, asOf },
  );
}

describe("real Week 1 DK slate — Game Info / schedule join", () => {
  it("parses the real DraftKings export format with no diagnostics", () => {
    const parsed = parseDraftKingsNflClassicCsv(CSV);
    expect(parsed.accepted).toBe(true);
    expect(parsed.rows).toHaveLength(53);
    expect(parsed.diagnostics ?? []).toHaveLength(0);
  });

  it("resolves the uploaded slate to season 2026 week 1", () => {
    const selection = resolveNflWeekSelection(games, { now: new Date("2026-09-09T18:00:00Z") });
    expect(selection.week).toBe(1);
  });

  it("matches every uploaded game to exactly one canonical schedule entry", () => {
    const compatibility = compatFor(FRESH_ASOF);
    expect(compatibility.games.unmatched).toHaveLength(0);
    expect(compatibility.games.matched).toHaveLength(12);
    expect(compatibility.games.matched.map((m) => m.canonicalGame?.gameId).sort()).toEqual([
      "2026_01_ARI_LAC", "2026_01_ATL_PIT", "2026_01_BAL_IND", "2026_01_BUF_HOU",
      "2026_01_CHI_CAR", "2026_01_CLE_JAX", "2026_01_GB_MIN", "2026_01_MIA_LV",
      "2026_01_NO_DET", "2026_01_NYJ_TEN", "2026_01_TB_CIN", "2026_01_WAS_PHI",
    ]);
  });

  it("honours DraftKings team aliases through the schedule + evidence joins (WAS->wsh, ARI->ari)", () => {
    const analysis = enrich(FRESH_ASOF);
    const dstFor = (team: string) => {
      const row = analysis.rows.find((r) => r.kind === "dst" && r.team === team);
      return row?.kind === "dst" ? row : undefined;
    };
    const commanders = dstFor("WAS");
    const cardinals = dstFor("ARI");
    expect(commanders?.canonicalGameId).toBe("2026_01_WAS_PHI");
    expect(cardinals?.canonicalGameId).toBe("2026_01_ARI_LAC");
    // The alias-sensitive DST join actually resolves matchup context, not just an id.
    expect(commanders?.dstMatchup?.dstMatchupScore).not.toBeNull();
    expect(cardinals?.dstMatchup?.dstMatchupScore).not.toBeNull();
    // ...and the alias-sensitive role-evidence join keeps WAS / ARI skill players eligible.
    expect(analysis.rows.find((row) => row.playerName.includes("McLaurin"))?.optimizerEligibility).toBe("eligible");
    expect(analysis.rows.find((row) => row.playerName.includes("Marvin Harrison"))?.optimizerEligibility).toBe("eligible");
  });

  it("assigns a canonicalGameId to every enriched row", () => {
    const analysis = enrich(FRESH_ASOF);
    expect(analysis.rows.filter((row) => row.canonicalGameId == null)).toHaveLength(0);
  });
});

describe("real Week 1 DK slate — practical pool gate still applies at canonical rank", () => {
  const analysis = enrich(FRESH_ASOF);
  const bySubstr = (needle: string) => analysis.rows.find((row) => row.playerName.includes(needle))!;

  it("keeps a QB exactly at the rank cap and drops the next one", () => {
    expect(bySubstr("C.J. Stroud").jkbWeeklyPositionRank).toBe(24); // DFS_POSITION_RANK_CAPS.QB
    expect(isDfsCandidatePoolPlayer(bySubstr("C.J. Stroud"))).toBe(true);
    expect(bySubstr("Bryce Young").jkbWeeklyPositionRank).toBe(25);
    expect(isDfsCandidatePoolPlayer(bySubstr("Bryce Young"))).toBe(false);
  });

  it("drops a genuinely missing-rank player (never re-classified as eligible)", () => {
    const diggs = bySubstr("Stefon Diggs");
    expect(diggs.jkbWeeklyPositionRank).toBeNull();
    expect(isDfsCandidatePoolPlayer(diggs)).toBe(false);
  });

  it("drops a rank-past-cap RB and an IR player", () => {
    expect(bySubstr("Tyler Allgeier").jkbWeeklyPositionRank).toBeGreaterThan(50); // DFS_POSITION_RANK_CAPS.RB
    expect(isDfsCandidatePoolPlayer(bySubstr("Tyler Allgeier"))).toBe(false);
    expect(isDfsCandidatePoolPlayer(bySubstr("Jordyn Tyson"))).toBe(false); // dkStatus IR
  });
});

describe("real Week 1 DK slate — candidate pool with a fresh lineup-context artifact", () => {
  const analysis = enrich(FRESH_ASOF);
  const offense = analysis.rows.filter((row) => row.kind === "offense");
  const dst = analysis.rows.filter((row) => row.kind === "dst");

  it("produces optimizer-eligible offense at every required position, within the pool caps", () => {
    const candidates = offense.filter(
      (row) => row.optimizerEligibility === "eligible" && row.projectedFantasyPoints != null && isDfsCandidatePoolPlayer(row),
    );
    const byPos = (pos: string) => candidates.filter((row) => row.position === pos).length;
    expect(byPos("QB")).toBeGreaterThanOrEqual(1);
    expect(byPos("RB")).toBeGreaterThanOrEqual(2);
    expect(byPos("WR")).toBeGreaterThanOrEqual(3);
    expect(byPos("TE")).toBeGreaterThanOrEqual(1);
  });

  it("gives every uploaded DST a usable WU6C matchup context", () => {
    expect(dst).toHaveLength(24);
    const usable = dst.filter((row) => row.dstMatchup?.dstMatchupScore != null);
    expect(usable).toHaveLength(24);
  });

  it("builds all three preset lineups within the canonical rules", () => {
    const set = generateLineups({ rows: analysis.rows, projectionRows: projections, asOf: FRESH_ASOF, now: () => 0 });
    expect(set.status).toBe("ready");
    expect(set.infeasible).toHaveLength(0);
    expect(set.lineups).toHaveLength(3);
    expect(set.lineups.map((lineup) => lineup.strategy).sort()).toEqual(["balanced", "ceiling", "floor"]);
    expect(set.candidatePool.offenseEligible).toBeGreaterThan(0);
    expect(set.candidatePool.dstWithUsableContext).toBe(24);
    for (const lineup of set.lineups) {
      expect(lineup.slots).toHaveLength(9);
      expect(lineup.salaryUsed).toBeLessThanOrEqual(NFL_CLASSIC_RULES.salaryCap);
      expect(lineup.constraintStatus.minimumGamesSatisfied).toBe(true);
      expect(lineup.constraintStatus.allOffenseOptimizerEligible).toBe(true);
      expect(lineup.constraintStatus.allOffenseInDfsPool).toBe(true);
      expect(lineup.constraintStatus.dstContextUsable).toBe(true);
      expect(lineup.constraintStatus.allFromUploadedSlate).toBe(true);
    }
  });
});

describe("real Week 1 DK slate — stale lineup-context artifact is surfaced, not masked", () => {
  it("collapses to an explained 'unavailable' set rather than a silent partial lineup", () => {
    const analysis = enrich(STALE_ASOF);
    const set = generateLineups({ rows: analysis.rows, projectionRows: projections, asOf: STALE_ASOF, now: () => 0 });
    expect(set.status).toBe("unavailable");
    expect(set.candidatePool.offenseEligible).toBe(0);
    expect(set.candidatePool.dstWithUsableContext).toBe(0);
    expect(set.warnings.join(" ")).toContain("no usable WU6C matchup context");
    // Board data itself is untouched by staleness -- ranks/projections still present.
    const chase = analysis.rows.find((row) => row.playerName.includes("Ja'Marr Chase"));
    expect(chase?.jkbWeeklyPositionRank).toBe(1);
    expect(chase?.projectedFantasyPoints).toBeGreaterThan(0);
  });
});
