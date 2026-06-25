from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"Could not locate {label} in {path}")
    path.write_text(text.replace(old, new, 1))


hr = ROOT / "scripts/generate-mlb-hr-props.mjs"
replace_once(
    hr,
    '''      opposingPitcher: normalizeText(row.opposingPitcher) || "TBD",
      opposingPitcherId: toFiniteNumber(row.opposingPitcherId),
      gameKey: normalizeText(row.gameKey),''',
    '''      opposingPitcher: normalizeText(row.opposingPitcher) || "TBD",
      opposingPitcherId: toFiniteNumber(row.opposingPitcherId),
      battingOrder: (() => {
        const order = toFiniteNumber(row.battingOrder);
        return order != null && order >= 1 && order <= 9 ? Math.round(order) : null;
      })(),
      lineupSource: normalizeText(row.lineupSource) || "unknown",
      gameKey: normalizeText(row.gameKey),''',
    "validated batter lineup fields",
)
replace_once(
    hr,
    '''    const awayLineup = currentAwayLineup.length ? currentAwayLineup : await fetchLastKnownLineup(game.away.id);
    const homeLineup = currentHomeLineup.length ? currentHomeLineup : await fetchLastKnownLineup(game.home.id);''',
    '''    const awayLineup = currentAwayLineup.length ? currentAwayLineup : await fetchLastKnownLineup(game.away.id);
    const homeLineup = currentHomeLineup.length ? currentHomeLineup : await fetchLastKnownLineup(game.home.id);
    const awayLineupSource = currentAwayLineup.length ? "current_boxscore" : "last_known_lineup";
    const homeLineupSource = currentHomeLineup.length ? "current_boxscore" : "last_known_lineup";''',
    "lineup source detection",
)
replace_once(
    hr,
    '''        lineup: awayLineup,
        battingTeam: game.away,''',
    '''        lineup: awayLineup,
        lineupSource: awayLineupSource,
        battingTeam: game.away,''',
    "away lineup source",
)
replace_once(
    hr,
    '''        lineup: homeLineup,
        battingTeam: game.home,''',
    '''        lineup: homeLineup,
        lineupSource: homeLineupSource,
        battingTeam: game.home,''',
    "home lineup source",
)
replace_once(
    hr,
    '''    for (const context of pitcherContexts) {
      for (const hitter of context.lineup.slice(0, 9)) {''',
    '''    for (const context of pitcherContexts) {
      for (const [lineupIndex, hitter] of context.lineup.slice(0, 9).entries()) {''',
    "lineup index iteration",
)
replace_once(
    hr,
    '''          opponent: context.opponent.abbreviation,
          opposingPitcher: context.opposingPitcher,''',
    '''          opponent: context.opponent.abbreviation,
          opposingPitcher: context.opposingPitcher,
          battingOrder: lineupIndex + 1,
          lineupSource: context.lineupSource,''',
    "batter lineup output",
)

numerology = ROOT / "scripts/generate-mlb-numerology.mjs"
replace_once(
    numerology,
    '''function computeLineupStatus(rosterEntry, isPreLineupTime) {
  if (!rosterEntry) return { status: "unknown", source: null, asOf: null };
  if (isPreLineupTime) {
    return { status: "morning_projected", source: "mlb-api-schedule", asOf: new Date().toISOString() };
  }
  return { status: "projected", source: "mlb-api-schedule", asOf: new Date().toISOString() };
}

function computeDataStatus(batters, scheduleRoster, confirmedCount) {
  if (batters.length === 0) return "unavailable";
  if (confirmedCount === 0 && scheduleRoster.length === 0) return "unavailable";
  if (confirmedCount > 0 && confirmedCount >= batters.length * 0.5) return "partially_confirmed";
  return "morning_projected";
}''',
    '''function computeLineupStatus(rosterEntry, isPreLineupTime, fallbackBattingOrder, fallbackSource) {
  if (rosterEntry) {
    if (isPreLineupTime) {
      return { status: "morning_projected", source: "mlb-api-schedule", asOf: new Date().toISOString() };
    }
    return { status: "projected", source: "mlb-api-schedule", asOf: new Date().toISOString() };
  }

  if (fallbackBattingOrder != null) {
    return {
      status: isPreLineupTime ? "morning_projected" : "projected",
      source: fallbackSource === "current_boxscore" ? "jkb-current-boxscore" : "jkb-last-known-lineup",
      asOf: new Date().toISOString(),
    };
  }

  return { status: "unknown", source: null, asOf: null };
}

function computeDataStatus(batters, scheduleRoster, confirmedCount, projectedCount) {
  if (batters.length === 0) return "unavailable";
  if (confirmedCount > 0 && confirmedCount >= batters.length * 0.5) return "partially_confirmed";
  if (scheduleRoster.length > 0 || projectedCount > 0) return "morning_projected";
  return "unavailable";
}''',
    "lineup fallback status logic",
)
replace_once(
    numerology,
    '''    const rosterEntry = scheduleRoster.find(r => r.id === personId);
    const lineupInfo = computeLineupStatus(rosterEntry, isPreLineupTime);
    const battingOrder = rosterEntry?.battingOrder ?? null;''',
    '''    const rosterEntry = scheduleRoster.find(r => r.id === personId);
    const fallbackBattingOrder = normalizeBattingOrder(batter.battingOrder);
    const battingOrder = rosterEntry?.battingOrder ?? fallbackBattingOrder;
    const lineupInfo = computeLineupStatus(
      rosterEntry,
      isPreLineupTime,
      fallbackBattingOrder,
      batter.lineupSource,
    );''',
    "candidate batting-order fallback",
)
replace_once(
    numerology,
    '''  const confirmedCount = candidates.filter(c => c.lineupStatus === "confirmed").length;''',
    '''  const confirmedCount = candidates.filter(c => c.lineupStatus === "confirmed").length;
  const projectedCount = candidates.filter(c => ["projected", "morning_projected"].includes(c.lineupStatus) && c.battingOrder != null).length;''',
    "projected lineup count",
)
replace_once(
    numerology,
    '''    dataStatus: computeDataStatus(batters, scheduleRoster, confirmedCount),''',
    '''    dataStatus: computeDataStatus(batters, scheduleRoster, confirmedCount, projectedCount),''',
    "data status call",
)
replace_once(
    numerology,
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
      finalScore: c.finalScore,
      formula: `${Math.round(W.numerologyWeight*100)}% × ${c.numerologyScore} + ${Math.round(W.baseballWeight*100)}% × ${c.baseballScore} = ${c.finalScore}`,
      confidence: "low",
      positiveSignals: c.signals.filter(s => s.points > 0),
      counterSignals: c.signals.filter(s => s.points < 0),
      primarySignal: c.signals.filter(s => s.points > 0)[0]?.label ?? null,
      missingData: c.missingData,
      summary: getNarrative(c.rank).summary ?? "Best available combined alignment; below the featured-play threshold.",
      belowThresholdLabel: "Best available today — below the featured-play threshold",''',
    "best available calculation trace",
)
replace_once(
    numerology,
    '''    narrative: { closingObservation: narratives?.closingObservation ?? "Patterns are documented, not guaranteed. The model records recurrence without claiming causation." },''',
    '''    evaluationSummary: {
      playersEvaluated: candidates.length,
      completeProfiles: candidates.filter(c => c.missingData.length === 0).length,
      confirmedLineups: confirmedCount,
      projectedLineups: projectedCount,
      primaryFamilyMatches: candidates.filter(c => c.signals.some(s => s.type === "family_support")).length,
      personalDayMatches: candidates.filter(c => c.signals.some(s => s.field === "personalDay" && s.points > 0)).length,
      countercurrentPlayers: candidates.filter(c => c.countercurrentTotal > 0).length,
      medianScore: candidates.length ? candidates.map(c => c.finalScore).sort((a,b)=>a-b)[Math.floor(candidates.length/2)] : 0,
      maxScore: candidates[0]?.finalScore ?? 0,
      battingOrderCoverage: projectedCount,
    },
    narrative: { closingObservation: narratives?.closingObservation ?? "Patterns are documented, not guaranteed. The model records recurrence without claiming causation." },''',
    "evaluation summary",
)

page = ROOT / "src/pages/MlbNumerologyPage.tsx"
replace_once(
    page,
    '''function DailyKeys({ profile }: { profile: DailyProfile }) {
  const keyJerseys: number[] = Array.from(new Set<number>(profile.primaryFamily.flatMap((root) => rootMatches(root, 49)))).sort((a, b) => a - b);''',
    '''function DailyKeys({ profile }: { profile: DailyProfile }) {
  const keyJerseys: number[] = Array.from(new Set<number>(profile.primaryFamily.flatMap((root) => rootMatches(root, 49)))).sort((a, b) => a - b);
  const exactLineupSlot = profile.universalDayRoot;
  const supportingLineupSlots = profile.primaryFamily.filter((slot) => slot !== exactLineupSlot);
  const secondaryLineupSlot = profile.calendarDayRoot;''',
    "daily lineup keys",
)
replace_once(
    page,
    '''      <div className="grid gap-3 sm:grid-cols-2">''',
    '''      <div className="grid gap-3 sm:grid-cols-3">''',
    "daily keys grid",
)
replace_once(
    page,
    '''        <div className="rounded-xl border border-white/8 bg-white/3 p-3">
          <p className="text-[9px] uppercase tracking-wide text-white/30">Matching jersey numbers</p>
          <p className="mt-1 font-mono text-[11px] font-bold leading-5 text-emerald-300/80">{keyJerseys.join(" · ")}</p>
          <p className="mt-2 text-[10px] leading-4 text-white/35">Balancing number {profile.balancingComplement} can support the current; root {profile.countercurrent} introduces tension.</p>
        </div>''',
    '''        <div className="rounded-xl border border-white/8 bg-white/3 p-3">
          <p className="text-[9px] uppercase tracking-wide text-white/30">Matching jersey numbers</p>
          <p className="mt-1 font-mono text-[11px] font-bold leading-5 text-emerald-300/80">{keyJerseys.join(" · ")}</p>
          <p className="mt-2 text-[10px] leading-4 text-white/35">Balancing number {profile.balancingComplement} can support the current; root {profile.countercurrent} introduces tension.</p>
        </div>
        <div className="rounded-xl border border-violet-400/15 bg-violet-500/5 p-3">
          <p className="text-[9px] uppercase tracking-wide text-violet-300/50">Lineup positions</p>
          <p className="mt-1 font-mono text-sm font-black text-violet-200">#{exactLineupSlot} exact</p>
          <p className="mt-1 text-[10px] text-white/45">#{supportingLineupSlots.join(" and #")} support the primary family.</p>
          <p className="mt-1 text-[10px] text-white/30">#{secondaryLineupSlot} is a secondary calendar-day match.</p>
        </div>''',
    "lineup position card",
)
replace_once(
    page,
    '''            <LineupBadge status={play.lineupStatus} />
            {play.battingOrder != null && <span className="text-[9px] text-white/30">Batting {play.battingOrder}</span>}''',
    '''            <LineupBadge status={play.lineupStatus} />
            {play.battingOrder != null && (
              <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-0.5 text-[9px] font-semibold text-violet-200">
                Batting #{play.battingOrder}
              </span>
            )}''',
    "batting order badge",
)

print("Applied projected-lineup scoring and calculation-trace improvements.")
