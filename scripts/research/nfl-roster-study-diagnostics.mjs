/**
 * Descriptive diagnostics for nfl-roster-aware-projection-study.mjs.
 *
 * Everything here is in sample and pooled over all four transitions, so it
 * describes association only - it selects no model, tunes no parameter, and
 * feeds nothing back into the out-of-sample results. Correlation here is not
 * causation, and a continuity split is not a controlled comparison: teams that
 * keep their roster are not a random sample of teams.
 *
 * Split out from the study only to keep each file inside the repository's file
 * size guidance; the helpers it needs are passed in rather than re-imported, so
 * the two modules stay acyclic.
 */

export function runDiagnostics(rows, helpers) {
  const { mean, sd, standardise, ridgeFit, rawFeature, family, isDefense,
    METRICS, HORIZONS, SHIPPED_K, RECENCY_WEIGHT, TARGET_SEASONS, OFFENSE_CHANGE, DEFENSE_CHANGE } = helpers;

  const correlation = (xs, ys) => {
  const mx = mean(xs);
  const my = mean(ys);
  const spread = sd(xs) * sd(ys);
  return spread > 0 ? mean(xs.map((x, i) => (x - mx) * (ys[i] - my))) / spread : 0;
};

/**
 * Descriptive, in-sample and pooled over all four transitions: does the value
 * of past performance actually depend on continuity? These are correlations,
 * not causal effects, and they are not the basis of any model selection above.
 */
const diagnostics = () => {
  const groups = {
    "off.epaPerPlay": "offReturn", "off.passSuccessRate": "offReturn",
    "def.epaPerPlayAllowed": "defReturn", "def.passSuccessRateAllowed": "defReturn",
  };
  console.log(`

################ DIAGNOSTICS (descriptive, pooled, in-sample) ################`);
  for (const horizon of ["weeks1-4", "full-season"]) {
    console.log(`
--- persistence of past performance by continuity, target ${horizon} ---`);
    for (const [metric, share] of Object.entries(groups)) {
      const usable = rows.filter((row) => Number.isFinite(row.offseason[share]));
      const sorted = [...usable].sort((a, b) => a.offseason[share] - b.offseason[share]);
      const cut = Math.floor(sorted.length / 3);
      const bands = { "low continuity": sorted.slice(0, cut), "high continuity": sorted.slice(-cut) };
      const line = Object.entries(bands).map(([label, band]) => {
        const y = band.map((row) => row.actual[horizon][metric]);
        return `${label}: r(Y-1)=${correlation(band.map((row) => row.history.prior[metric]), y).toFixed(2)}`
          + ` r(Y-2)=${correlation(band.map((row) => row.history.twoBack[metric]), y).toFixed(2)}`;
      }).join("   ");
      console.log(`  ${metric.padEnd(28)} ${line}   (n=${cut} per band)`);
    }
    console.log(`
--- offensive persistence by quarterback continuity, target ${horizon} ---`);
    for (const metric of ["off.epaPerPlay", "off.epaPerPass", "off.passSuccessRate", "off.epaPerRush"]) {
      const line = [["same QB", 0], ["new QB", 1]].map(([label, flag]) => {
        const band = rows.filter((row) => row.offseason.qbChange === flag);
        const y = band.map((row) => row.actual[horizon][metric]);
        return `${label} (n=${band.length}): r(Y-1)=${correlation(band.map((row) => row.history.prior[metric]), y).toFixed(2)}`
          + ` r(Y-2)=${correlation(band.map((row) => row.history.twoBack[metric]), y).toFixed(2)}`;
      }).join("   ");
      console.log(`  ${metric.padEnd(24)} ${line}`);
    }
  }
  console.log(`
--- incremental signal: correlation of each offseason feature with the shipped baseline's residual ---`);
  for (const horizon of ["weeks1-4", "full-season"]) {
    for (const metric of ["off.epaPerPlay", "off.passSuccessRate", "def.epaPerPlayAllowed", "def.passSuccessRateAllowed"]) {
      const anchors = new Map(TARGET_SEASONS.map((season) => {
        const group = rows.filter((row) => row.season === season);
        const blended = group.map((row) =>
          RECENCY_WEIGHT * row.history.prior[metric] + (1 - RECENCY_WEIGHT) * row.history.twoBack[metric]);
        return [season, { mu: mean(group.map((row) => row.history.prior[metric])), centre: mean(blended) }];
      }));
      const residual = rows.map((row) => {
        const { mu, centre } = anchors.get(row.season);
        const own = RECENCY_WEIGHT * row.history.prior[metric] + (1 - RECENCY_WEIGHT) * row.history.twoBack[metric];
        return row.actual[horizon][metric] - (mu + SHIPPED_K[family(metric)] * (own - centre));
      });
      const names = isDefense(metric)
        ? ["hcChange", "defReturn", "dlReturn", "dbReturn"]
        : ["qbChange", "qbEpaDelta", "qbUnknown", "hcChange", "offReturn", "olReturn", "skillReturn"];
      const line = names.map((name) =>
        `${name}=${correlation(rows.map((row) => rawFeature(row, metric, name)), residual).toFixed(2)}`).join("  ");
      console.log(`  [${horizon}] ${metric.padEnd(28)} ${line}`);
    }
  }
}

/**
 * The generous ceiling: fit the offseason block to the shipped baseline's
 * residual in sample, on all 128 rows, with no penalty at all. Whatever it
 * explains here is an upper bound on what any honest out-of-sample roster-aware
 * model could recover, because nothing out of sample can beat a free in-sample
 * fit on the same features.
 */
const ceilingCheck = () => {
  console.log(`
--- generous ceiling: in-sample R2 of the offseason block on the shipped baseline's residual (n=${rows.length}, no regularisation) ---`);
  for (const horizon of HORIZONS) {
    for (const metric of Object.keys(METRICS)) {
      const anchors = new Map(TARGET_SEASONS.map((season) => {
        const group = rows.filter((row) => row.season === season);
        const blended = group.map((row) =>
          RECENCY_WEIGHT * row.history.prior[metric] + (1 - RECENCY_WEIGHT) * row.history.twoBack[metric]);
        return [season, { mu: mean(group.map((row) => row.history.prior[metric])), centre: mean(blended) }];
      }));
      const residual = rows.map((row) => {
        const { mu, centre } = anchors.get(row.season);
        const own = RECENCY_WEIGHT * row.history.prior[metric] + (1 - RECENCY_WEIGHT) * row.history.twoBack[metric];
        return row.actual[horizon][metric] - (mu + SHIPPED_K[family(metric)] * (own - centre));
      });
      const names = isDefense(metric) ? DEFENSE_CHANGE : OFFENSE_CHANGE;
      const values = standardise(rows, metric, names);
      const X = rows.map((row) => names.map((name) => values.get(`${row.season}|${row.team}|${name}`)));
      const centre = mean(residual);
      const y = residual.map((value) => value - centre);
      const beta = ridgeFit(X, y, 1e-8);
      const fitted = X.map((features) => features.reduce((total, value, i) => total + value * beta[i], 0));
      const ssr = mean(y.map((value, i) => (value - fitted[i]) ** 2));
      const sst = mean(y.map((value) => value ** 2));
      const r2 = 1 - ssr / sst;
      const adjusted = 1 - (1 - r2) * (rows.length - 1) / (rows.length - names.length - 1);
      console.log(`  [${horizon.padEnd(11)}] ${metric.padEnd(28)} R2=${(100 * r2).toFixed(1)}%  adjusted=${(100 * adjusted).toFixed(1)}%  (${names.length} features)`);
    }
  }
}

  diagnostics();
  ceilingCheck();
}
