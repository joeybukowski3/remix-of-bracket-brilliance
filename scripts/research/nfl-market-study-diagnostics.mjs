/**
 * Calibration, incremental-value and stability diagnostics for
 * nfl-market-vs-jkb-study.mjs.
 *
 * Calibration and season stability are computed on out-of-sample predictions.
 * The incremental-value and roster sections are in-sample and pooled: they
 * describe association after controlling for the closing spread, and they
 * select no model and tune no parameter. Correlation here is not causation, and
 * "adds information beyond Vegas" means only that a coefficient is non-zero in
 * a pooled fit, not that the market is wrong about it.
 *
 * Split out from the study to keep each file inside the repository's file size
 * guidance; helpers arrive as arguments so the two modules stay acyclic.
 */

export function runMarketDiagnostics(rows, evaluations, helpers) {
  const { mean, sd, score, ridgeFit, ALL_FEATURES, JKB_FEATURES, DEF_RECENCY, TEST_SEASONS, HORIZONS, report } = helpers;

  const correlation = (xs, ys) => {
    const mx = mean(xs);
    const my = mean(ys);
    const spread = sd(xs) * sd(ys);
    return spread > 0 ? mean(xs.map((x, i) => (x - mx) * (ys[i] - my))) / spread : 0;
  };

  // ---------------------------------------------------------------- calibration
  console.log(`\n\n######## edge calibration (out of sample, test seasons, full season) ########`);
  console.log("  A slope of 1 means a predicted edge of E points is worth E points of market error.");
  for (const id of ["MARKET+JKB", "MARKET+JKB+DEFREC"]) {
    const entries = evaluations.get(id).predictions;
    const x = entries.map((entry) => entry.edge);
    const y = entries.map((entry) => entry.row.homeMargin - entry.row.spread);
    const mx = mean(x);
    const my = mean(y);
    const slope = mean(x.map((value, i) => (value - mx) * (y[i] - my))) / (sd(x) ** 2 || 1);
    console.log(`\n  -- ${id} -- predicted-edge sd=${sd(x).toFixed(2)} pts, regression slope=${slope.toFixed(3)}`
      + `, implied shrinkage to calibrate=${slope > 0 ? `x${slope.toFixed(2)}` : "n/a (no usable signal)"}`);
    report.calibration ??= {};
    report.calibration[id] = { slope, edgeSd: sd(x), bins: [] };
    console.log("     predicted edge bin    games   mean predicted   mean realised market error");
    for (const [low, high] of [[-99, -3], [-3, -2], [-2, -1], [-1, 1], [1, 2], [2, 3], [3, 99]]) {
      const bin = entries.filter((entry) => entry.edge >= low && entry.edge < high);
      if (bin.length === 0) continue;
      const predicted = mean(bin.map((entry) => entry.edge));
      const realised = mean(bin.map((entry) => entry.row.homeMargin - entry.row.spread));
      report.calibration[id].bins.push({ low, high, n: bin.length, predicted, realised });
      console.log(`     [${String(low).padStart(3)}, ${String(high).padStart(3)})`.padEnd(24)
        + `${String(bin.length).padStart(5)}   ${predicted.toFixed(2).padStart(12)}   ${realised.toFixed(2).padStart(24)}`);
    }
  }

  // ------------------------------------------------- incremental value vs Vegas
  console.log(`\n\n######## feature value: football signal vs information beyond the closing spread ########`);
  console.log("  r(feature, margin)     does it track the actual result at all?");
  console.log("  r(feature, spread)     is the market already using it?");
  console.log("  r(feature, error)      does anything survive after the spread? (this is the column that matters)");
  const marketError = rows.map((row) => row.homeMargin - row.spread);
  const margins = rows.map((row) => row.homeMargin);
  const spreads = rows.map((row) => row.spread);
  report.incremental = {};
  const early = rows.map((row) => row.week <= 6);
  for (const name of [...JKB_FEATURES, ...Object.keys(DEF_RECENCY)]) {
    const values = rows.map((row) => ALL_FEATURES[name](row));
    const rMargin = correlation(values, margins);
    const rSpread = correlation(values, spreads);
    const rError = correlation(values, marketError);
    const earlyValues = values.filter((_, i) => early[i]);
    const rErrorEarly = correlation(earlyValues, marketError.filter((_, i) => early[i]));
    report.incremental[name] = { rMargin, rSpread, rError, rErrorEarly };
    const verdict = Math.abs(rError) >= 0.06 ? "C: tracks market error"
      : Math.abs(rMargin) >= 0.15 ? "B: real football signal, already priced"
        : "no usable signal";
    console.log(`  ${name.padEnd(24)} r(margin)=${rMargin.toFixed(3).padStart(6)}  r(spread)=${rSpread.toFixed(3).padStart(6)}`
      + `  r(error)=${rError.toFixed(3).padStart(6)}  r(error, wk<=6)=${rErrorEarly.toFixed(3).padStart(6)}   ${verdict}`);
  }

  // ------------------------------------------- roster features, diagnostic only
  if (helpers.rosterFeatures) {
    console.log(`\n######## roster/coaching variables vs market error (diagnostic only) ########`);
    report.roster = {};
    for (const [name, accessor] of Object.entries(helpers.rosterFeatures)) {
      const values = rows.map(accessor);
      const usableIndices = values.map((value, i) => (Number.isFinite(value) ? i : -1)).filter((i) => i >= 0);
      const usable = usableIndices.length;
      const rError = correlation(usableIndices.map((i) => values[i]), usableIndices.map((i) => marketError[i]));
      const earlyIndices = usableIndices.filter((i) => early[i]);
      const rErrorEarly = correlation(earlyIndices.map((i) => values[i]), earlyIndices.map((i) => marketError[i]));
      report.roster[name] = { rError, rErrorEarly, usable };
      console.log(`  ${name.padEnd(24)} coverage ${usable}/${values.length}  r(error)=${rError.toFixed(3).padStart(6)}`
        + `  r(error, wk<=6)=${rErrorEarly.toFixed(3).padStart(6)}`);
    }
  }

  // --------------------------------------------- isolated defensive recency test
  console.log(`\n\n######## isolated defensive final-eight test, after controlling for Vegas ########`);
  console.log("  Does the one repeated football-prediction signal survive the market?");
  for (const [label, maxWeek] of HORIZONS) {
    if (!["weeks1-4", "weeks1-6", "full-season"].includes(label)) continue;
    const base = evaluations.get("MARKET+JKB").predictions.filter((entry) => entry.row.week <= maxWeek);
    const withDef = evaluations.get("MARKET+JKB+DEFREC").predictions.filter((entry) => entry.row.week <= maxWeek);
    const baseScore = score(base.map((entry) => [entry.predicted, entry.row.homeMargin]));
    const defScore = score(withDef.map((entry) => [entry.predicted, entry.row.homeMargin]));
    const delta = 100 * (1 - defScore.rmse / baseScore.rmse);
    console.log(`  ${label.padEnd(13)} n=${String(baseScore.n).padStart(4)}  MARKET+JKB RMSE=${baseScore.rmse.toFixed(3)}`
      + `  +DEFREC RMSE=${defScore.rmse.toFixed(3)}  delta ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}%`);
  }
  const defOnly = Object.keys(DEF_RECENCY).map((name) => {
    const values = rows.filter((row) => row.week <= 6).map((row) => ALL_FEATURES[name](row));
    const errors = rows.filter((row) => row.week <= 6).map((row) => row.homeMargin - row.spread);
    return `${name} r(error, wk<=6)=${correlation(values, errors).toFixed(3)}`;
  }).join("   ");
  console.log(`  ${defOnly}`);

  // ------------------------------------------------------------ season stability
  console.log(`\n\n######## season-by-season stability (out of sample) ########`);
  report.seasons = {};
  for (const id of ["MARKET", "MARKET+JKB", "MARKET+JKB+DEFREC"]) {
    const line = TEST_SEASONS.map((season) => {
      const entries = evaluations.get(id).predictions.filter((entry) => entry.row.season === season);
      const value = score(entries.map((entry) => [entry.predicted, entry.row.homeMargin]));
      const marketValue = score(evaluations.get("MARKET").predictions
        .filter((entry) => entry.row.season === season).map((entry) => [entry.predicted, entry.row.homeMargin]));
      let wins = 0;
      let losses = 0;
      for (const entry of entries) {
        const error = entry.row.homeMargin - entry.row.spread;
        if (error === 0 || Math.abs(entry.edge) < 1) continue;
        if (Math.sign(error) === Math.sign(entry.edge)) wins += 1; else losses += 1;
      }
      (report.seasons[id] ??= {})[season] = { rmse: value.rmse, wins, losses };
      return `${season}: RMSE=${value.rmse.toFixed(3)} (${(100 * (1 - value.rmse / marketValue.rmse) >= 0 ? "+" : "")}`
        + `${(100 * (1 - value.rmse / marketValue.rmse)).toFixed(2)}%) ATS(|edge|>=1) ${wins}-${losses}`;
    }).join("   ");
    console.log(`  ${id.padEnd(20)} ${line}`);
  }
}
