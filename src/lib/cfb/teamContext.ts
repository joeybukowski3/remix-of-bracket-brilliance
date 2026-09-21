import type { CfbGame, CfbSeasonRecord, CfbTeam } from "@/data/cfb/types";

export type CfbTeamGameLine = {
  /** "W 31-20 vs LSU" / "@ Alabama" — without the opponent ranking. */
  text: string;
  /** e.g. "AP #14"; null when the opponent is unranked or the poll is unavailable. */
  opponentRank: string | null;
};

export type CfbTeamGameContext = {
  last: CfbTeamGameLine | null;
  next: CfbTeamGameLine | null;
};

/** "3-0" (or "3-0-1" when ties exist). Missing record → em dash. */
export function formatCfbRecord(record: Pick<CfbSeasonRecord, "wins" | "losses" | "ties"> | null | undefined): string {
  if (!record) return "—";
  const base = `${record.wins}-${record.losses}`;
  return record.ties > 0 ? `${base}-${record.ties}` : base;
}

const byDate = (a: CfbGame, b: CfbGame) => a.date.localeCompare(b.date) || a.week - b.week;

function opponentOf(game: CfbGame, teamId: string, teamById: ReadonlyMap<string, CfbTeam>) {
  const isAway = game.awayTeamId === teamId;
  const opponentId = isAway ? game.homeTeamId : game.awayTeamId;
  const fbsOpponent = teamById.get(opponentId);
  const name = fbsOpponent?.shortName ?? (isAway ? game.homeTeamName : game.awayTeamName) ?? null;
  return { isAway, opponentId, name, isFbs: Boolean(fbsOpponent) };
}

function toLine(
  game: CfbGame,
  teamId: string,
  teamById: ReadonlyMap<string, CfbTeam>,
  apRanks: Readonly<Partial<Record<string, number>>>,
  withResult: boolean,
): CfbTeamGameLine | null {
  const { isAway, opponentId, name, isFbs } = opponentOf(game, teamId, teamById);
  if (!name) return null;
  const prefix = isAway ? "@" : "vs";
  let text = `${prefix} ${name}`;
  if (withResult) {
    const own = isAway ? game.awayScore : game.homeScore;
    const other = isAway ? game.homeScore : game.awayScore;
    if (own == null || other == null) return null;
    const outcome = own > other ? "W" : own < other ? "L" : "T";
    text = `${outcome} ${own}-${other} ${prefix} ${name}`;
  }
  const rank = isFbs ? apRanks[opponentId] : undefined;
  return { text, opponentRank: rank != null ? `AP #${rank}` : null };
}

/**
 * Last completed result and next scheduled game from the existing schedule
 * artifact only. Opponent ranking is the official AP rank when published;
 * non-FBS opponents and unranked teams simply omit it.
 */
export function getCfbTeamGameContext(
  teamId: string,
  games: readonly CfbGame[],
  teamById: ReadonlyMap<string, CfbTeam>,
  apRanks: Readonly<Partial<Record<string, number>>>,
): CfbTeamGameContext {
  const own = games
    .filter((game) => game.awayTeamId === teamId || game.homeTeamId === teamId)
    .sort(byDate);
  const lastGame = [...own].reverse().find(
    (game) => game.gameStatus === "final" && game.awayScore != null && game.homeScore != null,
  );
  const nextGame = own.find((game) => game.gameStatus === "scheduled" || game.gameStatus === "in_progress");
  return {
    last: lastGame ? toLine(lastGame, teamId, teamById, apRanks, true) : null,
    next: nextGame ? toLine(nextGame, teamId, teamById, apRanks, false) : null,
  };
}

/** Restrained team-color tint; null when the color is not a 6-digit hex. */
export function getTeamTintStyle(primaryColor: string | null | undefined) {
  if (!primaryColor || !/^#[0-9a-fA-F]{6}$/.test(primaryColor)) return null;
  return {
    backgroundColor: `${primaryColor}14`,
    borderTop: `3px solid ${primaryColor}`,
  };
}

/** 1 = left team stronger, -1 = right team stronger, 0 = tied or unavailable. Lower national rank wins. */
export function getRankAdvantage(leftRank: number | null, rightRank: number | null): 1 | -1 | 0 {
  if (leftRank == null || rightRank == null || leftRank === rightRank) return 0;
  return leftRank < rightRank ? 1 : -1;
}
