import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CFB_RESEARCH_NORMALIZED_DIR } from "../config/researchConfig";
import type { CfbResearchGame } from "../types";
import { MIN_BUCKET_SAMPLE_SIZE, PHASE7_TEST_SEASONS } from "./config";
import { mae } from "./statsUtils";
import type { MissDatasetRow } from "./types";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");

function isFbsVsFbs(g: CfbResearchGame): boolean {
  return (g.homeClassification ?? "").toLowerCase() === "fbs" && (g.awayClassification ?? "").toLowerCase() === "fbs";
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

/** key: `${season}:${week}` -> component count among teams with >=1 game played entering that week */
export function computeComponentCountByWeek(testSeasons: readonly number[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const season of testSeasons) {
    const games = (
      JSON.parse(readFileSync(resolve(REPO_ROOT, CFB_RESEARCH_NORMALIZED_DIR, String(season), "games.json"), "utf8")) as CfbResearchGame[]
    ).filter((g) => g.status === "final" && isFbsVsFbs(g));
    const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);

    for (const week of weeks) {
      const uf = new UnionFind();
      const priorGames = games.filter((g) => g.week < week);
      const teamsWithGames = new Set<string>();
      for (const g of priorGames) {
        uf.union(g.homeExternalId, g.awayExternalId);
        teamsWithGames.add(g.homeExternalId);
        teamsWithGames.add(g.awayExternalId);
      }
      const roots = new Set([...teamsWithGames].map((t) => uf.find(t)));
      result.set(`${season}:${week}`, roots.size);
    }
  }
  return result;
}

export type ScheduleConnectivityResult = {
  byComponentCountBucket: { bucketLabel: string; n: number; modelMae: number | null; marketMae: number | null; modelMinusMarketMae: number | null }[];
  earlySeasonVsLater: { label: string; n: number; modelMae: number | null; marketMae: number | null; modelMinusMarketMae: number | null }[];
};

/**
 * Section 15 — schedule-network connectivity. A high component count at a
 * game's prediction cutoff means the two teams' rating clusters may not
 * yet be linked through common opponents (opponent adjustment has less
 * cross-cluster information to work with) — this tests whether that
 * predicts a larger model-vs-market gap, not just a larger raw error.
 */
export function buildScheduleConnectivityAnalysis(rows: readonly MissDatasetRow[]): ScheduleConnectivityResult {
  const componentsByWeek = computeComponentCountByWeek([...PHASE7_TEST_SEASONS]);

  function toRow(label: string, group: readonly MissDatasetRow[]) {
    const modelMaeVal = mae(group.map((r) => r.modelMarginError));
    const marketMaeVal = mae(group.filter((r) => r.marketMarginError !== null).map((r) => r.marketMarginError as number));
    const enough = group.length >= MIN_BUCKET_SAMPLE_SIZE;
    return {
      bucketLabel: label,
      n: group.length,
      modelMae: enough ? modelMaeVal : null,
      marketMae: enough ? marketMaeVal : null,
      modelMinusMarketMae: enough && modelMaeVal !== null && marketMaeVal !== null ? modelMaeVal - marketMaeVal : null,
    };
  }

  const rowsWithComponents = rows.map((r) => ({ row: r, components: componentsByWeek.get(`${r.season}:${r.week}`) ?? null }));
  const buckets = [
    { label: "high_fragmentation (10+)", min: 10, max: Infinity },
    { label: "moderate (3-9)", min: 3, max: 10 },
    { label: "fully_connected (1-2)", min: 1, max: 3 },
  ];
  const byComponentCountBucket = buckets.map((b) => {
    const group = rowsWithComponents.filter((rc) => rc.components !== null && rc.components >= b.min && rc.components < b.max).map((rc) => rc.row);
    return toRow(b.label, group);
  });

  const earlySeason = rows.filter((r) => r.week <= 3);
  const laterSeason = rows.filter((r) => r.week > 3);
  const earlySeasonVsLater = [toRow("weeks_1_3", earlySeason), toRow("week_4_plus", laterSeason)].map((r) => ({
    label: r.bucketLabel,
    n: r.n,
    modelMae: r.modelMae,
    marketMae: r.marketMae,
    modelMinusMarketMae: r.modelMinusMarketMae,
  }));

  return { byComponentCountBucket, earlySeasonVsLater };
}
