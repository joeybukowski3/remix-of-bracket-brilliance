/**
 * CLV, line-movement, ATS and feature diagnostics for
 * nfl-clv-line-movement-study.mjs.
 *
 * Every number here is out of sample: the JKB fair spread on a test season was
 * fitted only on earlier seasons. The feature section is a descriptive partial
 * correlation - the association between a JKB component and future line
 * movement after the early line has been projected out - and it selects no
 * model and tunes no parameter. Correlation is not causation.
 *
 * Buckets are fixed in advance (<1, 1-2, 2-3, 3-4, 4+) and never tuned.
 *
 * Split out from the study to keep each file inside the repository's file size
 * guidance; helpers arrive as arguments so the two modules stay acyclic.
 */

const BUCKETS = [["<1", 0, 1], ["1-2", 1, 2], ["2-3", 2, 3], ["3-4", 3, 4], ["4+", 4, Infinity]];
const WEEK_BANDS = [["weeks1-2", 2], ["weeks1-4", 4], ["weeks1-6", 6], ["weeks1-8", 8], ["full-season", 99]];

/** Wilson interval, so a 20-game bucket is not read as if it were 500. */
function wilson(wins, total) {
  if (total === 0) return [0, 0];
  const p = wins / total;
  const z = 1.96;
  const denominator = 1 + (z * z) / total;
  const centre = (p + (z * z) / (2 * total)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator;
  return [centre - half, centre + half];
}

export function reportClvDiagnostics(results, datasets, helpers) {
  const { mean, sd, score, FEATURES, FEATURE_NAMES, FEATURE_SETS, report } = helpers;

  const correlation = (xs, ys) => {
    if (xs.length < 3) return 0;
    const mx = mean(xs);
    const my = mean(ys);
    const spread = sd(xs) * sd(ys);
    return spread > 0 ? mean(xs.map((x, i) => (x - mx) * (ys[i] - my))) / spread : 0;
  };
  /** Residualise both sides on the early line before correlating. */
  const partialOnEarly = (values, target, early) => {
    const slope = (a, b) => {
      const ma = mean(a);
      const mb = mean(b);
      const variance = mean(a.map((x) => (x - ma) ** 2));
      return variance > 0 ? mean(a.map((x, i) => (x - ma) * (b[i] - mb))) / variance : 0;
    };
    const rv = values.map((value, i) => value - slope(early, values) * early[i]);
    const rt = target.map((value, i) => value - slope(early, target) * early[i]);
    return correlation(rv, rt);
  };
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  };
  /** 95% interval for a mean, so a small bucket's average CLV is not over-read. */
  const meanCi = (values) => {
    if (values.length < 2) return [0, 0];
    const half = (1.96 * sd(values)) / Math.sqrt(values.length);
    return [mean(values) - half, mean(values) + half];
  };

  for (const [name, result] of Object.entries(results)) {
    const { rows, coverage, models, config } = result;
    const tested = rows.filter((row) => config.testSeasons.includes(row.season));
    console.log(`\n\n${"=".repeat(78)}`);
    console.log(`DATASET: ${name}`);
    console.log(`  early = ${datasets[name].early}`);
    console.log(`  close = ${datasets[name].close}`);
    console.log(`${"=".repeat(78)}`);
    console.log(`  eligible games ${coverage.games}, joined ${rows.length}`
      + ` (dropped: no early line ${coverage.missingEarly}, no closing line ${coverage.missingClose}, no prior ${coverage.missingPrior})`);
    console.log(`  test seasons ${config.testSeasons.join(", ")} -> ${tested.length} out-of-sample games`);
    const allClv = rows.map((row) => row.clv);
    console.log(`  line movement (close - early): mean ${mean(allClv).toFixed(3)}, sd ${sd(allClv).toFixed(3)},`
      + ` mean |move| ${mean(allClv.map(Math.abs)).toFixed(3)}, no move ${allClv.filter((value) => value === 0).length}/${allClv.length}`);
    // Baseline: a model that always bet "toward home" would score this, so any
    // directional accuracy has to be read against it rather than against 50%.
    const movedAll = allClv.filter((value) => value !== 0);
    const towardHome = movedAll.filter((value) => value > 0).length;
    console.log(`  baseline move direction: toward home ${towardHome}/${movedAll.length}`
      + ` = ${(100 * towardHome / Math.max(1, movedAll.length)).toFixed(1)}% (an always-home rule scores this)`);
    report.datasets[name] = { coverage, tested: tested.length, movement: { mean: mean(allClv), sd: sd(allClv) }, sets: {} };

    for (const [setId, featureNames] of Object.entries(FEATURE_SETS)) {
      const { fair, coefficients } = models.get(setId);
      const entries = tested.filter((row) => fair.has(row.gameId)).map((row) => ({
        row, fair: fair.get(row.gameId), edge: fair.get(row.gameId) - row.earlyHomeMargin,
      }));
      if (entries.length === 0) continue;
      const edges = entries.map((entry) => entry.edge);
      const clvs = entries.map((entry) => entry.row.clv);
      const bucket = report.datasets[name].sets[setId] = { n: entries.length, features: featureNames.length };

      console.log(`\n  ---- feature set: ${setId} (${featureNames.length} features) ----`);
      console.log(`  JKB edge vs early line: sd ${sd(edges).toFixed(2)} pts, mean |edge| ${mean(edges.map(Math.abs)).toFixed(2)}`);

      // ---- A/B: does the edge predict CLV, in sign and in magnitude?
      const rClv = correlation(edges, clvs);
      const moved = entries.filter((entry) => entry.row.clv !== 0);
      const correct = moved.filter((entry) => Math.sign(entry.edge) === Math.sign(entry.row.clv)).length;
      const [dirLow, dirHigh] = wilson(correct, moved.length);
      const inDirection = entries.map((entry) => Math.sign(entry.edge) * entry.row.clv);
      const [clvLow, clvHigh] = meanCi(inDirection);
      bucket.clv = { rClv, directional: moved.length ? correct / moved.length : 0, n: moved.length,
        meanClvInDirection: mean(inDirection), rmseToClose: score(entries.map((e) => [e.fair, e.row.closeHomeMargin])).rmse };
      console.log(`  r(edge, CLV) = ${rClv.toFixed(3)}`
        + `   |  line-move direction correct ${correct}/${moved.length} = ${(100 * correct / Math.max(1, moved.length)).toFixed(1)}%`
        + ` [${(100 * dirLow).toFixed(1)}%, ${(100 * dirHigh).toFixed(1)}%]`);
      console.log(`  mean CLV in JKB direction ${mean(inDirection).toFixed(3)} pts`
        + ` [${clvLow.toFixed(3)}, ${clvHigh.toFixed(3)}]   median ${median(inDirection).toFixed(2)}`
        + `   (no-move games ${entries.length - moved.length})`);

      // ---- predicting the closing line itself
      const closePairs = entries.map((entry) => [entry.fair, entry.row.closeHomeMargin]);
      const earlyPairs = entries.map((entry) => [entry.row.earlyHomeMargin, entry.row.closeHomeMargin]);
      const jkbToClose = score(closePairs);
      const earlyToClose = score(earlyPairs);
      console.log(`  predicting the CLOSING line: early line MAE=${earlyToClose.mae.toFixed(2)} RMSE=${earlyToClose.rmse.toFixed(2)}`
        + `  |  JKB fair MAE=${jkbToClose.mae.toFixed(2)} RMSE=${jkbToClose.rmse.toFixed(2)}`);

      // ---- C: model comparison against the actual margin
      const margin = (predictions) => score(entries.map((entry, i) => [predictions[i], entry.row.homeMargin]));
      const earlyOnly = margin(entries.map((entry) => entry.row.earlyHomeMargin));
      const jkbOnly = margin(entries.map((entry) => entry.fair));
      const blend = margin(entries.map((entry) => 0.5 * entry.row.earlyHomeMargin + 0.5 * entry.fair));
      const closeOnly = margin(entries.map((entry) => entry.row.closeHomeMargin));
      bucket.margin = { earlyOnly, jkbOnly, blend, closeOnly };
      console.log(`  vs ACTUAL MARGIN   early ${earlyOnly.rmse.toFixed(3)}  |  JKB ${jkbOnly.rmse.toFixed(3)}`
        + `  |  early+JKB 50/50 ${blend.rmse.toFixed(3)}  |  CLOSE ${closeOnly.rmse.toFixed(3)}`);
      console.log(`                     early+JKB vs early ${(100 * (1 - blend.rmse / earlyOnly.rmse) >= 0 ? "+" : "")}`
        + `${(100 * (1 - blend.rmse / earlyOnly.rmse)).toFixed(2)}%`
        + `   |  gap from early to close ${(100 * (1 - closeOnly.rmse / earlyOnly.rmse)).toFixed(2)}%`);

      if (setId !== "combined") continue;

      // ---- buckets: CLV and ATS at the actual early line
      console.log(`\n  fixed edge buckets (out of sample, all test seasons):`);
      console.log(`  bucket   games   dir%    meanCLV(dir)  [95% CI]            ATS W-L-P      cover%   [95% CI]`);
      bucket.buckets = {};
      for (const [label, low, high] of BUCKETS) {
        const inBucket = entries.filter((entry) => Math.abs(entry.edge) >= low && Math.abs(entry.edge) < high);
        if (inBucket.length === 0) { console.log(`  ${label.padEnd(9)}${String(0).padStart(5)}   -`); continue; }
        const bucketMoved = inBucket.filter((entry) => entry.row.clv !== 0);
        const bucketCorrect = bucketMoved.filter((entry) => Math.sign(entry.edge) === Math.sign(entry.row.clv)).length;
        const bucketClv = inBucket.map((entry) => Math.sign(entry.edge) * entry.row.clv);
        const [lo, hi] = meanCi(bucketClv);
        let wins = 0;
        let losses = 0;
        let pushes = 0;
        for (const entry of inBucket) {
          const atsMargin = entry.row.homeMargin - entry.row.earlyHomeMargin;
          if (atsMargin === 0) pushes += 1;
          else if (Math.sign(atsMargin) === Math.sign(entry.edge)) wins += 1;
          else losses += 1;
        }
        const decided = wins + losses;
        const [aLow, aHigh] = wilson(wins, decided);
        bucket.buckets[label] = { games: inBucket.length, directional: bucketMoved.length ? bucketCorrect / bucketMoved.length : 0,
          meanClv: mean(bucketClv), wins, losses, pushes, cover: decided ? wins / decided : 0 };
        console.log(`  ${label.padEnd(9)}${String(inBucket.length).padStart(5)}   `
          + `${bucketMoved.length ? (100 * bucketCorrect / bucketMoved.length).toFixed(1) : "n/a"}%`.padEnd(8)
          + `${mean(bucketClv).toFixed(2)}`.padStart(9)
          + `   [${lo.toFixed(2)}, ${hi.toFixed(2)}]`.padEnd(20)
          + `  ${`${wins}-${losses}-${pushes}`.padEnd(13)}`
          + `${decided ? (100 * wins / decided).toFixed(1) : "n/a"}%`.padEnd(9)
          + `[${(100 * aLow).toFixed(1)}%, ${(100 * aHigh).toFixed(1)}%]`);
      }

      // ---- does JKB-generated CLV actually pay?
      const bets = entries.filter((entry) => Math.abs(entry.edge) >= 1);
      const splitAts = (subset) => {
        let wins = 0;
        let losses = 0;
        let pushes = 0;
        for (const entry of subset) {
          const atsMargin = entry.row.homeMargin - entry.row.earlyHomeMargin;
          if (atsMargin === 0) pushes += 1;
          else if (Math.sign(atsMargin) === Math.sign(entry.edge)) wins += 1;
          else losses += 1;
        }
        const decided = wins + losses;
        return { wins, losses, pushes, cover: decided ? wins / decided : 0, ci: wilson(wins, decided) };
      };
      const positive = bets.filter((entry) => Math.sign(entry.edge) * entry.row.clv > 0);
      const nonPositive = bets.filter((entry) => Math.sign(entry.edge) * entry.row.clv <= 0);
      const pos = splitAts(positive);
      const non = splitAts(nonPositive);
      bucket.clvVsAts = { positive: pos, nonPositive: non };
      console.log(`\n  does JKB-generated CLV pay? (plays with |edge| >= 1)`);
      console.log(`    positive CLV  n=${String(positive.length).padStart(4)}  ATS ${pos.wins}-${pos.losses}-${pos.pushes}`
        + `  ${(100 * pos.cover).toFixed(1)}%  [${(100 * pos.ci[0]).toFixed(1)}%, ${(100 * pos.ci[1]).toFixed(1)}%]`);
      console.log(`    zero/neg CLV  n=${String(nonPositive.length).padStart(4)}  ATS ${non.wins}-${non.losses}-${non.pushes}`
        + `  ${(100 * non.cover).toFixed(1)}%  [${(100 * non.ci[0]).toFixed(1)}%, ${(100 * non.ci[1]).toFixed(1)}%]`);

      // ---- early-season bands
      console.log(`\n  by week band:`);
      console.log(`  band            games   r(edge,CLV)   dir%     meanCLV(dir)   ATS(|edge|>=1)`);
      bucket.weekBands = {};
      for (const [label, maxWeek] of WEEK_BANDS) {
        const band = entries.filter((entry) => entry.row.week <= maxWeek);
        if (band.length < 5) continue;
        const bandMoved = band.filter((entry) => entry.row.clv !== 0);
        const bandCorrect = bandMoved.filter((entry) => Math.sign(entry.edge) === Math.sign(entry.row.clv)).length;
        const bandClv = band.map((entry) => Math.sign(entry.edge) * entry.row.clv);
        const ats = splitAts(band.filter((entry) => Math.abs(entry.edge) >= 1));
        bucket.weekBands[label] = { n: band.length, r: correlation(band.map((e) => e.edge), band.map((e) => e.row.clv)),
          directional: bandMoved.length ? bandCorrect / bandMoved.length : 0, meanClv: mean(bandClv), ats };
        console.log(`  ${label.padEnd(15)}${String(band.length).padStart(5)}   `
          + `${correlation(band.map((e) => e.edge), band.map((e) => e.row.clv)).toFixed(3)}`.padStart(11)
          + `   ${bandMoved.length ? (100 * bandCorrect / bandMoved.length).toFixed(1) : "n/a"}%`.padEnd(9)
          + `${mean(bandClv).toFixed(2)}`.padStart(9)
          + `      ${ats.wins}-${ats.losses}-${ats.pushes} (${(100 * ats.cover).toFixed(1)}%)`);
      }

      // ---- season stability
      console.log(`\n  by season:`);
      bucket.seasons = {};
      for (const season of config.testSeasons) {
        const group = entries.filter((entry) => entry.row.season === season);
        if (group.length === 0) continue;
        const groupMoved = group.filter((entry) => entry.row.clv !== 0);
        const groupCorrect = groupMoved.filter((entry) => Math.sign(entry.edge) === Math.sign(entry.row.clv)).length;
        const groupClv = group.map((entry) => Math.sign(entry.edge) * entry.row.clv);
        const ats = splitAts(group.filter((entry) => Math.abs(entry.edge) >= 1));
        bucket.seasons[season] = { n: group.length, r: correlation(group.map((e) => e.edge), group.map((e) => e.row.clv)),
          directional: groupMoved.length ? groupCorrect / groupMoved.length : 0, meanClv: mean(groupClv), ats };
        console.log(`    ${season}  n=${String(group.length).padStart(4)}  r(edge,CLV)=`
          + `${correlation(group.map((e) => e.edge), group.map((e) => e.row.clv)).toFixed(3).padStart(6)}`
          + `  dir ${groupMoved.length ? (100 * groupCorrect / groupMoved.length).toFixed(1) : "n/a"}%`
          + `  meanCLV ${mean(groupClv).toFixed(2).padStart(6)}`
          + `  ATS(|edge|>=1) ${ats.wins}-${ats.losses}-${ats.pushes}`);
      }

      // ---- coefficient stability of the fitted margin mapping
      const stability = new Map();
      for (const [, fit] of coefficients) {
        for (const [feature, value] of Object.entries(fit.beta)) {
          if (!stability.has(feature)) stability.set(feature, []);
          stability.get(feature).push(value);
        }
      }
      const top = [...stability].map(([feature, values]) => ({ feature, avg: mean(values),
        flipped: new Set(values.map((value) => Math.sign(Math.round(value * 1000)))).size > 1 }))
        .sort((a, b) => Math.abs(b.avg) - Math.abs(a.avg)).slice(0, 6);
      console.log(`\n  fitted margin mapping, mean standardised coefficients (* = sign flipped across folds):`);
      console.log(`    ${top.map((entry) => `${entry.feature}=${entry.avg.toFixed(2)}${entry.flipped ? "*" : ""}`).join("  ")}`);
    }

    // ---- which JKB components track future line movement, after the early line
    console.log(`\n  ---- JKB components vs future CLV, after projecting out the early line ----`);
    const early = tested.map((row) => row.earlyHomeMargin);
    const clvs = tested.map((row) => row.clv);
    report.datasets[name].components = {};
    for (const feature of FEATURE_NAMES) {
      const values = tested.map((row) => FEATURES[feature](row));
      const partial = partialOnEarly(values, clvs, early);
      const raw = correlation(values, clvs);
      report.datasets[name].components[feature] = { raw, partial };
      console.log(`    ${feature.padEnd(24)} r(feature, CLV)=${raw.toFixed(3).padStart(6)}`
        + `   partial after early line=${partial.toFixed(3).padStart(6)}`);
    }
  }
}
