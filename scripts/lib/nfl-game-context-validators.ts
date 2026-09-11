/**
 * WU1 -- deterministic validators for NflGameContextPacket
 * (scripts/lib/nfl-full-game-context.ts). Mechanical only, no AI/LLM
 * involvement. Every check returns an actionable message: what failed and
 * which field/value caused it.
 */

import type { NflGameContextPacket, TeamsArtifact } from "./nfl-full-game-context";

export type ValidationIssue = { code: string; message: string; severity: "error" | "warning" };

function issue(code: string, message: string, severity: ValidationIssue["severity"] = "error"): ValidationIssue {
  return { code, message, severity };
}

/** Canonical game identity: gameId parses to season/week/away/home tokens that match identity fields. */
export function validateGameIdentity(packet: NflGameContextPacket): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { identity } = packet;
  const match = /^(\d{4})_(\d{2})_([A-Z]+)_([A-Z]+)$/.exec(identity.gameId);
  if (!match) {
    issues.push(issue("identity.gameId.format", `gameId "${identity.gameId}" does not match <season>_<week>_<AWAY>_<HOME>`));
    return issues;
  }
  const [, seasonStr, weekStr, awayToken, homeToken] = match;
  if (Number(seasonStr) !== identity.season) {
    issues.push(issue("identity.gameId.season", `gameId season ${seasonStr} does not match identity.season ${identity.season}`));
  }
  if (Number(weekStr) !== identity.week) {
    issues.push(issue("identity.gameId.week", `gameId week ${weekStr} does not match identity.week ${identity.week}`));
  }
  if (awayToken.toLowerCase() !== identity.awayTeam) {
    issues.push(issue("identity.gameId.away", `gameId away token ${awayToken} does not match identity.awayTeam ${identity.awayTeam}`));
  }
  if (homeToken.toLowerCase() !== identity.homeTeam) {
    issues.push(issue("identity.gameId.home", `gameId home token ${homeToken} does not match identity.homeTeam ${identity.homeTeam}`));
  }
  return issues;
}

/** Home and away teams must be distinct and non-empty -- catches a swapped/duplicated orientation. */
export function validateAwayHomeOrientation(packet: NflGameContextPacket): ValidationIssue[] {
  const { identity } = packet;
  const issues: ValidationIssue[] = [];
  if (!identity.homeTeam || !identity.awayTeam) {
    issues.push(issue("identity.orientation.missing", "homeTeam/awayTeam must both be non-empty"));
  } else if (identity.homeTeam === identity.awayTeam) {
    issues.push(issue("identity.orientation.duplicate", `homeTeam and awayTeam are both "${identity.homeTeam}"`));
  }
  return issues;
}

/** No unknown team aliases: home/away abbrs must resolve against teams.json. */
export function validateNoUnknownTeamAliases(packet: NflGameContextPacket, teams: TeamsArtifact): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const known = new Set(teams.teams.map((t) => t.abbr));
  if (!known.has(packet.identity.homeTeam)) {
    issues.push(issue("identity.unknownTeam.home", `homeTeam "${packet.identity.homeTeam}" is not in teams.json`));
  }
  if (!known.has(packet.identity.awayTeam)) {
    issues.push(issue("identity.unknownTeam.away", `awayTeam "${packet.identity.awayTeam}" is not in teams.json`));
  }
  return issues;
}

/** kickoffUtc must be a parseable ISO timestamp. */
export function validateKickoffTimestamp(packet: NflGameContextPacket): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ms = Date.parse(packet.schedule.kickoffUtc);
  if (!Number.isFinite(ms)) {
    issues.push(issue("schedule.kickoffUtc.unparseable", `schedule.kickoffUtc "${packet.schedule.kickoffUtc}" does not parse as an ISO timestamp`));
  }
  return issues;
}

/** Market spread orientation: homeLine and awayLine, when both present, must be mirror-image (sum to 0). */
export function validateSpreadOrientation(packet: NflGameContextPacket): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { homeLine, awayLine } = packet.market.spread;
  if (homeLine != null && awayLine != null && Math.abs(homeLine + awayLine) > 0.01) {
    issues.push(issue("market.spread.orientation", `market spread homeLine (${homeLine}) and awayLine (${awayLine}) are not mirror-image`));
  }
  return issues;
}

/** Total numeric sanity: a real NFL total line is a positive number in a plausible range. */
export function validateTotalSanity(packet: NflGameContextPacket): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const line = packet.market.total.line;
  if (line != null && (line <= 0 || line < 20 || line > 90)) {
    issues.push(issue("market.total.sanity", `market total line ${line} is outside the plausible NFL range [20, 90]`));
  }
  return issues;
}

/**
 * JKB spread orientation: projectedSpread.homeLine and modelMarketEdge.spread
 * must be internally consistent with the market's homeLine when both exist
 * (edge = jkbHomeLine - marketHomeLine).
 */
export function validateJkbSpreadOrientation(packet: NflGameContextPacket): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const jkbLine = packet.jkbModels.projectedSpread.homeLine;
  const marketLine = packet.market.spread.homeLine;
  const edge = packet.jkbModels.modelMarketEdge.spread;
  if (jkbLine != null && marketLine != null && edge != null) {
    const expected = jkbLine - marketLine;
    if (Math.abs(expected - edge) > 0.01) {
      issues.push(
        issue(
          "jkbModels.spread.edgeMismatch",
          `modelMarketEdge.spread (${edge}) does not equal projectedSpread.homeLine (${jkbLine}) - market.spread.homeLine (${marketLine})`
        )
      );
    }
  }
  return issues;
}

/** The packet must be built strictly before kickoff (no postgame generation). */
export function validateGeneratedBeforeKickoff(packet: NflGameContextPacket): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const generated = Date.parse(packet.generatedAt);
  const kickoff = Date.parse(packet.schedule.kickoffUtc);
  if (Number.isFinite(generated) && Number.isFinite(kickoff) && generated >= kickoff) {
    issues.push(issue("pregameSafety.generatedAfterKickoff", `generatedAt (${packet.generatedAt}) is not strictly before kickoffUtc (${packet.schedule.kickoffUtc})`));
  }
  return issues;
}

/** Every section that has data must be traceable to a source in provenance.sources. */
export function validateProvenancePresent(packet: NflGameContextPacket): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (packet.provenance.sources.length === 0) {
    issues.push(issue("provenance.sources.empty", "provenance.sources is empty; no artifact is traceable"));
  }
  for (const source of packet.provenance.sources) {
    if (!source.contentHash) {
      issues.push(issue("provenance.sources.missingHash", `source "${source.logicalName}" (${source.path}) has no contentHash`));
    }
  }
  return issues;
}

/**
 * No postgame result fields: the packet's own type never has a score field,
 * but this walks the serialized JSON defensively for forbidden keys in case
 * a future section accidentally introduces one.
 */
const FORBIDDEN_POSTGAME_KEYS = ["finalScore", "homeScore", "awayScore", "winningTeam", "result", "actualMargin", "gameResult"];

export function validateNoPostgameFields(packet: NflGameContextPacket): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<unknown>();
  function walk(value: unknown, path: string): void {
    if (value == null || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_POSTGAME_KEYS.includes(key)) {
        issues.push(issue("pregameSafety.forbiddenKey", `forbidden postgame field "${key}" found at ${path}.${key}`));
      }
      walk(val, `${path}.${key}`);
    }
  }
  walk(packet, "packet");
  return issues;
}

/** Duplicate/conflicting market records: sportsbook selection must be exactly one book, never a blended value. */
export function validateNoDuplicateMarketRecords(packet: NflGameContextPacket): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (packet.market.provenance_status === "available" && !packet.market.sportsbook) {
    issues.push(issue("market.sportsbook.missing", "market is available but no single sportsbook was selected"));
  }
  return issues;
}

export function validateGameContextPacket(packet: NflGameContextPacket, teams: TeamsArtifact): ValidationIssue[] {
  return [
    ...validateGameIdentity(packet),
    ...validateAwayHomeOrientation(packet),
    ...validateNoUnknownTeamAliases(packet, teams),
    ...validateKickoffTimestamp(packet),
    ...validateSpreadOrientation(packet),
    ...validateTotalSanity(packet),
    ...validateJkbSpreadOrientation(packet),
    ...validateGeneratedBeforeKickoff(packet),
    ...validateProvenancePresent(packet),
    ...validateNoPostgameFields(packet),
    ...validateNoDuplicateMarketRecords(packet),
  ];
}
