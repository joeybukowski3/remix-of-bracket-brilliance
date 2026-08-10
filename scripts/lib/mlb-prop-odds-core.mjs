import { getEtDate, isAmericanOdds, isValidPropLine, normalizeMlbPropName } from "./mlb-prop-name-normalizer.mjs";
import { americanToImplied, parseAmericanOdds } from "./mlb-moneyline-providers.mjs";
import { modalValue } from "./mlb-prop-odds-integrity.mjs";

export function resolveOddsSlateDate(oddsData) {
  return String(oddsData?.date ?? "").trim() || getEtDate(oddsData?.fetchedAt) || getEtDate(oddsData?.generatedAt);
}

// A real two-sided sportsbook market's combined implied probability is
// almost always at or above 100% (the "vig"/overround). This floor is set
// well below that to tolerate unusually thin/near-even real markets
// without false positives, while still catching an egregious mismatch --
// see the Jack Perkins K-props audit case (+881 over / -100 under implied
// ~60.2% combined, from a book-fallback mismatch).
const MIN_COMBINED_IMPLIED_PROBABILITY = 0.85;
const DISALLOWED_K_ODDS_BOOKS = new Set(["underdog", "prizepicks", "sleeper"]);

function isCoherentKMarket(entry) {
  const over = parseAmericanOdds(entry?.over);
  const under = parseAmericanOdds(entry?.under);
  if (over == null || under == null) return true; // can't check coherence with only one side priced
  const impliedOver = americanToImplied(over);
  const impliedUnder = americanToImplied(under);
  if (impliedOver == null || impliedUnder == null) return true;
  return impliedOver + impliedUnder >= MIN_COMBINED_IMPLIED_PROBABILITY;
}

/**
 * A stored row is only worth preserving if it would still pass primary-market
 * integrity today. A row sitting on a ladder threshold (2+/3+ HR) was written
 * before canonical-market selection existed; preserving it because the slate
 * date happens to match would quietly reintroduce a long-odds ladder price for
 * any batter missing from the current provider response.
 *
 * The canonical threshold is derived from the current provider data, so no
 * threshold is hard-coded, and the constraint is skipped entirely when the
 * provider gave us nothing to derive it from.
 */
function isSameSlateHrOdds(batter, slateDate, canonicalLine) {
  if (batter?.hrOddsSlateDate !== slateDate || !isAmericanOdds(batter?.hrOddsYes)) return false;
  if (canonicalLine == null || batter?.hrLine == null) return true;
  return Number(batter.hrLine) === canonicalLine;
}

function clearHrOdds(batter) {
  return { ...batter, hrLine: null, hrOddsYes: null, hrOddsNo: null, hrOddsBook: null, hrOddsSlateDate: null, hrOddsCapturedAt: null };
}

/**
 * Ingestion only publishes two-sided strikeout markets, so a stored one-sided
 * row is a ladder rung left over from an earlier pipeline. Preserving it would
 * put an "N+ strikeouts" price back on the board, so it is cleared instead.
 */
function isTrustworthyTwoSidedKMarket(pitcher) {
  const book = String(pitcher?.kOddsBook ?? "").trim().toLowerCase();
  return isValidPropLine(pitcher?.kLine)
    && isAmericanOdds(pitcher?.kOddsOver)
    && isAmericanOdds(pitcher?.kOddsUnder)
    && isCoherentKMarket({ over: pitcher.kOddsOver, under: pitcher.kOddsUnder })
    && !DISALLOWED_K_ODDS_BOOKS.has(book);
}

function isSameSlateKOdds(pitcher, slateDate) {
  return pitcher?.kOddsSlateDate === slateDate && isTrustworthyTwoSidedKMarket(pitcher);
}

function clearKOdds(pitcher) {
  return { ...pitcher, kLine: null, kOddsOver: null, kOddsUnder: null, kOddsBook: null, kOddsSlateDate: null, kOddsCapturedAt: null };
}

/**
 * Carries a previously validated K market across a same-slate model rebuild.
 * The generator writes a fresh model payload before injectKOdds runs, so this
 * bridge prevents that write from erasing the only copy the injector could
 * preserve during a temporary provider outage. Prior-day, one-sided,
 * incoherent, DFS, and mismatched-game rows are never retained.
 */
export function preserveSameSlateKOdds(rawData, previousData) {
  const slateDate = String(rawData?.date ?? "").trim();
  const previousSlateDate = String(previousData?.date ?? "").trim();
  if (!slateDate || previousSlateDate !== slateDate) {
    return { data: rawData, preserved: 0 };
  }

  const previousPitchers = Array.isArray(previousData?.pitchers) ? previousData.pitchers : [];
  const freshPitchers = Array.isArray(rawData?.pitchers) ? rawData.pitchers : [];
  const previousByPitcher = new Map(previousPitchers.map((pitcher) => [normalizeMlbPropName(pitcher?.pitcher), pitcher]));
  let preserved = 0;
  const pitchers = freshPitchers.map((pitcher) => {
    if (isTrustworthyTwoSidedKMarket(pitcher)) return pitcher;
    const previous = previousByPitcher.get(normalizeMlbPropName(pitcher?.pitcher));
    if (!previous || !isSameSlateKOdds(previous, slateDate)) return pitcher;
    if (pitcher?.gameKey && previous?.gameKey && pitcher.gameKey !== previous.gameKey) return pitcher;
    if (pitcher?.team && previous?.team && pitcher.team !== previous.team) return pitcher;

    preserved += 1;
    return {
      ...pitcher,
      kLine: previous.kLine,
      kOddsOver: previous.kOddsOver,
      kOddsUnder: previous.kOddsUnder,
      kOddsBook: previous.kOddsBook ?? null,
      kOddsSlateDate: previous.kOddsSlateDate,
      kOddsCapturedAt: previous.kOddsCapturedAt ?? null,
    };
  });

  return { data: { ...rawData, pitchers }, preserved };
}

export function injectHrOdds(rawData, oddsData) {
  const slateDate = String(rawData?.date ?? "").trim();
  const oddsSlateDate = resolveOddsSlateDate(oddsData);
  const sameSlate = Boolean(slateDate && oddsSlateDate && slateDate === oddsSlateDate);
  const oddsCapturedAt = String(oddsData?.fetchedAt ?? oddsData?.generatedAt ?? "").trim() || null;
  const source = oddsData?.hrOdds && typeof oddsData.hrOdds === "object" ? oddsData.hrOdds : {};
  const usefulEntries = new Map(Object.entries(source)
    .filter(([, entry]) => entry && isAmericanOdds(entry.yes))
    .map(([name, entry]) => [normalizeMlbPropName(name), entry]));

  const counts = { providerRecords: Object.keys(source).length, usefulProviderRecords: usefulEntries.size, battersEvaluated: Array.isArray(rawData?.batters) ? rawData.batters.length : 0, battersMatched: 0, battersUnmatched: 0, battersUpdated: 0, sameSlatePreserved: 0, staleRecordsCleared: 0, withYesPrice: 0 };
  let status = "success";
  if (!sameSlate) status = "slate_mismatch";
  else if (usefulEntries.size === 0) status = "no_useful_provider_records";

  // Canonical HR threshold for this slate, derived from the current provider
  // response rather than assumed.
  const canonicalLine = modalValue(
    [...usefulEntries.values()].map((entry) => Number(entry.line)).filter((value) => Number.isFinite(value)),
  );

  const batters = (rawData?.batters ?? []).map((batter) => {
    const existingCurrent = isSameSlateHrOdds(batter, slateDate, canonicalLine);
    if (!sameSlate) {
      if (batter?.hrOddsYes || batter?.hrOddsNo || batter?.hrLine != null) counts.staleRecordsCleared += 1;
      return clearHrOdds(batter);
    }
    const entry = usefulEntries.get(normalizeMlbPropName(batter?.player));
    if (entry) {
      counts.battersMatched += 1;
      counts.battersUpdated += 1;
      counts.withYesPrice += 1;
      return { ...batter, hrLine: entry.line ?? 0.5, hrOddsYes: entry.yes, hrOddsNo: isAmericanOdds(entry.no) ? entry.no : null, hrOddsBook: entry.bookmaker ?? null, hrOddsSlateDate: slateDate, hrOddsCapturedAt: oddsCapturedAt };
    }
    counts.battersUnmatched += 1;
    if (existingCurrent) {
      counts.sameSlatePreserved += 1;
      counts.withYesPrice += 1;
      return batter;
    }
    return clearHrOdds(batter);
  });

  if (status === "success" && counts.battersMatched < counts.battersEvaluated) status = counts.battersMatched > 0 ? "partial_success" : "zero_matches";
  return { data: { ...rawData, batters }, status: { status, slateDate, oddsSlateDate, sameSlate, ...counts } };
}

export function injectKOdds(rawData, oddsData) {
  const slateDate = String(rawData?.date ?? "").trim();
  const oddsSlateDate = resolveOddsSlateDate(oddsData);
  const sameSlate = Boolean(slateDate && oddsSlateDate && slateDate === oddsSlateDate);
  const source = oddsData?.kOdds && typeof oddsData.kOdds === "object" ? oddsData.kOdds : {};
  const oddsCapturedAt = String(oddsData?.fetchedAt ?? oddsData?.generatedAt ?? "").trim() || null;
  const usefulEntries = new Map(Object.entries(source)
    .filter(([, entry]) => entry && isValidPropLine(entry.line) && (isAmericanOdds(entry.over) || isAmericanOdds(entry.under)) && isCoherentKMarket(entry))
    .map(([name, entry]) => [normalizeMlbPropName(name), entry]));

  const counts = { providerRecords: Object.keys(source).length, usefulProviderRecords: usefulEntries.size, pitchersEvaluated: Array.isArray(rawData?.pitchers) ? rawData.pitchers.length : 0, pitchersMatched: 0, pitchersUnmatched: 0, pitchersUpdated: 0, sameSlatePreserved: 0, staleRecordsCleared: 0, withLine: 0, withOverPrice: 0, withUnderPrice: 0 };
  let status = "success";
  if (!sameSlate) status = "slate_mismatch";
  else if (usefulEntries.size === 0) status = "no_useful_provider_records";

  const pitchers = (rawData?.pitchers ?? []).map((pitcher) => {
    const existingCurrent = isSameSlateKOdds(pitcher, slateDate);
    if (!sameSlate) {
      if (pitcher?.kLine != null || pitcher?.kOddsOver || pitcher?.kOddsUnder) counts.staleRecordsCleared += 1;
      return clearKOdds(pitcher);
    }
    const entry = usefulEntries.get(normalizeMlbPropName(pitcher?.pitcher));
    if (entry) {
      counts.pitchersMatched += 1;
      counts.pitchersUpdated += 1;
      const updated = { ...pitcher, kLine: Number(entry.line), kOddsOver: isAmericanOdds(entry.over) ? entry.over : null, kOddsUnder: isAmericanOdds(entry.under) ? entry.under : null, kOddsBook: entry.bookmaker ?? null, kOddsSlateDate: slateDate, kOddsCapturedAt: oddsCapturedAt };
      if (isValidPropLine(updated.kLine)) counts.withLine += 1;
      if (isAmericanOdds(updated.kOddsOver)) counts.withOverPrice += 1;
      if (isAmericanOdds(updated.kOddsUnder)) counts.withUnderPrice += 1;
      return updated;
    }
    counts.pitchersUnmatched += 1;
    if (existingCurrent) {
      counts.sameSlatePreserved += 1;
      if (isValidPropLine(pitcher.kLine)) counts.withLine += 1;
      if (isAmericanOdds(pitcher.kOddsOver)) counts.withOverPrice += 1;
      if (isAmericanOdds(pitcher.kOddsUnder)) counts.withUnderPrice += 1;
      return pitcher;
    }
    return clearKOdds(pitcher);
  });

  if (status === "success" && counts.pitchersMatched < counts.pitchersEvaluated) status = counts.pitchersMatched > 0 ? "partial_success" : "zero_matches";
  return { data: { ...rawData, pitchers }, status: { status, slateDate, oddsSlateDate, sameSlate, ...counts } };
}
