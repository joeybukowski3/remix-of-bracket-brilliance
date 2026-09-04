/**
 * Compact row-by-row metric grid for the Yardage Props Review expanded
 * player view -- replaces the earlier 5-box stat-tile grid. This grid is
 * PLAYER/OFFENSE-oriented: opponent-defense figures (yards allowed, EPA
 * allowed, Success Rate allowed) live in the Opponent Last 10 table and the
 * "Show the Work" cards, never duplicated here under a player-looking label.
 * Pure field selection/reshaping over already-computed data -- nothing here
 * recomputes a model input or invents a rank that doesn't already exist:
 *
 *   - Last 10 / Last 5 Yds/Gm: this page loads no season-to-date player
 *     aggregate (only `projections`, `market`, `opponentContext`, and the
 *     leakage-safe `yardageHistory` log are fetched here) -- so this is the
 *     player's own actual-yards history log (`yardage-history.json`, the
 *     exact same games already shown in the Player Last 10 table, sorted
 *     most-recent-first by the generator), averaged over the first 5 / all
 *     available games. Deliberately labeled "Last 10"/"Last 5", never
 *     "Season" -- this codebase has no loaded season-to-date figure for an
 *     individual player, and calling a 10-game trailing log "Season" would
 *     misrepresent it.
 *   - Team [mode] EPA: `opponentContext.epaEdge.offense` -- the row's own
 *     TEAM's offensive EPA (not the opponent's allowed EPA), computed
 *     alongside the opponent's allowed value by the same
 *     `buildNflOffenseMatchupEdges` authority. No per-player EPA exists in
 *     this codebase, so team-level offense EPA is the closest legitimate
 *     stand-in -- explicitly labeled "Team", never claimed as the player's
 *     individual figure.
 *   - Yards/Attempt or Yards/Target: the player's own windowed rate
 *     (`row.featureSnapshot.yardsPerAttempt` / `.rollingYardsPerCarry` /
 *     `.rollingYardsPerTarget`). No per-player rank exists anywhere in this
 *     codebase for this value -- shown as a value only, never a fabricated
 *     rank.
 *   - Team [mode] Success Rate: `opponentContext.successEdge.offense` --
 *     same team-level offense/defense split as EPA above.
 *   - [mode] vs Defense Edge: `opponentContext.epaEdge.rankDifference`
 *     (Team Edge), already shown in Show the Work -- the one row that IS a
 *     genuine offense-vs-defense comparison, not a duplicated opponent stat.
 */
import { formatRankOrdinal } from "@/components/nfl/matchups/rankOrdinal";
import { formatYardsAllowed } from "@/lib/nfl/productionAllowedData";
import type { NflCurrentWeekProjectionRow } from "../types/currentWeekProjection";
import type { NflYardageOpponentContext } from "./opponentContext";
import type { NflYardagePlayerHistory } from "../types/yardageHistory";
import { matchupScoreBand, MATCHUP_SCORE_BAND_LABEL } from "./yardageMarketJoin";
import { resolveWindowSource } from "./playerDetailView";

export type NflYardageMetricGridRow = {
  key: string;
  label: string;
  /** Formatted value, e.g. "259.0", "48.2%", "+3". "N/A" when the underlying value is unavailable. */
  value: string;
  /** Null when no established rank exists for this metric -- never a fabricated placeholder. */
  rank: number | null;
  rankTitle?: string;
};

function fmt1(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? value.toFixed(1) : "N/A";
}

const MODE_LABEL: Record<"passing" | "rushing" | "receiving", string> = {
  passing: "Pass",
  rushing: "Rush",
  receiving: "Rec",
};

/** Player's own rolling Yards/Attempt (passing/rushing) or Yards/Target (receiving) -- no established per-player rank exists for this value anywhere in the codebase. */
function ownYardsPerOpportunity(row: NflCurrentWeekProjectionRow): string {
  if (row.market === "passing") {
    const rate = row.featureSnapshot.yardsPerAttempt;
    const source = resolveWindowSource(rate);
    return fmt1(source ? rate[source] : null);
  }
  if (row.market === "rushing") {
    const rate = row.featureSnapshot.rollingYardsPerCarry;
    const source = resolveWindowSource(rate);
    return fmt1(source ? rate[source] : null);
  }
  const rate = row.featureSnapshot.rollingYardsPerTarget;
  const source = resolveWindowSource(rate);
  return fmt1(source ? rate[source] : null);
}

/** Average of the player's own actual yards over the first `count` games in the leakage-safe history log (already sorted most-recent-first by the generator). Null when no history is loaded. */
function averageActualYards(history: NflYardagePlayerHistory | null | undefined, count: number): number | null {
  if (!history || history.games.length === 0) return null;
  const games = history.games.slice(0, count);
  if (games.length === 0) return null;
  return games.reduce((sum, g) => sum + g.actualYards, 0) / games.length;
}

/**
 * "+9 (9th Off vs 3rd Def)" -- both ranks shown explicitly rather than a
 * single misleading "(Nth)" suffix, since the edge itself is a difference
 * between two distinct ranked units. Read verbatim from the existing
 * `epaEdge` authority; never re-derived.
 */
function edgeValueWithBothRanks(opponentContext: NflYardageOpponentContext | undefined): string {
  const edgeEdge = opponentContext?.epaEdge;
  if (!edgeEdge || edgeEdge.rankDifference == null) return "N/A";
  const base = `${edgeEdge.rankDifference > 0 ? "+" : ""}${edgeEdge.rankDifference}`;
  const offOrdinal = formatRankOrdinal(edgeEdge.offenseRank);
  const defOrdinal = formatRankOrdinal(edgeEdge.defenseRank);
  if (!offOrdinal || !defOrdinal) return base;
  return `${base} (${offOrdinal} Off vs ${defOrdinal} Def)`;
}

export function buildMetricGridRows(
  row: NflCurrentWeekProjectionRow,
  opponentContext: NflYardageOpponentContext | undefined,
  playerHistory?: NflYardagePlayerHistory | null,
): NflYardageMetricGridRow[] {
  const mode = MODE_LABEL[row.market];
  const perOpportunityLabel = row.market === "receiving" ? "Yards / Target" : "Yards / Attempt";

  const teamEpaOffense = opponentContext?.epaEdge.offense ?? null;
  const teamSuccessOffense = opponentContext?.successEdge.offense ?? null;

  return [
    {
      key: "last10YdsPerGame",
      label: `Last 10 ${mode} Yds/Gm`,
      value: fmt1(averageActualYards(playerHistory, 10)),
      // No established per-player rank exists anywhere in this codebase for this value.
      rank: null,
    },
    {
      key: "last5YdsPerGame",
      label: `Last 5 ${mode} Yds/Gm`,
      value: fmt1(averageActualYards(playerHistory, 5)),
      rank: null,
    },
    {
      key: "teamEpa",
      label: `Team ${mode} EPA`,
      value: teamEpaOffense?.formattedValue ?? "N/A",
      rank: teamEpaOffense?.rank ?? null,
      rankTitle: teamEpaOffense?.rank != null ? `Team's own offensive EPA rank -- ${formatRankOrdinal(teamEpaOffense.rank)}` : undefined,
    },
    {
      key: "ownYardsPerOpportunity",
      label: perOpportunityLabel,
      value: ownYardsPerOpportunity(row),
      rank: null,
    },
    {
      key: "teamSuccessRate",
      label: `Team ${mode} Success Rate`,
      value: teamSuccessOffense?.formattedValue ?? "N/A",
      rank: teamSuccessOffense?.rank ?? null,
      rankTitle: teamSuccessOffense?.rank != null ? `Team's own Success Rate rank -- ${formatRankOrdinal(teamSuccessOffense.rank)}` : undefined,
    },
    {
      key: "vsDefenseEdge",
      label: `${mode} vs Defense Edge`,
      // Both offense and defense ranks shown explicitly -- never a single misleading "(Nth)" suffix.
      value: edgeValueWithBothRanks(opponentContext),
      rank: null,
    },
  ];
}

/**
 * Opponent-defense equivalent of the grid above -- strictly opponent-side
 * fields, never a player/offense figure under a defense-looking label. Six
 * legitimate rows chosen from what this page already loads (opponentContext
 * + the row's own frozen matchupScore); no new fetch, no invented metric
 * (e.g. yards/attempt allowed and sack/pressure context are NOT included --
 * neither is loaded anywhere on this page).
 */
export function buildOpponentMetricGridRows(
  row: NflCurrentWeekProjectionRow,
  opponentContext: NflYardageOpponentContext | undefined,
): NflYardageMetricGridRow[] {
  const mode = MODE_LABEL[row.market];
  const seasonAllowed = opponentContext?.productionAllowed.season ?? null;
  const last5Allowed = opponentContext?.productionAllowed.last5 ?? null;
  const epaDefense = opponentContext?.epaEdge.defense ?? null;
  const successDefense = opponentContext?.successEdge.defense ?? null;
  const matchup = row.matchupScore;
  const band = matchup ? matchupScoreBand(matchup.matchupScore) : null;

  return [
    {
      key: "seasonYdsAllowed",
      label: `Season ${mode} Yds Allowed/Gm`,
      value: seasonAllowed ? formatYardsAllowed(seasonAllowed) : "N/A",
      // Matches the existing tone-only convention for this exact cell elsewhere on the page (OppYardsAllowedSeasonCell) -- no numeric ordinal is exposed for it anywhere in this codebase.
      rank: null,
    },
    {
      key: "last5YdsAllowed",
      label: `Last 5 ${mode} Yds Allowed/Gm`,
      value: last5Allowed ? formatYardsAllowed(last5Allowed) : "N/A",
      rank: null,
    },
    {
      key: "epaAllowed",
      label: `${mode} EPA Allowed`,
      value: epaDefense?.formattedValue ?? "N/A",
      rank: epaDefense?.rank ?? null,
      rankTitle: epaDefense?.rank != null ? `Opponent EPA-allowed rank -- ${formatRankOrdinal(epaDefense.rank)}` : undefined,
    },
    {
      key: "successAllowed",
      label: `${mode} Success Rate Allowed`,
      value: successDefense?.formattedValue ?? "N/A",
      rank: successDefense?.rank ?? null,
      rankTitle: successDefense?.rank != null ? `Opponent Success-Rate-allowed rank -- ${formatRankOrdinal(successDefense.rank)}` : undefined,
    },
    {
      key: "matchupRating",
      label: "Matchup Rating",
      value: matchup ? `${matchup.matchupScore.toFixed(1)}${band ? ` (${MATCHUP_SCORE_BAND_LABEL[band]})` : ""}` : "N/A",
      rank: null,
    },
    {
      key: "vsOffenseEdge",
      label: `${mode} vs Defense Edge`,
      value: edgeValueWithBothRanks(opponentContext),
      rank: null,
    },
  ];
}
