import type { CfbResearchGame } from "../types";
import type { TeamGraphMetrics, WeekGraphSnapshot } from "./types";

function isFbsVsFbs(game: CfbResearchGame): boolean {
  return (game.homeClassification ?? "").toLowerCase() === "fbs" && (game.awayClassification ?? "").toLowerCase() === "fbs";
}

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

/**
 * Section 3 — builds one schedule-graph snapshot per (season, week) cutoff,
 * using ONLY games completed strictly before `week` (walk-forward safe by
 * construction — see leakageTests.test.ts). Nodes are every FBS team that
 * appears in the season's schedule (including teams with zero games played
 * yet, which get componentSize=1/uniqueOpponents=0 as their own singleton
 * component — never fabricated as connected).
 */
export function buildWeekGraphSnapshots(
  season: number,
  games: readonly CfbResearchGame[],
  teamConferenceById: ReadonlyMap<string, string | null>,
): WeekGraphSnapshot[] {
  const fbsGames = games.filter((g) => g.status === "final" && isFbsVsFbs(g));
  const allTeamIds = [...new Set(fbsGames.flatMap((g) => [g.homeExternalId, g.awayExternalId]))];
  const weeks = [...new Set(fbsGames.map((g) => g.week))].sort((a, b) => a - b);

  return weeks.map((week) => {
    const priorGames = fbsGames.filter((g) => g.week < week);
    const uf = new UnionFind();
    const opponentsByTeam = new Map<string, Set<string>>();
    const gamesPlayedByTeam = new Map<string, number>();
    const crossConfByTeam = new Map<string, Set<string>>();

    for (const id of allTeamIds) {
      uf.find(id);
      opponentsByTeam.set(id, new Set());
      crossConfByTeam.set(id, new Set());
    }

    for (const g of priorGames) {
      uf.union(g.homeExternalId, g.awayExternalId);
      opponentsByTeam.get(g.homeExternalId)!.add(g.awayExternalId);
      opponentsByTeam.get(g.awayExternalId)!.add(g.homeExternalId);
      gamesPlayedByTeam.set(g.homeExternalId, (gamesPlayedByTeam.get(g.homeExternalId) ?? 0) + 1);
      gamesPlayedByTeam.set(g.awayExternalId, (gamesPlayedByTeam.get(g.awayExternalId) ?? 0) + 1);

      const homeConf = teamConferenceById.get(g.homeExternalId) ?? null;
      const awayConf = teamConferenceById.get(g.awayExternalId) ?? null;
      if (homeConf !== null && awayConf !== null && homeConf !== awayConf) {
        crossConfByTeam.get(g.homeExternalId)!.add(g.awayExternalId);
        crossConfByTeam.get(g.awayExternalId)!.add(g.homeExternalId);
      }
    }

    const componentMembers = new Map<string, string[]>();
    for (const id of allTeamIds) {
      const root = uf.find(id);
      const arr = componentMembers.get(root) ?? [];
      arr.push(id);
      componentMembers.set(root, arr);
    }
    const componentIdByRoot = new Map<string, number>();
    [...componentMembers.keys()].forEach((root, i) => componentIdByRoot.set(root, i));

    const byTeam = new Map<string, TeamGraphMetrics>();
    for (const id of allTeamIds) {
      const root = uf.find(id);
      const componentId = componentIdByRoot.get(root)!;
      const componentSize = componentMembers.get(root)!.length;
      byTeam.set(id, {
        teamExternalId: id,
        componentId,
        componentSize,
        uniqueOpponents: opponentsByTeam.get(id)?.size ?? 0,
        weightedDegree: gamesPlayedByTeam.get(id) ?? 0,
        crossConferenceOpponents: crossConfByTeam.get(id)?.size ?? 0,
      });
    }

    return { season, week, componentCount: componentMembers.size, byTeam };
  });
}
