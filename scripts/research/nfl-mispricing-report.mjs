/**
 * Reporting for the market-mispricing search.
 *
 * Discovery ranks candidates and applies false-discovery control; confirmation
 * re-tests survivors on seasons that discovery never saw. Segment, consensus
 * and key-number sections are descriptive and select nothing.
 */

const WEEK_BANDS = [["weeks1-6", (game) => game.week <= 6], ["weeks7+", (game) => game.week > 6]];

export function reportMispricing({ ranked, holdoutFor, discovery, holdout, games, discoveryGames, holdoutGames, report, helpers }) {
  const { mean, median, segmentStats, wilson, bootstrapMeanCi, correlation, DISCOVERY, HOLDOUT,
    differentialNames, conditionNames } = helpers;

  console.log("\n=== dataset ===");
  console.log(`  seasons ${DISCOVERY[0]}-${HOLDOUT.at(-1)}, ${games.length} games with a settled line and both priors`);
  console.log(`  DISCOVERY ${DISCOVERY[0]}-${DISCOVERY.at(-1)}: ${discoveryGames.length} games`);
  console.log(`  HOLDOUT   ${HOLDOUT[0]}-${HOLDOUT.at(-1)}: ${holdoutGames.length} games (never used for discovery)`);
  const errors = games.map((game) => game.marketError);
  console.log(`  market error: mean ${mean(errors).toFixed(3)}, sd ${helpers.sd(errors).toFixed(3)}`
    + `  (the market is close to unbiased, so any signal must beat that)`);
  console.log(`  hypotheses tested: ${differentialNames.length} continuous differentials`
    + ` + ${conditionNames.length} signed conditions = ${differentialNames.length + conditionNames.length}`);

  // -------------------------------------------------------------- discovery
  console.log(`\n\n######## DISCOVERY (${DISCOVERY[0]}-${DISCOVERY.at(-1)}), ranked by p-value ########`);
  console.log("  Benjamini-Hochberg at q=0.10. 'r' is partial correlation with market error after");
  console.log("  projecting out the spread; for conditions the statistic is mean market error in the backed direction.\n");
  console.log("  rank  hypothesis                      kind      n     statistic   p        BH crit   survives");
  ranked.forEach((entry, index) => {
    if (index >= 20) return;
    const statistic = entry.kind === "differential" ? `r=${entry.r.toFixed(3)}` : `${entry.mean.toFixed(2)} pts`;
    console.log(`  ${String(index + 1).padStart(4)}  ${entry.name.padEnd(30)} ${entry.kind.padEnd(12)}`
      + `${String(entry.n).padStart(5)}  ${statistic.padEnd(11)} ${entry.p.toFixed(4)}   ${entry.bhCritical.toFixed(4)}    `
      + `${entry.survivesFdr ? "YES" : "no"}`);
  });
  const survivors = ranked.filter((entry) => entry.survivesFdr);
  console.log(`\n  ${survivors.length} of ${ranked.length} hypotheses survive FDR control at q=0.10.`);
  report.discovery = ranked.map((entry) => ({ ...entry }));

  // ----------------------------------------------------------- confirmation
  console.log(`\n\n######## CONFIRMATION on ${HOLDOUT[0]}-${HOLDOUT.at(-1)} (untouched) ########`);
  console.log("  Same definition, same thresholds, no re-tuning. A sign flip means the discovery result was noise.\n");
  const top = ranked.slice(0, 10);
  console.log("  hypothesis                      discovery                holdout                  verdict");
  report.confirmation = [];
  for (const entry of top) {
    const out = holdoutFor(entry);
    const dStat = entry.kind === "differential" ? entry.r : entry.mean;
    const hStat = entry.kind === "differential" ? out.r : out.mean;
    const sameSign = Math.sign(dStat) === Math.sign(hStat) && hStat !== 0;
    const holdoutSignificant = out.p < 0.05;
    const verdict = !entry.survivesFdr ? "not discovered (FDR)"
      : sameSign && holdoutSignificant ? "CONFIRMED"
        : sameSign ? "same sign, not significant" : "FAILS (sign flip)";
    const fmt = (kind, stat, n, p) => (kind === "differential"
      ? `r=${stat.toFixed(3)} n=${String(n).padStart(4)} p=${p.toFixed(3)}`
      : `${stat.toFixed(2)}pts n=${String(n).padStart(4)} p=${p.toFixed(3)}`);
    report.confirmation.push({ name: entry.name, kind: entry.kind, discovery: dStat, holdout: hStat,
      holdoutN: out.n, holdoutP: out.p, survivesFdr: entry.survivesFdr, verdict,
      permutationP: entry.permutationP ?? null });
    console.log(`  ${entry.name.padEnd(30)} ${fmt(entry.kind, dStat, entry.n, entry.p).padEnd(24)}`
      + ` ${fmt(entry.kind, hStat, out.n, out.p).padEnd(24)} ${verdict}`);
  }
  const placebo = survivors.filter((entry) => entry.permutationP !== undefined);
  if (placebo.length) {
    console.log(`\n  placebo (market error shuffled within season, 1000 draws):`);
    for (const entry of placebo) {
      console.log(`    ${entry.name.padEnd(30)} permutation p=${entry.permutationP.toFixed(4)}`
        + `${entry.permutationP > 0.05 ? "   <- indistinguishable from a shuffle" : ""}`);
    }
  }

  // ---------------------------------------------- answers to the named questions
  console.log(`\n\n######## the ten specific questions, full sample ########`);
  const askDifferential = (label, name) => {
    const usable = [...discovery, ...holdout].filter((row) => Number.isFinite(row.differentials[name]));
    if (usable.length < 50) { console.log(`  ${label.padEnd(58)} data insufficient`); return; }
    const values = usable.map((row) => row.differentials[name]);
    const stats = helpers.partialCorrelation(values, usable.map((row) => row.game.marketError),
      usable.map((row) => row.game.spread));
    const rMargin = correlation(values, usable.map((row) => row.game.homeMargin));
    const rSpread = correlation(values, usable.map((row) => row.game.spread));
    console.log(`  ${label.padEnd(58)} r(margin)=${rMargin.toFixed(3).padStart(6)}`
      + ` r(spread)=${rSpread.toFixed(3).padStart(6)} partial r(error)=${stats.r.toFixed(3).padStart(6)} p=${stats.p.toFixed(3)}`);
  };
  const askCondition = (label, name) => {
    const rows = [...discovery, ...holdout];
    const stats = segmentStats(rows.map((row) => row.conditions[name]), rows.map((row) => row.game.marketError));
    if (stats.n < 30) { console.log(`  ${label.padEnd(58)} n=${stats.n} too small`); return; }
    console.log(`  ${label.padEnd(58)} n=${String(stats.n).padStart(5)} mean=${stats.mean.toFixed(2).padStart(6)} pts`
      + ` [${stats.ci[0].toFixed(2)}, ${stats.ci[1].toFixed(2)}] ATS ${stats.wins}-${stats.losses}-${stats.pushes}`
      + ` ${(100 * stats.cover).toFixed(1)}% p=${stats.p.toFixed(3)}`);
  };
  console.log("  A. Vegas overreacts to W-L vs EPA?");
  askDifferential("     recordMinusEpa (record better than efficiency)", "recordMinusEpa");
  askCondition("     back good-EPA/bad-record team", "backGoodEpaBadRecord");
  askCondition("     fade bad-EPA/good-record team", "fadeBadEpaGoodRecord");
  console.log("  B. Vegas mis-weights recent efficiency?");
  askDifferential("     last5 minus season EPA", "last5MinusSeasonEpa");
  askDifferential("     prior final-8 minus prior full", "y1Last8MinusFull");
  console.log("  C/D. Are pass mismatches priced differently from rush?");
  askDifferential("     pass EPA mismatch", "passMismatch");
  askDifferential("     rush EPA mismatch", "rushMismatch");
  askDifferential("     pass success mismatch", "passSuccMismatch");
  askDifferential("     rush success mismatch", "rushSuccMismatch");
  console.log("  E. Do regression indicators predict market error?");
  askDifferential("     turnover margin differential", "turnoverMarginDiff");
  askCondition("     back turnover-unlucky team", "backTurnoverUnlucky");
  askCondition("     fade turnover-lucky team", "fadeTurnoverLucky");
  askCondition("     fade close-game-lucky team", "fadeCloseGameLucky");
  askCondition("     fade red-zone-lucky team", "fadeRedZoneLucky");
  console.log("  F/G. Underlying quality vs record:");
  askCondition("     back cold-record/hot-EPA team", "backColdRecordHotEpa");
  askCondition("     fade hot-record/cold-EPA team", "fadeHotRecordColdEpa");
  console.log("  I. Favourite/underdog bias after conditioning on quality:");
  askCondition("     back short dog (|spread| <= 3)", "backShortDog");
  askCondition("     back large dog (|spread| >= 10)", "backLargeDog");
  askCondition("     back dog that JKB rates better", "backDogWithBetterEpa");

  // --------------------------------------------------- J: early-season split
  console.log(`\n\n######## J. is anything concentrated in Weeks 1-6? ########`);
  console.log("  hypothesis                      band        n      mean pts   [95% CI]          ATS      cover%");
  const bandCandidates = ["backGoodEpaBadRecord", "fadeBadEpaGoodRecord", "backTurnoverUnlucky",
    "fadeCloseGameLucky", "backShortDog", "backLargeDog", "backDogWithBetterEpa", "backPriorAboveCurrent",
    "backHomeVsShortWeekRoad", "backTeamOffBye"];
  report.weekBands = {};
  for (const name of bandCandidates) {
    for (const [label, test] of WEEK_BANDS) {
      const rows = [...discovery, ...holdout].filter((row) => test(row.game));
      const stats = segmentStats(rows.map((row) => row.conditions[name]), rows.map((row) => row.game.marketError));
      if (stats.n < 40) continue;
      (report.weekBands[name] ??= {})[label] = stats;
      console.log(`  ${name.padEnd(30)} ${label.padEnd(11)} ${String(stats.n).padStart(5)}  `
        + `${stats.mean.toFixed(2).padStart(8)}   [${stats.ci[0].toFixed(2)}, ${stats.ci[1].toFixed(2)}]`.padEnd(19)
        + `  ${`${stats.wins}-${stats.losses}-${stats.pushes}`.padEnd(12)} ${(100 * stats.cover).toFixed(1)}%`);
    }
  }

  // ------------- the single strongest cell, split across the temporal divide
  console.log(`

######## strongest week-band cell, discovery vs holdout ########`);
  console.log("  The full-sample number for a conditional cell is meaningless if discovery drove it.");
  console.log("  hypothesis                      band       split       n     mean pts   [95% CI]           ATS        cover%");
  report.cellSplit = {};
  for (const name of ["backShortDog", "backPriorAboveCurrent", "backTurnoverUnlucky"]) {
    for (const [label, test] of WEEK_BANDS) {
      for (const [splitName, rows] of [["discovery", discovery], ["HOLDOUT", holdout]]) {
        const subset = rows.filter((row) => test(row.game));
        const stats = segmentStats(subset.map((row) => row.conditions[name]), subset.map((row) => row.game.marketError));
        if (stats.n < 30) continue;
        (report.cellSplit[`${name}|${label}`] ??= {})[splitName] = stats;
        console.log(`  ${name.padEnd(30)} ${label.padEnd(10)} ${splitName.padEnd(11)} ${String(stats.n).padStart(4)}  `
          + `${stats.mean.toFixed(2).padStart(8)}   [${stats.ci[0].toFixed(2)}, ${stats.ci[1].toFixed(2)}]`.padEnd(20)
          + `  ${`${stats.wins}-${stats.losses}-${stats.pushes}`.padEnd(12)} ${(100 * stats.cover).toFixed(1)}%`);
      }
    }
  }

  // --------------------------------------------------------- consensus count
  console.log(`\n\n######## consensus: does agreement among independent signals help? ########`);
  console.log("  Unweighted count of four independent quality signals favouring one side.");
  console.log("  agreeing  n       mean market error toward that side   [bootstrap 95% CI]     ATS       cover%");
  report.consensus = {};
  for (const level of [1, 2, 3, 4]) {
    const picked = [];
    for (const row of [...discovery, ...holdout]) {
      const signals = row.consensus;
      if (signals.length < 4) continue;
      const total = signals.reduce((sum, value) => sum + value, 0);
      if (Math.abs(total) !== level) continue;
      picked.push(Math.sign(total) * row.game.marketError);
    }
    if (picked.length < 30) continue;
    const wins = picked.filter((value) => value > 0).length;
    const losses = picked.filter((value) => value < 0).length;
    const ci = bootstrapMeanCi(picked);
    report.consensus[level] = { n: picked.length, mean: mean(picked), wins, losses };
    console.log(`  ${String(level).padEnd(9)} ${String(picked.length).padStart(5)}   ${mean(picked).toFixed(3).padStart(10)}`
      + `                        [${ci[0].toFixed(2)}, ${ci[1].toFixed(2)}]`.padEnd(24)
      + `  ${`${wins}-${losses}`.padEnd(9)} ${(100 * wins / Math.max(1, wins + losses)).toFixed(1)}%`);
  }

  // --------------------------------------------------------- key numbers
  console.log(`\n\n######## key numbers: is a modelled point worth the same everywhere? ########`);
  console.log("  Distribution of actual margins around the common key numbers, full sample.");
  const margins = games.map((game) => game.homeMargin);
  for (const key of [3, 7, 10, 6, 4]) {
    const exact = margins.filter((value) => Math.abs(value) === key).length;
    console.log(`    margin of exactly ${String(key).padStart(2)}: ${String(exact).padStart(4)} of ${margins.length}`
      + ` = ${(100 * exact / margins.length).toFixed(2)}%`);
  }
  console.log("  spread bucket   n     mean market error   ATS home cover%");
  report.keyNumbers = {};
  for (const [label, test] of [["|spread| < 2.5", (s) => Math.abs(s) < 2.5],
    ["2.5-3.5 (key 3)", (s) => Math.abs(s) >= 2.5 && Math.abs(s) <= 3.5],
    ["3.5-6.5", (s) => Math.abs(s) > 3.5 && Math.abs(s) < 6.5],
    ["6.5-7.5 (key 7)", (s) => Math.abs(s) >= 6.5 && Math.abs(s) <= 7.5],
    ["> 7.5", (s) => Math.abs(s) > 7.5]]) {
    const subset = games.filter((game) => test(game.spread));
    if (subset.length < 30) continue;
    const wins = subset.filter((game) => game.marketError > 0).length;
    const losses = subset.filter((game) => game.marketError < 0).length;
    report.keyNumbers[label] = { n: subset.length, mean: mean(subset.map((game) => game.marketError)), wins, losses };
    console.log(`  ${label.padEnd(16)}${String(subset.length).padStart(5)}   `
      + `${mean(subset.map((game) => game.marketError)).toFixed(3).padStart(10)}        `
      + `${(100 * wins / Math.max(1, wins + losses)).toFixed(1)}%`);
  }

  // ------------------------------------------- full ledger of every hypothesis
  console.log(`\n\n######## full ledger: every hypothesis tested, holdout included ########`);
  console.log("  Negative results are the point here - these are the angles that do NOT work.\n");
  console.log("  hypothesis                      kind         disc n   disc stat   hold n   hold stat   class");
  report.ledger = [];
  for (const entry of ranked) {
    const out = holdoutFor(entry);
    const dStat = entry.kind === "differential" ? entry.r : entry.mean;
    const hStat = entry.kind === "differential" ? out.r : out.mean;
    const sameSign = Math.sign(dStat) === Math.sign(hStat) && hStat !== 0;
    let klass;
    if (out.n < 100 && entry.kind === "condition") klass = "E (thin sample)";
    else if (entry.survivesFdr && sameSign && out.p < 0.05) klass = "A/B (survives both)";
    else if (entry.survivesFdr && sameSign) klass = "B (discovery only, right sign)";
    else if (entry.survivesFdr) klass = "D (sign flip on holdout)";
    else if (Math.abs(entry.rMargin ?? 0) >= 0.15) klass = "C (predicts football, priced)";
    else klass = "D (no signal)";
    report.ledger.push({ name: entry.name, kind: entry.kind, discoveryN: entry.n, discoveryStat: dStat,
      holdoutN: out.n, holdoutStat: hStat, holdoutP: out.p, klass });
    console.log(`  ${entry.name.padEnd(30)} ${entry.kind.padEnd(12)} ${String(entry.n).padStart(6)}   `
      + `${dStat.toFixed(3).padStart(9)}   ${String(out.n).padStart(6)}   ${hStat.toFixed(3).padStart(9)}   ${klass}`);
  }
}
