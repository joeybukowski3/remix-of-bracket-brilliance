import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { FANTASY_SCORING_VERSION } from "@/lib/fantasy/weekly/scoring";

let sequence = 0;

/** Minimal, valid HistoricalPlayerWeek fixture; override only what a test cares about. */
export function makeHistoricalPlayerWeek(overrides: Partial<HistoricalPlayerWeek> = {}): HistoricalPlayerWeek {
  sequence += 1;
  const season = overrides.season ?? 2025;
  const week = overrides.week ?? 1;
  return {
    season,
    week,
    playerId: overrides.playerId ?? `player-${sequence}`,
    playerName: overrides.playerName ?? `Test Player ${sequence}`,
    position: overrides.position ?? "RB",
    team: overrides.team ?? "buf",
    opponent: overrides.opponent ?? "mia",
    externalIds: overrides.externalIds ?? { gsis: `gsis-${sequence}`, pfr: null, espn: null },
    actualFantasyPoints: overrides.actualFantasyPoints ?? 0,
    stats: overrides.stats ?? {
      passAttempts: 0,
      completions: 0,
      passingYards: 0,
      passingTouchdowns: 0,
      interceptions: 0,
      rushAttempts: 0,
      rushingYards: 0,
      rushingTouchdowns: 0,
      receptions: 0,
      targets: 0,
      receivingYards: 0,
      receivingTouchdowns: 0,
      sackFumblesLost: 0,
      rushingFumblesLost: 0,
      receivingFumblesLost: 0,
      fumblesLost: 0,
      passingTwoPointConversions: 0,
      rushingTwoPointConversions: 0,
      receivingTwoPointConversions: 0,
      specialTeamsTouchdowns: 0,
    },
    usage: overrides.usage ?? {
      offensiveSnaps: null,
      snapShare: null,
      passAttempts: null,
      completions: null,
      rushAttempts: null,
      targets: null,
      receptions: null,
      receivingAirYards: null,
      targetShare: null,
      airYardsShare: null,
      routes: null,
      routeParticipation: null,
      redZoneTouches: null,
      goalLineTouches: null,
      redZoneTargets: null,
    },
    provenance: overrides.provenance ?? {
      source: "nflverse stats_player weekly",
      sourceSeason: season,
      sourceWeek: week,
      scoringVersion: FANTASY_SCORING_VERSION,
      snapSource: null,
    },
  };
}
