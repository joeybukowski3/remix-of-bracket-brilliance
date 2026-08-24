// CFB Model V2 — leakage-safe schedule graph (Phase 10 §5/§9, WU2 §8/§9).
// Faithful port of the graph-construction half of
// src/lib/cfb/research/phase8/scheduleGraph.ts (COMPONENT_SIZE-relevant
// fields only — cross-conference/degree fields the frozen finalist doesn't
// use are omitted, not because they're forbidden, but because WU1 froze
// COMPONENT_SIZE as the only supported policy; see config.ts).

import type { CfbNormalizedHistoricalGame } from "../../pipeline/types";

export type CfbV2TeamGraphMetrics = {
  teamId: string;
  componentId: number;
  componentSize: number;
  /** Games played entering this cutoff — completed FBS-vs-FBS games strictly before it. */
  gamesPlayed: number;
};

export type CfbV2ScheduleGraph = {
  season: number;
  /** The cutoff: only games with week < asOfWeek are edges. */
  asOfWeek: number;
  byTeam: Map<string, CfbV2TeamGraphMetrics>;
};

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    this.parent.set(x, root);
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function isFbsVsFbsGame(game: CfbNormalizedHistoricalGame): boolean {
  return (game.homeClassification ?? "").toLowerCase() === "fbs" && (game.awayClassification ?? "").toLowerCase() === "fbs";
}

/**
 * Builds the schedule graph as of `asOfWeek` for `fbsTeamIds`. Nodes are
 * every requested FBS team, including teams with zero completed games
 * (componentSize=1, their own singleton component — never fabricated as
 * connected). Edges are completed FBS-vs-FBS games strictly before
 * `asOfWeek` (§8 — leakage-safe by construction; see scheduleGraph.test.ts
 * for the week-N-absent-from-its-own-pregame-graph proof).
 */
export function buildCfbV2ScheduleGraph(
  season: number,
  asOfWeek: number,
  fbsTeamIds: readonly string[],
  games: readonly CfbNormalizedHistoricalGame[],
): CfbV2ScheduleGraph {
  const priorGames = games.filter(
    (g) => g.season === season && g.status === "final" && g.week < asOfWeek && isFbsVsFbsGame(g) && g.homeTeamId !== null && g.awayTeamId !== null,
  );

  const uf = new UnionFind();
  const gamesPlayedByTeam = new Map<string, number>();
  for (const id of fbsTeamIds) uf.find(id);

  for (const g of priorGames) {
    const homeTeamId = g.homeTeamId as string;
    const awayTeamId = g.awayTeamId as string;
    uf.union(homeTeamId, awayTeamId);
    gamesPlayedByTeam.set(homeTeamId, (gamesPlayedByTeam.get(homeTeamId) ?? 0) + 1);
    gamesPlayedByTeam.set(awayTeamId, (gamesPlayedByTeam.get(awayTeamId) ?? 0) + 1);
  }

  const componentMembers = new Map<string, string[]>();
  for (const id of fbsTeamIds) {
    const root = uf.find(id);
    const arr = componentMembers.get(root) ?? [];
    arr.push(id);
    componentMembers.set(root, arr);
  }
  const componentIdByRoot = new Map<string, number>();
  [...componentMembers.keys()].forEach((root, i) => componentIdByRoot.set(root, i));

  const byTeam = new Map<string, CfbV2TeamGraphMetrics>();
  for (const id of fbsTeamIds) {
    const root = uf.find(id);
    byTeam.set(id, {
      teamId: id,
      componentId: componentIdByRoot.get(root)!,
      componentSize: componentMembers.get(root)!.length,
      gamesPlayed: gamesPlayedByTeam.get(id) ?? 0,
    });
  }

  return { season, asOfWeek, byTeam };
}
