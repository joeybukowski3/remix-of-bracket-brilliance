// Test-only factories for WU1/WU2 DK row and canonical team fixtures.
// Not used by production code.

import type { CanonicalNflTeam, NflGameRecord } from "@/lib/nfl/standings";
import type { DraftKingsParsedGameInfo, ValidatedDraftKingsNflClassicRow } from "@/lib/nfl/dfs/contracts";

export function buildDkRow(overrides: Partial<ValidatedDraftKingsNflClassicRow> & Pick<ValidatedDraftKingsNflClassicRow, "dkId">): ValidatedDraftKingsNflClassicRow {
  const game: DraftKingsParsedGameInfo = { awayTeam: "NO", homeTeam: "DET", date: "09/13/2026", time: "01:00PM", timezone: "ET" };
  return {
    position: "QB",
    namePlusId: `Test Player (${overrides.dkId})`,
    name: "Test Player",
    rosterPosition: "QB",
    salary: 6000,
    gameInfoRaw: "NO@DET 09/13/2026 01:00PM ET",
    game,
    teamAbbrev: "NO",
    avgPointsPerGame: 15,
    status: null,
    ...overrides,
  };
}

export function buildTeam(overrides: Partial<CanonicalNflTeam> & Pick<CanonicalNflTeam, "id" | "abbr">): CanonicalNflTeam {
  return {
    slug: overrides.id.replace(/^nfl-/, ""),
    nflverseAbbr: overrides.abbr.toUpperCase(),
    name: overrides.id,
    fullName: overrides.id,
    shortName: overrides.id,
    conference: "AFC",
    division: "AFC East",
    primaryColor: "#000000",
    logoUrl: "https://example.com/logo.png",
    isDome: false,
    latitude: 0,
    longitude: 0,
    ...overrides,
  };
}

export function buildGame(overrides: Partial<NflGameRecord> & Pick<NflGameRecord, "gameId" | "season" | "week" | "homeAbbr" | "awayAbbr">): NflGameRecord {
  return {
    seasonType: "REG",
    dateUtc: "2026-09-13T17:00:00.000Z",
    homeTeam: overrides.homeAbbr,
    awayTeam: overrides.awayAbbr,
    status: "scheduled",
    stadium: null,
    neutralSite: false,
    ...overrides,
  };
}
