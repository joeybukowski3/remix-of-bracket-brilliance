import { getEtDate, isAmericanOdds, isValidPropLine, normalizeMlbPropName } from "./mlb-prop-name-normalizer.mjs";

function resolveOddsSlateDate(oddsData) {
  return String(oddsData?.date ?? "").trim() || getEtDate(oddsData?.fetchedAt) || getEtDate(oddsData?.generatedAt);
}

function isCurrentValidPitcherOdds(pitcher, slateDate) {
  return pitcher?.kOddsSlateDate === slateDate && isValidPropLine(pitcher?.kLine) && (isAmericanOdds(pitcher?.kOddsOver) || isAmericanOdds(pitcher?.kOddsUnder));
}

function clearPitcherOdds(pitcher) {
  return { ...pitcher, kLine: null, kOddsOver: null, kOddsUnder: null, kOddsBook: null, kOddsSlateDate: null };
}

export function injectKOdds(rawData, oddsData) {
  const slateDate = String(rawData?.date ?? "").trim();
  const oddsSlateDate = resolveOddsSlateDate(oddsData);
  const sameSlate = Boolean(slateDate && oddsSlateDate && slateDate === oddsSlateDate);
  const source = oddsData?.kOdds && typeof oddsData.kOdds === "object" ? oddsData.kOdds : {};
  const usefulEntries = new Map(Object.entries(source)
    .filter(([, entry]) => entry && isValidPropLine(entry.line) && (isAmericanOdds(entry.over) || isAmericanOdds(entry.under)))
    .map(([name, entry]) => [normalizeMlbPropName(name), entry]));

  const counts = { providerRecords: Object.keys(source).length, usefulProviderRecords: usefulEntries.size, pitchersEvaluated: Array.isArray(rawData?.pitchers) ? rawData.pitchers.length : 0, pitchersMatched: 0, pitchersUnmatched: 0, pitchersUpdated: 0, sameSlatePreserved: 0, staleRecordsCleared: 0, withLine: 0, withOverPrice: 0, withUnderPrice: 0 };
  let status = "success";
  if (!sameSlate) status = "slate_mismatch";
  else if (usefulEntries.size === 0) status = "no_useful_provider_records";

  const pitchers = (rawData?.pitchers ?? []).map((pitcher) => {
    const existingCurrent = isCurrentValidPitcherOdds(pitcher, slateDate);
    if (!sameSlate) {
      if (pitcher?.kLine != null || pitcher?.kOddsOver || pitcher?.kOddsUnder) counts.staleRecordsCleared += 1;
      return clearPitcherOdds(pitcher);
    }
    const entry = usefulEntries.get(normalizeMlbPropName(pitcher?.pitcher));
    if (entry) {
      counts.pitchersMatched += 1; counts.pitchersUpdated += 1;
      const updated = { ...pitcher, kLine: Number(entry.line), kOddsOver: isAmericanOdds(entry.over) ? entry.over : null, kOddsUnder: isAmericanOdds(entry.under) ? entry.under : null, kOddsBook: entry.bookmaker ?? null, kOddsSlateDate: slateDate };
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
    return clearPitcherOdds(pitcher);
  });

  if (status === "success" && counts.pitchersMatched < counts.pitchersEvaluated) status = counts.pitchersMatched > 0 ? "partial_success" : "zero_matches";
  return { data: { ...rawData, pitchers }, status: { status, slateDate, oddsSlateDate, sameSlate, ...counts } };
}
