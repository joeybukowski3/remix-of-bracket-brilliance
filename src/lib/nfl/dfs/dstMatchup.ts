import { z } from "zod";
import { DST_MATCHUP_V1 as POLICY } from "./policies/dstMatchupV1";
import { isFreshDfsSource, sourceReferenceSchema } from "./roleContext";

const componentSchema = sourceReferenceSchema.extend({ value: z.number().finite().nullable(), maxAgeHours: z.number().positive().nullable() });
export const dstInputSchema = z.object({
  team: z.string(), opponent: z.string(), gameId: z.string(), kickoff: z.string(),
  components: z.object({ opponentPoints: componentSchema, opponentOffense: componentSchema, trenches: componentSchema, historicalPpg: componentSchema }),
  warnings: z.array(z.string()),
});
export type DstMatchupInput = z.infer<typeof dstInputSchema>;
export type DstComponentKey = keyof typeof POLICY.components;
export type DstMatchup = {
  dstMatchupScore: number | null; dstMatchupPercentile: number | null; dstMatchupRank: number | null;
  status: "complete" | "partial" | "unavailable";
  componentScores: Record<DstComponentKey, z.infer<typeof componentSchema> & { percentile: number | null; effectiveWeight: number }>;
  componentCoverage: number; policyVersion: string; sourceAsOf: string | null; warnings: string[];
};
const keys = Object.keys(POLICY.components) as DstComponentKey[];

/** Midrank / (n-1): endpoints 0 and 100, tied observations share their midpoint; singleton 50. */
export function dstPercentile(value: number, pool: readonly number[], higherBetter: boolean): number {
  if (pool.length <= 1) return 50;
  const lower = pool.filter(v => v < value).length;
  const ties = pool.filter(v => v === value).length;
  const p = 100 * (lower + (ties - 1) / 2) / (pool.length - 1);
  return higherBetter ? p : 100 - p;
}

/** Input rows must be exactly the uploaded DST population. Off-slate context never enters normalization. */
export function rankDstMatchups(rows: readonly { dkId: string; input: DstMatchupInput | null }[], asOf: string): Map<string, DstMatchup> {
  const usable = (row: typeof rows[number], key: DstComponentKey) => {
    const c = row.input?.components[key];
    if (!c || c.value == null || !Number.isFinite(c.value) || !c.asOf || Date.parse(c.asOf) > Date.parse(asOf) || !Number.isFinite(Date.parse(c.asOf))) return null;
    if (c.maxAgeHours != null && !isFreshDfsSource(c.asOf, asOf, c.maxAgeHours)) return null;
    return c.value;
  };
  const pools = Object.fromEntries(keys.map(key => [key, rows.map(row => usable(row, key)).filter((v): v is number => v != null)])) as Record<DstComponentKey, number[]>;
  const result = new Map<string, DstMatchup>();
  for (const row of rows) {
    const available = keys.filter(key => usable(row, key) != null);
    const coverage = available.reduce((sum, key) => sum + POLICY.components[key].weight, 0);
    const enough = coverage + 1e-9 >= POLICY.minimumCoverage && available.length >= POLICY.minimumComponents;
    const componentScores = Object.fromEntries(keys.map(key => {
      const value = usable(row, key);
      return [key, { ...(row.input?.components[key] ?? { value: null, asOf: null, source: "Unavailable", detail: "No source", maxAgeHours: null }),
        percentile: value == null ? null : dstPercentile(value, pools[key], POLICY.components[key].higherBetter),
        effectiveWeight: enough && value != null ? POLICY.components[key].weight / coverage : 0 }];
    })) as DstMatchup["componentScores"];
    const score = enough ? keys.reduce((sum, key) => sum + (componentScores[key].percentile ?? 0) * componentScores[key].effectiveWeight, 0) : null;
    const times = available.map(key => row.input!.components[key].asOf!).sort();
    result.set(row.dkId, {
      dstMatchupScore: score, dstMatchupPercentile: null, dstMatchupRank: null,
      status: !enough ? "unavailable" : available.length === keys.length ? "complete" : "partial",
      componentScores, componentCoverage: coverage, policyVersion: POLICY.version, sourceAsOf: times[0] ?? null,
      warnings: [...(row.input?.warnings ?? []), ...keys.filter(key => !available.includes(key)).map(key => `${POLICY.components[key].label}: unavailable or stale`),
        ...(!enough ? ["Insufficient component coverage"] : available.length < keys.length ? ["Partial score; available weights renormalized"] : [])],
    });
  }
  const scored = [...result.entries()].filter(([, r]) => r.dstMatchupScore != null).sort((a,b) => b[1].dstMatchupScore! - a[1].dstMatchupScore! || a[0].localeCompare(b[0]));
  const scores = scored.map(([, r]) => r.dstMatchupScore!);
  scored.forEach(([, r], i) => {
    r.dstMatchupRank = i > 0 && scores[i] === scores[i-1] ? scored[i-1][1].dstMatchupRank : i+1;
    r.dstMatchupPercentile = dstPercentile(scores[i], scores, true);
  });
  return result;
}
