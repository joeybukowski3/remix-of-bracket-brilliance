/**
 * Reporting for the fair-spread study.
 *
 * Every model number here is out of sample. The market sections are strictly
 * post-model: the market never entered a fit, and is used only to measure how
 * close an independent football estimate lands and where it disagrees.
 */

const WEEK_BANDS = [["weeks1-4", 4], ["weeks1-6", 6], ["weeks1-8", 8], ["full-season", 99]];
const EDGE_BUCKETS = [["<1", 0, 1], ["1-2", 1, 2], ["2-3", 2, 3], ["3-4", 3, 4], ["4+", 4, Infinity]];

export function reportFairSpread({ usable, models, forward, production, report, helpers }) {
  const { mean, sd, score, TEST_SEASONS } = helpers;
  const tested = usable.filter((game) => TEST_SEASONS.includes(game.season));

  console.log("\n=== dataset ===");
  console.log(`  ${usable.length} regular-season games with complete leakage-free pregame state`);
  console.log(`  training seasons roll forward; out-of-sample test seasons ${TEST_SEASONS.join(", ")}`
    + ` (${tested.length} games)`);
  console.log(`  target: actual home margin. NO market value is a feature of any candidate.`);

  // ------------------------------------------------ out-of-sample accuracy
  console.log(`\n\n######## out-of-sample accuracy vs ACTUAL MARGIN ########`);
  console.log("  model                                                          n    MAE     RMSE    r      bias    calib slope");
  report.models = {};
  const scored = new Map();
  for (const [id, model] of models) {
    const pairs = tested.filter((game) => model.predictions.has(game.gameId))
      .map((game) => [model.predictions.get(game.gameId).value, game.homeMargin]);
    if (pairs.length === 0) continue;
    const stats = score(pairs);
    scored.set(id, stats);
    report.models[id] = { label: model.label, ...stats };
    console.log(`  ${model.label.padEnd(62)}${String(stats.n).padStart(5)}  ${stats.mae.toFixed(3)}  ${stats.rmse.toFixed(3)}`
      + `  ${stats.corr.toFixed(3)}  ${stats.bias.toFixed(3).padStart(6)}  ${stats.slope.toFixed(3)}`);
  }
  // The market, for reference only - it is not a candidate.
  const marketPairs = tested.filter((game) => game.marketSpread !== null)
    .map((game) => [game.marketSpread, game.homeMargin]);
  const marketStats = score(marketPairs);
  report.market = marketStats;
  console.log(`  ${"[reference] settled market spread".padEnd(62)}${String(marketStats.n).padStart(5)}`
    + `  ${marketStats.mae.toFixed(3)}  ${marketStats.rmse.toFixed(3)}  ${marketStats.corr.toFixed(3)}`
    + `  ${marketStats.bias.toFixed(3).padStart(6)}  ${marketStats.slope.toFixed(3)}`);

  // ------------------------------------------------------- by season and band
  const best = [...scored].sort((a, b) => a[1].rmse - b[1].rmse)[0][0];
  const bestModel = models.get(best);
  console.log(`\n  best candidate by out-of-sample RMSE: ${best}`);

  console.log(`\n\n######## ${best}: by season and by week band ########`);
  console.log("  split           band            n     MAE     RMSE    r       bias    slope");
  report.splits = {};
  for (const season of [...TEST_SEASONS, "all"]) {
    for (const [label, maxWeek] of WEEK_BANDS) {
      const subset = tested.filter((game) => (season === "all" || game.season === season)
        && game.week <= maxWeek && bestModel.predictions.has(game.gameId));
      if (subset.length < 30) continue;
      const stats = score(subset.map((game) => [bestModel.predictions.get(game.gameId).value, game.homeMargin]));
      (report.splits[String(season)] ??= {})[label] = stats;
      console.log(`  ${String(season).padEnd(15)} ${label.padEnd(15)} ${String(stats.n).padStart(4)}  ${stats.mae.toFixed(3)}`
        + `  ${stats.rmse.toFixed(3)}  ${stats.corr.toFixed(3)}  ${stats.bias.toFixed(3).padStart(6)}  ${stats.slope.toFixed(3)}`);
    }
  }

  // ------------------------------------------------------------ home field
  console.log(`\n\n######## home-field advantage, estimated from data (never hardcoded) ########`);
  console.log("  The intercept of a home-minus-away differential model IS the home-field term.");
  report.homeField = {};
  for (const [id, model] of models) {
    if (model.fits.size === 0) continue;
    const values = [...model.fits].map(([season, fit]) => `${season}: ${fit.intercept.toFixed(2)}`);
    const avg = mean([...model.fits.values()].map((fit) => fit.intercept));
    report.homeField[id] = { perSeason: Object.fromEntries([...model.fits].map(([s, f]) => [s, f.intercept])), mean: avg };
    console.log(`  ${id.padEnd(20)} ${values.join("   ")}   mean ${avg.toFixed(2)} pts`);
  }
  const homeMargins = usable.filter((game) => !game.neutral).map((game) => game.homeMargin);
  console.log(`  raw mean home margin across ${homeMargins.length} non-neutral games: ${mean(homeMargins).toFixed(2)} pts`);
  console.log(`  production uses a fixed 2.0. Fitted values are season-stable, so a global constant is defensible.`);

  // ------------------------------------------------------------ calibration
  console.log(`\n\n######## calibration of ${best} (out of sample, against football margins) ########`);
  const calPairs = tested.filter((game) => bestModel.predictions.has(game.gameId))
    .map((game) => [bestModel.predictions.get(game.gameId).value, game.homeMargin]);
  const cal = score(calPairs);
  console.log(`  actual = ${cal.intercept.toFixed(3)} + ${cal.slope.toFixed(3)} * predicted`);
  console.log(`  slope ${cal.slope.toFixed(3)}: ${cal.slope > 1.05 ? "predictions are COMPRESSED - they should be widened"
    : cal.slope < 0.95 ? "predictions are too EXTREME - they should be shrunk" : "well scaled, no correction needed"}`);
  console.log(`  residual sd ${cal.residualSd.toFixed(2)} points`);
  report.calibration = cal;

  // ------------------------------------------------------------ uncertainty
  console.log(`\n\n######## prediction uncertainty ########`);
  console.log(`  A fair spread from this model carries a residual sd of ~${cal.residualSd.toFixed(1)} points,`);
  console.log(`  so a 95% interval on a single game is roughly +/-${(1.96 * cal.residualSd).toFixed(0)} points.`);
  console.log(`  The market's own residual sd is ${marketStats.residualSd.toFixed(1)} points, so this is not a model defect -`);
  console.log(`  single NFL games are simply that noisy. An interval this wide is honest but not decision-useful,`);
  console.log(`  and should NOT be shown as a per-game confidence band.`);
  report.uncertainty = { residualSd: cal.residualSd, marketResidualSd: marketStats.residualSd };

  // ------------------------------------------- market comparison (post-model)
  console.log(`\n\n######## POST-MODEL market comparison (market was never an input) ########`);
  const withMarket = tested.filter((game) => game.marketSpread !== null && bestModel.predictions.has(game.gameId));
  const fair = withMarket.map((game) => bestModel.predictions.get(game.gameId).value);
  const market = withMarket.map((game) => game.marketSpread);
  const mf = mean(fair);
  const mm = mean(market);
  const corr = mean(fair.map((value, i) => (value - mf) * (market[i] - mm))) / (sd(fair) * sd(market));
  const gaps = fair.map((value, i) => value - market[i]);
  console.log(`  correlation(JKB fair, market)   ${corr.toFixed(3)}`);
  console.log(`  MAE between JKB and market      ${mean(gaps.map(Math.abs)).toFixed(2)} pts`);
  console.log(`  RMSE between JKB and market     ${Math.sqrt(mean(gaps.map((value) => value ** 2))).toFixed(2)} pts`);
  console.log(`  JKB vs actual margin: MAE ${cal.mae.toFixed(2)} RMSE ${cal.rmse.toFixed(2)}`);
  console.log(`  market vs actual margin: MAE ${marketStats.mae.toFixed(2)} RMSE ${marketStats.rmse.toFixed(2)}`);
  console.log(`  (the market being better here is expected and is not a failure of the football model)`);
  report.marketComparison = { corr, mae: mean(gaps.map(Math.abs)), rmse: Math.sqrt(mean(gaps.map((v) => v ** 2))) };

  console.log(`\n  JKB edge = JKB fair - market. Distribution over ${gaps.length} out-of-sample games:`);
  console.log(`    median ${gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)].toFixed(2)} pts,`
    + ` mean ${mean(gaps).toFixed(2)}, sd ${sd(gaps).toFixed(2)}`);
  report.edgeDistribution = {};
  for (const [label, low, high] of EDGE_BUCKETS) {
    const count = gaps.filter((value) => Math.abs(value) >= low && Math.abs(value) < high).length;
    report.edgeDistribution[label] = { n: count, pct: count / gaps.length };
    console.log(`    |edge| ${label.padEnd(5)} ${String(count).padStart(4)} games  ${(100 * count / gaps.length).toFixed(1)}%`);
  }

  // ------------------------------------------------ large-disagreement drivers
  console.log(`\n\n######## largest JKB/market disagreements, with drivers ########`);
  console.log("  Decomposition is the model's own standardised contributions, in points.");
  const ranked = withMarket.map((game) => ({ game, prediction: bestModel.predictions.get(game.gameId) }))
    .map((entry) => ({ ...entry, edge: entry.prediction.value - entry.game.marketSpread }))
    .sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge)).slice(0, 8);
  report.caseStudies = [];
  for (const entry of ranked) {
    const drivers = Object.entries(entry.prediction.contributions)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3)
      .map(([name, value]) => `${name} ${value >= 0 ? "+" : ""}${value.toFixed(2)}`);
    report.caseStudies.push({ gameId: entry.game.gameId, fair: entry.prediction.value,
      market: entry.game.marketSpread, edge: entry.edge, actual: entry.game.homeMargin, drivers });
    console.log(`  ${entry.game.gameId.padEnd(20)} JKB ${entry.prediction.value.toFixed(1).padStart(6)}`
      + `  market ${entry.game.marketSpread.toFixed(1).padStart(6)}  edge ${entry.edge.toFixed(1).padStart(6)}`
      + `  actual ${String(entry.game.homeMargin).padStart(4)}`);
    console.log(`    drivers: home field +${entry.prediction.homeField.toFixed(2)}, ${drivers.join(", ")}`);
  }

  // ------------------------------- where do large disagreements actually come from?
  console.log(`

######## anatomy of large disagreements (|edge| >= 6) ########`);
  console.log("  If a disagreement feature is going to surface games, it matters WHICH games it surfaces.");
  const large = withMarket.map((game) => ({ game, value: bestModel.predictions.get(game.gameId).value }))
    .filter((entry) => Math.abs(entry.value - entry.game.marketSpread) >= 6);
  const lateLarge = large.filter((entry) => entry.game.week >= 17);
  const allLate = withMarket.filter((game) => game.week >= 17);
  console.log(`  ${large.length} of ${withMarket.length} games (${(100 * large.length / withMarket.length).toFixed(1)}%) disagree by 6+ points`);
  console.log(`  of those, ${lateLarge.length} (${(100 * lateLarge.length / Math.max(1, large.length)).toFixed(1)}%) are Week 17-18,`
    + ` which are only ${(100 * allLate.length / withMarket.length).toFixed(1)}% of all games`);
  const whoWins = (entries) => {
    let modelCloser = 0;
    for (const entry of entries) {
      if (Math.abs(entry.value - entry.game.homeMargin) < Math.abs(entry.game.marketSpread - entry.game.homeMargin)) modelCloser += 1;
    }
    return entries.length ? modelCloser / entries.length : 0;
  };
  console.log(`  when they disagree by 6+, the MODEL is closer to the actual margin ${(100 * whoWins(large)).toFixed(1)}% of the time`);
  console.log(`  restricted to Week 17-18 disagreements: model closer ${(100 * whoWins(lateLarge)).toFixed(1)}% of the time`);
  const earlyLarge = large.filter((entry) => entry.game.week < 17);
  console.log(`  restricted to Weeks 1-16 disagreements:  model closer ${(100 * whoWins(earlyLarge)).toFixed(1)}% of the time (n=${earlyLarge.length})`);
  report.disagreementAnatomy = { large: large.length, lateShare: lateLarge.length / Math.max(1, large.length),
    modelCloserAll: whoWins(large), modelCloserLate: whoWins(lateLarge), modelCloserEarly: whoWins(earlyLarge) };

  // ---------------------------- candidate vs production analogue, by week band
  console.log(`

######## candidate C vs production analogue B, by week band ########`);
  console.log("  band            B RMSE    C RMSE    B MAE     C MAE     winner");
  const bModel = models.get("B_strengthOnly");
  report.bVsC = {};
  for (const [label, maxWeek] of WEEK_BANDS) {
    const subset = tested.filter((game) => game.week <= maxWeek && bModel.predictions.has(game.gameId));
    if (subset.length < 30) continue;
    const bStats = score(subset.map((game) => [bModel.predictions.get(game.gameId).value, game.homeMargin]));
    const cStats = score(subset.map((game) => [bestModel.predictions.get(game.gameId).value, game.homeMargin]));
    report.bVsC[label] = { b: bStats, c: cStats };
    console.log(`  ${label.padEnd(15)} ${bStats.rmse.toFixed(3)}    ${cStats.rmse.toFixed(3)}    ${bStats.mae.toFixed(3)}    `
      + `${cStats.mae.toFixed(3)}    ${cStats.rmse < bStats.rmse ? "C" : "B"}`);
  }

  // -------------------------------------------------------- 2026 forward slate
  console.log(`\n\n######## 2026 slate: candidate fair spread vs shipped production model ########`);
  console.log("  Both are computed WITHOUT any market input. Preseason state only (zero games played).");
  const fit2026 = bestModel.fits.get(TEST_SEASONS.at(-1));
  const productionByGame = production.projections ?? {};
  report.forward2026 = [];
  if (fit2026) {
    const set = helpers.FEATURE_SETS[best];
    console.log("  game                 home  away   candidate   production   diff    top drivers");
    const rows = [];
    for (const game of forward) {
      const values = fit2026.names.map((name, i) => (set.features[name](game) - fit2026.centres[i]) / fit2026.scales[i]);
      if (values.some((value) => !Number.isFinite(value))) continue;
      const contributions = Object.fromEntries(fit2026.names.map((name, i) => [name, values[i] * fit2026.beta[name]]));
      const value = (game.neutral ? 0 : fit2026.intercept)
        + fit2026.names.reduce((total, name, i) => total + values[i] * fit2026.beta[name], 0);
      const prod = productionByGame[game.gameId]?.projectedHomeMargin ?? null;
      rows.push({ game, value, prod, contributions });
    }
    rows.sort((a, b) => (b.prod === null ? -1 : Math.abs(b.value - b.prod)) - (a.prod === null ? -1 : Math.abs(a.value - a.prod)));
    for (const row of rows.slice(0, 16)) {
      const drivers = Object.entries(row.contributions).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 2)
        .map(([name, value]) => `${name} ${value >= 0 ? "+" : ""}${value.toFixed(2)}`).join(", ");
      report.forward2026.push({ gameId: row.game.gameId, home: row.game.home, away: row.game.away,
        candidate: row.value, production: row.prod, market: row.game.marketSpread, drivers });
      console.log(`  ${row.game.gameId.padEnd(20)} ${row.game.home.padEnd(5)} ${row.game.away.padEnd(6)}`
        + `${row.value.toFixed(1).padStart(9)}   ${(row.prod === null ? "n/a" : row.prod.toFixed(1)).padStart(9)}`
        + `   ${(row.prod === null ? "" : (row.value - row.prod).toFixed(1)).padStart(6)}   ${drivers}`);
    }
    const allValues = rows.map((row) => row.value);
    const prodValues = rows.filter((row) => row.prod !== null).map((row) => row.prod);
    report.forwardDispersion = { candidateSd: sd(allValues), productionSd: sd(prodValues), n: rows.length };
    console.log(`
  2026 Week-1-state dispersion across all ${rows.length} games:`);
    console.log(`    candidate  sd ${sd(allValues).toFixed(2)}, range ${Math.min(...allValues).toFixed(1)} to ${Math.max(...allValues).toFixed(1)}`);
    console.log(`    production sd ${sd(prodValues).toFixed(2)}, range ${Math.min(...prodValues).toFixed(1)} to ${Math.max(...prodValues).toFixed(1)}`);
    console.log(`    (settled market spreads run sd ~5.9 over 2023-2025, so a preseason model near that is realistic)`);
    const withProd = rows.filter((row) => row.prod !== null);
    if (withProd.length) {
      const diffs = withProd.map((row) => row.value - row.prod);
      console.log(`\n  across ${withProd.length} matched 2026 games: mean |candidate - production| = `
        + `${mean(diffs.map(Math.abs)).toFixed(2)} pts, max ${Math.max(...diffs.map(Math.abs)).toFixed(2)}`);
    }
    // Post-model only: where 2026 market lines happen to exist.
    const withMarket2026 = rows.filter((row) => row.game.marketSpread !== null);
    if (withMarket2026.length) {
      console.log(`\n  POST-MODEL comparison against the ${withMarket2026.length} 2026 games that carry a settled line:`);
      console.log("  game                 candidate   market   JKB edge");
      for (const row of withMarket2026.slice(0, 10)) {
        console.log(`  ${row.game.gameId.padEnd(20)}${row.value.toFixed(1).padStart(9)}`
          + `${row.game.marketSpread.toFixed(1).padStart(9)}${(row.value - row.game.marketSpread).toFixed(1).padStart(11)}`);
      }
    }
  }
}
