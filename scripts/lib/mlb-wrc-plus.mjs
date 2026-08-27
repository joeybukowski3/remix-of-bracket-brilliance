export const MLB_WOBA_SCALE = 1.157;
export const MLB_FALLBACK_RUNS_PER_PA = 0.122;

export function approximateWrcPlusFromWoba(woba, leagueWoba, leagueRunsPerPa) {
  if (!Number.isFinite(woba) || !Number.isFinite(leagueWoba)) return null;
  const runsPerPa = Number.isFinite(leagueRunsPerPa) && leagueRunsPerPa > 0
    ? leagueRunsPerPa
    : MLB_FALLBACK_RUNS_PER_PA;
  return Math.round((((woba - leagueWoba) / MLB_WOBA_SCALE) + runsPerPa) / runsPerPa * 100);
}
