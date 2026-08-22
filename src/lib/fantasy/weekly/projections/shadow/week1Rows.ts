import { buildTrainingRow, type UniverseCandidate } from "../build";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import type { WeeklyFantasyProjectionTrainingRow } from "../contract";
import type { Week1ShadowCandidate } from "./week1Universe";

/**
 * Turns a resolved Week 1 2026 shadow candidate into the SAME
 * `WeeklyFantasyProjectionTrainingRow` shape the Phase 1 dataset uses, via
 * the existing `buildTrainingRow` (unmodified). Because `target.season =
 * 2026, target.week = 1`, every "current season through week N-1" field
 * (`gamesPlayedPrior`, `seasonPpgPrior`, `last3PpgPrior`, team/opponent
 * `...Prior` context, current-season FPA) is computed from `history` rows
 * strictly before season 2026 week 1 -- there are none -- so those fields
 * come back `0`/`null` by construction, never by a special-cased override.
 * `priorSeasonPpg`/`priorSeasonCarries`/etc. (season - 1 = 2025) DO populate
 * from `history2025`, because `buildTrainingRow` treats them as an entirely
 * separate previous-NFL-season aggregate, not a current-season field.
 *
 * `teamHistory` is intentionally always `[]`: `buildTrainingRow` only reads
 * team/opponent EPA for `target.season` rows strictly before `target.week`,
 * and no 2026 team-game rows exist yet at Week 1, so the result is identical
 * (all-null) whether an empty array or a populated one is passed -- passing
 * `[]` keeps that fact obvious from the call site instead of implicit.
 */
export function buildWeek1ShadowTrainingRow(
  candidate: Week1ShadowCandidate,
  history2025: readonly HistoricalPlayerWeek[],
  generatedAt: string,
  provenance: WeeklyFantasyProjectionTrainingRow["provenance"],
): WeeklyFantasyProjectionTrainingRow {
  const target: UniverseCandidate = {
    season: 2026, week: 1,
    playerId: candidate.playerId, playerName: candidate.playerName, position: candidate.position,
    team: candidate.team, opponent: candidate.opponent, eligible: true,
  };
  const row = buildTrainingRow(target, history2025, [], [], () => null, generatedAt);
  return {
    ...row,
    homeAway: candidate.homeAway === "neutral" ? "home" : candidate.homeAway,
    provenance,
  };
}
