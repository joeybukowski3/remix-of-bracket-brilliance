from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def rep(path, old, new, label):
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"Missing {label}")
    path.write_text(text.replace(old, new, 1))

config_path = ROOT / "config/mlb-numerology-methodology.json"
config = json.loads(config_path.read_text())
config["version"] = "2.1.0"
config["description"] = "Players are selected and ranked only by deterministic numerology resonance. Baseball opportunity is displayed as context only and never affects alignment, qualification, or rank."
config["rankingBasis"] = "numerology_only"
config["baseballContextOnly"] = True
config["weights"]["numerologyWeight"] = 1
config["weights"]["baseballWeight"] = 0
config["finalScoreFormula"] = "Alignment Score = Numerology Resonance only. Baseball Opportunity is context only."
config_path.write_text(json.dumps(config, indent=2) + "\n")

p = ROOT / "scripts/generate-mlb-numerology.mjs"
rep(p,
'''    const bbScore = baseballScore(batter);
    const finalScore = Math.round(W.numerologyWeight * numerologyScore + W.baseballWeight * bbScore);
    const market = selectMarket(batter);''',
'''    const bbScore = baseballScore(batter);
    // Baseball opportunity is context only and never affects alignment.
    const finalScore = numerologyScore;
    const market = selectMarket(batter);''',
"score formula")
rep(p,
'''  // Rank
  candidates.sort((a, b) => b.finalScore - a.finalScore);
  candidates.forEach((c, i) => { c.rank = i + 1; });

  const featured = candidates.filter(c => c.finalScore >= 60).slice(0, 5);
  const bestAvailable = featured.length < 3
    ? candidates.filter(c => c.finalScore < 60).slice(0, 3 - featured.length)
    : [];
  const watchlist = candidates.filter(c => c.finalScore < 60 && c.finalScore >= 45).slice(0, 6);''',
'''  // Rank strictly by numerology. All tie-breakers are numerology-only.
  candidates.sort((a, b) =>
    b.numerologyScore - a.numerologyScore ||
    b.positiveTotal - a.positiveTotal ||
    b.convergenceBonus - a.convergenceBonus ||
    a.countercurrentTotal - b.countercurrentTotal ||
    a.playerName.localeCompare(b.playerName)
  );
  candidates.forEach((c, i) => { c.rank = i + 1; });

  const featured = candidates.filter(c => c.numerologyScore >= 60).slice(0, 5);
  const bestAvailable = featured.length < 3
    ? candidates.filter(c => c.numerologyScore < 60).slice(0, 3 - featured.length)
    : [];
  const watchlist = candidates.filter(c => c.numerologyScore < 60 && c.numerologyScore >= 45).slice(0, 6);''',
"ranking")
rep(p,
'''  // 60/40 formula check on each featured play
  for (const play of (output.featuredPlays ?? [])) {
    const expected = Math.round(W.numerologyWeight * play.numerologyScore + W.baseballWeight * play.baseballScore);
    if (play.finalScore !== expected) {
      errors.push(`finalScore for ${play.playerName}: ${play.finalScore} ≠ expected ${expected}`);
    }
  }''',
'''  // Alignment score must equal numerology score. Baseball is context only.
  for (const play of [...(output.featuredPlays ?? []), ...(output.bestAvailable ?? []), ...(output.watchlist ?? [])]) {
    if (play.finalScore !== play.numerologyScore) {
      errors.push(`alignment score for ${play.playerName} must equal numerology score`);
    }
  }
  if (output.rankingBasis !== "numerology_only" || output.baseballContextOnly !== true) {
    errors.push("Missing numerology-only ranking declaration");
  }''',
"validation")
rep(p,
'''    narrativeSource,
    dataStatus: computeDataStatus(batters, scheduleRoster, confirmedCount),''',
'''    narrativeSource,
    rankingBasis: "numerology_only",
    baseballContextOnly: true,
    dataStatus: computeDataStatus(batters, scheduleRoster, confirmedCount),''',
"metadata")
rep(p,
'''      formula: `${Math.round(W.numerologyWeight*100)}% × ${c.numerologyScore} + ${Math.round(W.baseballWeight*100)}% × ${c.baseballScore} = ${c.finalScore}`,
      confidence: c.finalScore >= 75 ? "high" : c.finalScore >= 60 ? "medium" : "low",''',
'''      formula: `Numerology alignment: ${c.numerologyScore}. Baseball context: ${c.baseballScore} (not used in rank).`,
      confidence: c.numerologyScore >= 75 ? "high" : c.numerologyScore >= 60 ? "medium" : "low",''',
"featured formula")
rep(p,
'''      recommendedMarket: c.recommendedMarket,
      numerologyScore: c.numerologyScore,
      baseballScore: c.baseballScore,
      finalScore: c.finalScore,
      primarySignal: c.signals.filter(s => s.points > 0)[0]?.label ?? null,
      missingData: c.missingData,
      belowThresholdLabel: "Best available today — below the featured-play threshold",''',
'''      opposingPitcher: c.opposingPitcher,
      lineupSource: c.lineupSource,
      recommendedMarket: c.recommendedMarket,
      numerologyScore: c.numerologyScore,
      baseballScore: c.baseballScore,
      finalScore: c.numerologyScore,
      formula: `Numerology alignment: ${c.numerologyScore}. Baseball context: ${c.baseballScore} (not used in rank).`,
      confidence: c.numerologyScore >= 75 ? "high" : c.numerologyScore >= 60 ? "medium" : "low",
      positiveSignals: c.signals.filter(s => s.points > 0),
      counterSignals: c.signals.filter(s => s.points < 0),
      primarySignal: c.signals.filter(s => s.points > 0)[0]?.label ?? null,
      missingData: c.missingData,
      summary: getNarrative(c.rank).summary ?? "Best available numerology alignment; baseball context did not affect this ranking.",
      belowThresholdLabel: "Best available today — below the numerology threshold",''',
"best available trace")
rep(p,
'''    scoringConfiguration: { weights: W, methodologyVersion: METHODOLOGY_VERSION },''',
'''    scoringConfiguration: { weights: W, methodologyVersion: METHODOLOGY_VERSION, rankingBasis: "numerology_only", baseballContextOnly: true },''',
"scoring metadata")

print("Applied numerology-only generator ranking.")
