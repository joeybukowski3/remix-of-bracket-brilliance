import { describe, expect, it } from "vitest";
import { buildCfbV2TeamRatings, type CfbV2BuildRatingsInput } from "./buildTeamRatings";
import { CFB_EXTERNAL_TEAM_MAPPINGS } from "@/data/cfb/externalTeamMapping";
import type { CfbdGame, CfbdGameTeamStats, CfbdReturningProduction, CfbdTalent, CfbdTeam } from "./ratingInputs";

const TEAMS: CfbdTeam[] = CFB_EXTERNAL_TEAM_MAPPINGS.map((mapping, i) => ({
  id: 1000 + i,
  school: mapping.cfbdName,
  classification: "fbs",
}));
const TEAM_BY_JKB_ID = new Map(CFB_EXTERNAL_TEAM_MAPPINGS.map((m, i) => [m.jkbTeamId, TEAMS[i]]));

function teamGameStats(gameId: number, homeId: number, awayId: number, homeTeamName: string, awayTeamName: string, homePoints: number, awayPoints: number, homePlays = 65, awayPlays = 62): CfbdGameTeamStats {
  return {
    id: gameId,
    teams: [
      { teamId: homeId, team: homeTeamName, homeAway: "home", points: homePoints, stats: [{ category: "totalYards", stat: "420" }, { category: "totalOffensivePlays", stat: String(homePlays) }, { category: "yardsPerPlay", stat: "6.5" }, { category: "turnovers", stat: "1" }] },
      { teamId: awayId, team: awayTeamName, homeAway: "away", points: awayPoints, stats: [{ category: "totalYards", stat: "350" }, { category: "totalOffensivePlays", stat: String(awayPlays) }, { category: "yardsPerPlay", stat: "5.6" }, { category: "turnovers", stat: "2" }] },
    ],
  };
}

function cfbdGame(id: number, week: number, homeId: number, awayId: number, homeName: string, awayName: string, completed: boolean, homePoints: number | null = null, awayPoints: number | null = null): CfbdGame {
  return {
    id,
    season: 2026,
    week,
    seasonType: "regular",
    startDate: `2026-09-${String(week).padStart(2, "0")}T16:00:00.000Z`,
    startTimeTBD: false,
    completed,
    neutralSite: false,
    homeId,
    homeTeam: homeName,
    homeClassification: "fbs",
    homePoints,
    awayId,
    awayTeam: awayName,
    awayClassification: "fbs",
    awayPoints,
  };
}

function baseInput(overrides: Partial<CfbV2BuildRatingsInput> = {}): CfbV2BuildRatingsInput {
  return {
    season: 2026,
    dataAsOf: "2026-08-20T00:00:00.000Z",
    generatedAt: "2026-08-20T12:00:00.000Z",
    asOfWeek: 1,
    teams: TEAMS,
    currentSeasonGames: [],
    currentSeasonTeamGameStats: [],
    priorSeasonGames: [],
    priorSeasonTeamGameStats: [],
    returningProduction: [],
    talent: [],
    ...overrides,
  };
}

describe("buildCfbV2TeamRatings — preseason / zero-game state (§26)", () => {
  it("produces one rating per FBS team, driven by prior alone, with maximally conservative connectivity", () => {
    const ratings = buildCfbV2TeamRatings(baseInput());
    expect(ratings.length).toBe(TEAMS.length);
    for (const rating of ratings) {
      expect(rating.gamesPlayed).toBe(0);
      expect(rating.connectivity.componentSize).toBe(1);
      expect(rating.connectivity.regularizationMultiplier).toBeCloseTo(3, 8); // COMPONENT_SIZE_K=20 / componentSize=1 capped at maxPenaltyMultiplier=3
      expect(rating.priorTier).toBe("LEAGUE_MEAN"); // no prior-season data supplied in this fixture
      expect(rating.offenseRating).toBe(rating.preseasonPriorOffense);
      expect(rating.defenseRating).toBe(rating.preseasonPriorDefense);
      expect(rating.ratingStatus).toBe("computed");
      expect(Number.isFinite(rating.overallRating)).toBe(true);
    }
  });
});

describe("buildCfbV2TeamRatings — transition team (§14)", () => {
  it("a team with no prior-season FBS history resolves via the fallback hierarchy, not a hardcoded rule", () => {
    const talentTeamId = CFB_EXTERNAL_TEAM_MAPPINGS[5].jkbTeamId;
    const talentTeamName = TEAM_BY_JKB_ID.get(talentTeamId)!.school;
    const ratings = buildCfbV2TeamRatings(
      baseInput({ talent: [{ year: 2026, team: talentTeamName, talent: 650 } satisfies CfbdTalent] }),
    );
    const transitionRating = ratings.find((r) => r.teamId === talentTeamId)!;
    // talent present, no prevSeason -> resolveTier requires prevOffense for PRIOR_A too, so still LEAGUE_MEAN (never opportunistically upgrades).
    expect(transitionRating.priorTier).toBe("LEAGUE_MEAN");
    expect(transitionRating.preseasonPriorOffense).toBe(0);
  });
});

describe("buildCfbV2TeamRatings — as-of leakage (§15)", () => {
  it("a week-2 game is not folded into a week-2 cutoff rating (strictly-before semantics)", () => {
    const [a, b] = CFB_EXTERNAL_TEAM_MAPPINGS.slice(0, 2);
    const teamA = TEAM_BY_JKB_ID.get(a.jkbTeamId)!;
    const teamB = TEAM_BY_JKB_ID.get(b.jkbTeamId)!;
    const games = [cfbdGame(9001, 2, teamA.id, teamB.id, teamA.school, teamB.school, true, 30, 20)];
    const stats = [teamGameStats(9001, teamA.id, teamB.id, teamA.school, teamB.school, 30, 20)];

    const ratings = buildCfbV2TeamRatings(baseInput({ asOfWeek: 2, currentSeasonGames: games, currentSeasonTeamGameStats: stats }));
    const ratingA = ratings.find((r) => r.teamId === a.jkbTeamId)!;
    expect(ratingA.gamesPlayed).toBe(0); // week 2 game excluded at asOfWeek=2 cutoff (strictly before)

    const ratingsAfter = buildCfbV2TeamRatings(baseInput({ asOfWeek: 3, currentSeasonGames: games, currentSeasonTeamGameStats: stats }));
    const ratingAAfter = ratingsAfter.find((r) => r.teamId === a.jkbTeamId)!;
    expect(ratingAAfter.gamesPlayed).toBe(1); // folded in once the cutoff passes week 2
  });
});

describe("buildCfbV2TeamRatings — determinism (§21)", () => {
  it("identical inputs produce byte-identical output (JSON round-trip)", () => {
    const [a, b] = CFB_EXTERNAL_TEAM_MAPPINGS.slice(0, 2);
    const teamA = TEAM_BY_JKB_ID.get(a.jkbTeamId)!;
    const teamB = TEAM_BY_JKB_ID.get(b.jkbTeamId)!;
    const games = [cfbdGame(9002, 1, teamA.id, teamB.id, teamA.school, teamB.school, true, 24, 17)];
    const stats = [teamGameStats(9002, teamA.id, teamB.id, teamA.school, teamB.school, 24, 17)];
    const input = baseInput({ asOfWeek: 2, currentSeasonGames: games, currentSeasonTeamGameStats: stats });

    const first = buildCfbV2TeamRatings(input);
    const second = buildCfbV2TeamRatings(input);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe("buildCfbV2TeamRatings — FBS population (§13)", () => {
  it("an FBS-vs-FCS game does not contaminate the current-evidence Ridge network", () => {
    const teamA = TEAM_BY_JKB_ID.get(CFB_EXTERNAL_TEAM_MAPPINGS[0].jkbTeamId)!;
    const fcsGame: CfbdGame = { ...cfbdGame(9003, 1, teamA.id, 99999, teamA.school, "Some FCS School", true, 40, 10), awayClassification: "fcs" };
    const fcsStats = teamGameStats(9003, teamA.id, 99999, teamA.school, "Some FCS School", 40, 10);
    // normalizeCfbdGamePerformance resolves the away team via getJkbTeamIdForCfbdName; an unmapped FCS name resolves to null opponentTeamId, so this row is naturally excluded — confirms no fabricated FBS-vs-FCS edge.
    const ratings = buildCfbV2TeamRatings(baseInput({ asOfWeek: 2, currentSeasonGames: [fcsGame], currentSeasonTeamGameStats: [fcsStats] }));
    const ratingA = ratings.find((r) => r.teamId === CFB_EXTERNAL_TEAM_MAPPINGS[0].jkbTeamId)!;
    expect(ratingA.gamesPlayed).toBe(0);
  });
});
