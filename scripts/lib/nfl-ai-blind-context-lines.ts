/**
 * AI Picks v2 WU2 -- the ONE renderer of the market-blind football data block
 * that both Stage A prompts (Grok and ChatGPT, initial and update) print.
 * Sharing it is what guarantees the two providers receive materially
 * identical deterministic football data; neither adapter keeps its own copy.
 *
 * Input is the already-sanitized blind packet
 * (nfl-ai-context-sanitizer.ts's sanitizeGameContextPacketForBlindStageA), so
 * this module cannot print a sportsbook price or a JKB judgment field: the
 * keys are not on the object. Numbers are rendered exactly as produced by the
 * deterministic layers, rounded only to PROMPT_DECIMALS for readability.
 *
 * Deliberately avoids phrasing that resembles a sportsbook price (a team
 * abbreviation directly followed by a signed number, "total <n>", "spread") so
 * the Stage A prompt-leak audit keeps passing on real packets.
 */
import type { AiBlindGameContextPacket } from "./nfl-ai-context-sanitizer";
import type { FormScopeFacts, TeamFormFacts } from "./nfl-team-form-facts";

const PROMPT_DECIMALS = 4;

function compactJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(PROMPT_DECIMALS)) : v));
}

/** A single-game scope has no meaningful record/games/gameIds of its own -- those are stated in the recentGame header. */
function singleGameFacts(facts: FormScopeFacts): Pick<FormScopeFacts, "points" | "efficiency" | "yardage" | "turnovers"> {
  return { points: facts.points, efficiency: facts.efficiency, yardage: facts.yardage, turnovers: facts.turnovers };
}

function sameSample(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function teamFormLines(side: "home" | "away", facts: TeamFormFacts | null): string[] {
  if (!facts) return [`  ${side}: unavailable`];
  const label = `${side} (${facts.team.toUpperCase()})`;
  const season = facts.seasonToDate;
  const lines: string[] = [`  ${label}:`];

  lines.push(
    season.games === 0
      ? `    seasonToDate: no completed regular-season games before this kickoff`
      : `    seasonToDate (${facts.season} regular season, games=${season.games}, record=${season.record}): ${compactJson({ gameIds: season.gameIds, points: season.points, efficiency: season.efficiency, yardage: season.yardage, turnovers: season.turnovers })}`
  );

  const recent = facts.recentGame;
  lines.push(
    recent
      ? `    recentGame (most recent completed game: Week ${recent.week} vs ${recent.opponent.toUpperCase()}, ${recent.homeAway}, result=${recent.outcome}, score=${recent.pointsScored}-${recent.pointsAllowed}, gameId=${recent.gameId}): ${compactJson({ facts: singleGameFacts(recent.facts) })}`
      : `    recentGame: none (no completed game before this kickoff)`
  );

  const window = facts.recentWindow;
  const header = `recentWindow (last ${window.requestedGames} completed games requested, ACTUAL games=${window.games}, record=${window.facts.record})`;
  if (window.games === 0) lines.push(`    ${header}: no completed games`);
  else if (sameSample(window.facts.gameIds, season.gameIds)) lines.push(`    ${header}: same games as seasonToDate, identical figures (cite them under recentWindow.facts.* or seasonToDate.*)`);
  else lines.push(`    ${header}: ${compactJson({ facts: { gameIds: window.facts.gameIds, points: window.facts.points, efficiency: window.facts.efficiency, yardage: window.facts.yardage, turnovers: window.facts.turnovers } })}`);

  if (facts.incompletePriorGameIds.length > 0) {
    lines.push(`    note: results are not yet final for earlier games ${facts.incompletePriorGameIds.join(", ")}, so the samples above may be incomplete`);
  }
  return lines;
}


/** Prior-season background: offense EPA / yards per play and trench win rates (as before) plus the compact two-sided baseline. Every line says it is last season. */
function priorSeasonLines(packet: AiBlindGameContextPacket): string[] {
  const baseline = packet.teamMetrics.priorSeasonBaseline;
  const season = baseline?.season ?? packet.teamMetrics.epa.source_season;
  const tag = `PRIOR-SEASON BACKGROUND${season != null ? `, ${season} regular season` : ""}`;
  const lines = [
    `teamMetrics.epa [${tag}, periodWindow=${packet.teamMetrics.periodWindow}, offense EPA per play]: ${compactJson(packet.teamMetrics.epa)}`,
    `teamMetrics.ypp [${tag}, offense yards per play]: ${compactJson(packet.teamMetrics.ypp)}`,
  ];
  if (baseline && baseline.provenance_status === "available") {
    // offense EPA and yards per play are already on the two lines above; do not print them twice
    const compact = (t: NonNullable<typeof baseline.home>) => {
      const { offEpaPerPlay: _e, offYardsPerPlay: _y, ...rest } = t;
      return compactJson(rest);
    }
    lines.push(`teamMetrics.priorSeasonBaseline [${tag}; defense, scoring and record to go with the two offense lines above]:`);
    if (baseline.away) lines.push(`  away (${packet.identity.awayTeam.toUpperCase()}): ${compact(baseline.away)}`);
    if (baseline.home) lines.push(`  home (${packet.identity.homeTeam.toUpperCase()}): ${compact(baseline.home)}`);
  }
  lines.push(`matchup.trenches [${tag}, through Week 18; ESPN win rates]: ${compactJson(packet.matchup.trenches)}`);
  return lines;
}

/** How the data below is scoped. Printed with the data so the model cannot blur current form, recent form and prior-season background. */
export const BLIND_DATA_READING_GUIDE: readonly string[] = [
  "HOW TO READ THE FOOTBALL DATA ABOVE:",
  "- teamForm is CURRENT-SEASON, regular-season-only data from completed games before this kickoff. Refs: seasonToDate fields sit directly under it (e.g. teamForm.away.seasonToDate.points); recentGame and recentWindow fields sit under their `facts` object (e.g. teamForm.away.recentGame.facts.points). A team's `efficiency.defense`, `yardage.defense` and points `allowed` describe what that team ALLOWED (its opponents' offense in those games).",
  "- recentGame is a SUBSET of seasonToDate, namely that team's last game, not an additional independent sample. Do not count the recent game and the season aggregate as independent evidence; use the game-level view to understand recency, direction, and whether one game is driving the aggregate. recentWindow is likewise drawn from the same games.",
  "- Several metrics (EPA per play, success rate, yards per play, scoring, explosive plays, turnovers) may describe the same underlying performance. Group correlated signals rather than counting each statistic as independent evidence.",
  "- Current-season samples may still be small. Weigh recent evidence against broader prior information appropriately and account for sample uncertainty.",
  "- Early-season samples can produce extreme EPA, scoring and turnover results that are not yet stable. Weigh current-season evidence against the broader background information and reflect uncertainty in the fair line. Do not assume an extreme early-season rate is a stable team level.",
  "- Opponent strength is not currently included in this packet. Do not treat a small unadjusted sample as if it were opponent-adjusted.",
  "- teamMetrics.* (including teamMetrics.priorSeasonBaseline) and matchup.trenches are PRIOR-SEASON BACKGROUND (last season's full regular season, through Week 18), not current form; keep them distinct from teamForm. The baseline gives both offense and defense, scoring and record for last season.",
  "- null means the value is unavailable, never zero.",
];

export function buildBlindContextSummaryLines(packet: AiBlindGameContextPacket): string[] {
  const form = packet.teamForm;
  const formAvailable = form != null && (form.home != null || form.away != null);
  return [
    `identity: ${packet.identity.awayTeamFull} (away) at ${packet.identity.homeTeamFull} (home), season ${packet.identity.season} week ${packet.identity.week}`,
    formAvailable
      ? "teamForm (CURRENT-SEASON deterministic facts; regular season only; completed games before this kickoff only):"
      : "teamForm: unavailable for this game -- no current-season form data was supplied; do not infer any.",
    ...(formAvailable ? [...teamFormLines("away", form.away), ...teamFormLines("home", form.home)] : []),
    ...priorSeasonLines(packet),
    `coaching (descriptive facts only): ${compactJson(packet.coaching)}`,
    `situational: ${compactJson(packet.situational)}`,
    `schedule: kickoff=${packet.schedule.kickoffUtc} venue=${packet.schedule.venue.stadium} isDome=${packet.schedule.venue.isDome}`,
    `weather: ${compactJson(packet.weather)}`,
    "",
    ...BLIND_DATA_READING_GUIDE,
  ];
}
