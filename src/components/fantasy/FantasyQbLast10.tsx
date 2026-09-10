/**
 * QB "Last 10" pair for the weekly fantasy player detail.
 *
 * Renders the SAME shared `NflLast10TablesSection` (and therefore the same
 * `NflPlayerLast10Table` / `NflOpponentLast10Table`) the NFL Yardage Props
 * Review uses -- no fantasy-specific copy of those tables. The per-game data,
 * including the `Fantasy PPR Points` column, comes from the one shared
 * `yardage-history.json` artifact (passing/QB slice) via the existing
 * `yardageHistoryView` selectors; there is no second fantasy-history fetch.
 *
 * QB only: only the passing slice of the artifact carries the QB comp/att,
 * TD/INT and `fantasyPointsPpr` fields these tables show.
 */
import { useMemo } from "react";
import { useNflYardageHistory } from "@/hooks/useNflYardageHistory";
import {
  buildOpponentGameTimeTeamByGame,
  lookupCurrentWeekEpaRank,
  lookupOpponentHistory,
  lookupPlayerHistory,
} from "@/lib/nfl/props/review/yardageHistoryView";
import NflLast10TablesSection from "@/components/nfl/history/NflLast10TablesSection";
import type { NflYardagePlayerCurrentMatchup } from "@/components/nfl/history/NflPlayerLast10Table";
import type { NflYardageOpponentCurrentMatchup } from "@/components/nfl/history/NflOpponentLast10Table";

export default function FantasyQbLast10({
  season,
  playerId,
  playerName,
  team,
  opponent,
  homeAway,
  only,
  unwrapped,
}: {
  season: number;
  playerId: string;
  playerName: string;
  team: string;
  opponent: string;
  homeAway: "home" | "away";
  /** Render just one of the two shared tables (e.g. one per mobile accordion). */
  only?: "player" | "opponent";
  /** Drop the shared pale-yellow shell card (host supplies its own container). */
  unwrapped?: boolean;
}) {
  const history = useNflYardageHistory(season, true);
  const playerHistory = lookupPlayerHistory(history.data, playerId, "passing");
  const opponentHistory = lookupOpponentHistory(history.data, opponent, "passing", "QB");

  const teamByGame = useMemo(
    () => buildOpponentGameTimeTeamByGame(history.data, opponent, "passing", "QB"),
    [history.data, opponent],
  );

  const opponentWeekRank = lookupCurrentWeekEpaRank(history.data, opponent);
  const teamWeekRank = lookupCurrentWeekEpaRank(history.data, team);
  const playerCurrentMatchup: NflYardagePlayerCurrentMatchup | null = opponentWeekRank
    ? { opponentAbbr: opponent, homeAway, opponentDefRank: opponentWeekRank.defenseRank }
    : null;
  const opponentCurrentMatchup: NflYardageOpponentCurrentMatchup | null = teamWeekRank
    ? {
        playerName,
        teamAbbr: team,
        // the DEFENSE's own home/away is the inverse of the QB's team's.
        homeAway: homeAway === "home" ? "away" : "home",
        offenseRank: teamWeekRank.offenseRank,
      }
    : null;

  if (history.loading && !history.data) {
    return <p className="px-1 text-[11px] text-slate-400">Loading Last 10 history…</p>;
  }

  return (
    <NflLast10TablesSection
      playerName={playerName}
      opponentAbbr={opponent}
      position="QB"
      playerHistory={playerHistory}
      opponentHistory={opponentHistory}
      currentLine={null}
      historyError={Boolean(history.error)}
      playerCurrentMatchup={playerCurrentMatchup}
      opponentCurrentMatchup={opponentCurrentMatchup}
      teamByGame={teamByGame}
      only={only}
      unwrapped={unwrapped}
    />
  );
}
