import { buildStrikeoutPropDetailKey } from "./mlb-strikeout-prop-details-core.mjs";

export const K_PROPS_V2_SHADOW_SCHEMA_VERSION = 1;
export const K_PROPS_V2_SHADOW_MODE = "shadow";

function compareRows(a, b) {
  const aGameId = toFiniteNumber(a?.game?.gameId, Number.MAX_SAFE_INTEGER);
  const bGameId = toFiniteNumber(b?.game?.gameId, Number.MAX_SAFE_INTEGER);
  if (aGameId !== bGameId) return aGameId - bGameId;

  const aPitcherId = toFiniteNumber(a?.pitcher?.id, Number.MAX_SAFE_INTEGER);
  const bPitcherId = toFiniteNumber(b?.pitcher?.id, Number.MAX_SAFE_INTEGER);
  if (aPitcherId !== bPitcherId) return aPitcherId - bPitcherId;

  return String(a?.key ?? "").localeCompare(String(b?.key ?? ""));
}

function toFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTeam(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return ({ ARZ: "ARI", AZ: "ARI", CHW: "CWS", KCR: "KC", SDP: "SD", SFG: "SF", TBR: "TB", WSN: "WSH" })[code] ?? code;
}

function normalizeHand(value) {
  const hand = String(value ?? "").trim().toUpperCase();
  return hand.startsWith("L") ? "L" : hand.startsWith("R") ? "R" : null;
}

function parseMlbInnings(value) {
  if (value === null || value === undefined || value === "") return null;
  const [wholeText, partialText = "0"] = String(value).split(".");
  const whole = Number(wholeText);
  const partial = Number(partialText);
  if (!Number.isFinite(whole) || !Number.isFinite(partial) || partial < 0 || partial > 2) return null;
  return whole + partial / 3;
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function divide(top, bottom) {
  const numerator = toFiniteNumber(top);
  const denominator = toFiniteNumber(bottom);
  return numerator != null && denominator != null && denominator > 0 ? numerator / denominator : null;
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function addWarning(warnings, message) {
  if (message && !warnings.includes(message)) warnings.push(message);
}

function indexByPitcherAndTeam(rows = []) {
  const byPitcherId = new Map();
  const byGameTeam = new Map();

  for (const row of rows) {
    const pitcherId = toFiniteNumber(row?.pitcherId);
    if (pitcherId != null) byPitcherId.set(String(pitcherId), row);
    if (row?.gameKey && row?.team) byGameTeam.set(`${row.gameKey}|${normalizeTeam(row.team)}`, row);
  }

  return { byPitcherId, byGameTeam };
}

function findJoinedRow(index, row) {
  const pitcherId = toFiniteNumber(row?.pitcherId);
  if (pitcherId != null && index.byPitcherId.has(String(pitcherId))) return index.byPitcherId.get(String(pitcherId));
  return index.byGameTeam.get(`${row?.gameKey}|${normalizeTeam(row?.team)}`) ?? null;
}

function buildLineupIndex(batters = []) {
  const index = new Map();

  for (const batter of batters) {
    const gameKey = batter?.gameKey;
    const team = normalizeTeam(batter?.team);
    if (!gameKey || !team) continue;
    const key = `${gameKey}|${team}`;
    index.set(key, [...(index.get(key) ?? []), batter]);
  }

  return index;
}

function findLineupRows(index, pitcherRow) {
  return index.get(`${pitcherRow?.gameKey}|${normalizeTeam(pitcherRow?.opponent)}`) ?? [];
}

function buildDetailsIndex(details = []) {
  return new Map((details ?? []).map((detail) => [detail?.key, detail]).filter(([key]) => key));
}

function findDetail(detailsIndex, row, slateDate) {
  const key = buildStrikeoutPropDetailKey({
    pitcher: row?.pitcher,
    team: row?.team,
    opponent: row?.opponent,
    gameDate: slateDate,
  });
  return detailsIndex.get(key) ?? null;
}

function deriveRecentKPer9FromDetails(detail) {
  const starts = detail?.pitcherLastFiveStarts ?? [];
  let strikeouts = 0;
  let innings = 0;

  for (const start of starts) {
    const ks = toFiniteNumber(start?.strikeouts);
    const ip = parseMlbInnings(start?.inningsPitched);
    if (ks == null || ks < 0 || ip == null || ip <= 0) continue;
    strikeouts += ks;
    innings += ip;
  }

  return innings > 0 ? (strikeouts / innings) * 9 : null;
}

function buildRecentStartsForV2(detail) {
  return (detail?.pitcherLastFiveStarts ?? []).map((start) => ({
    strikeouts: toFiniteNumber(start?.strikeouts),
    inningsPitched: parseMlbInnings(start?.inningsPitched),
    battersFaced: null,
    pitchCount: null,
  }));
}

function buildRecentVsStartersForV2(detail) {
  return (detail?.opponentLastFiveGames ?? []).map((game) => ({
    opposingStarterStrikeouts: toFiniteNumber(game?.opposingStarterStrikeouts),
    opposingStarterInningsPitched: parseMlbInnings(game?.opposingStarterInningsPitched),
    teamPlateAppearances: null,
    teamTotalStrikeouts: toFiniteNumber(game?.teamTotalStrikeouts),
  }));
}

function buildLineupSummary(lineupRows) {
  const kRate = average(lineupRows.map((row) => toFiniteNumber(row?.kRate)));
  const whiffRate = average(lineupRows.map((row) => toFiniteNumber(row?.whiffRate)));
  const handedness = lineupRows.reduce(
    (acc, row) => {
      const bats = String(row?.bats ?? "").trim().toUpperCase();
      if (bats.startsWith("L")) acc.left += 1;
      else if (bats.startsWith("R")) acc.right += 1;
      else if (bats.startsWith("S")) acc.switch += 1;
      else acc.unknown += 1;
      return acc;
    },
    { left: 0, right: 0, switch: 0, unknown: 0 },
  );

  return {
    hitterCount: lineupRows.length,
    projectedLineupKRate: round(kRate, 4),
    projectedLineupWhiffRate: round(whiffRate, 4),
    battingOrderKnownCount: lineupRows.filter((row) => toFiniteNumber(row?.battingOrder) != null).length,
    lineupStatusCounts: lineupRows.reduce((acc, row) => {
      const status = String(row?.lineupStatus ?? "unknown").trim().toLowerCase() || "unknown";
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {}),
    handedness,
  };
}

function buildAvailability({ rawPitcher, workloadRow, lineupSummary, detail, v2Input }) {
  return {
    pitcher: {
      seasonKRate: rawPitcher?.kRate != null,
      seasonKPer9: rawPitcher?.legacyProjectedK9 != null || rawPitcher?.projectedK9 != null,
      seasonWhiffRate: rawPitcher?.whiffRate != null,
      recentKRate: workloadRow?.pitcherContext?.recentKRate != null,
      recentKPer9: v2Input.pitcher.recentKPer9 != null,
      recentWhiffRate: false,
      homeKRate: false,
      awayKRate: false,
      homeWhiffRate: false,
      awayWhiffRate: false,
      handedness: v2Input.pitcher.handedness != null,
      projectedInnings: v2Input.pitcher.projectedInnings != null,
      projectedBattersFaced: v2Input.pitcher.projectedBattersFaced != null,
      averageBattersFacedPerInning: v2Input.pitcher.averageBattersFacedPerInning != null,
      lastFiveStarts: (detail?.pitcherLastFiveStarts ?? []).length > 0,
      lastFiveBattersFaced: false,
      lastFivePitchCount: false,
    },
    opponent: {
      seasonKRate: workloadRow?.opponentContext?.seasonKRate != null,
      recentKRate: workloadRow?.opponentContext?.recent14KRate != null,
      seasonWhiffRate: false,
      recentWhiffRate: false,
      homeKRate: false,
      awayKRate: false,
      homeWhiffRate: false,
      awayWhiffRate: false,
      vsLhpKRate: false,
      vsRhpKRate: false,
      projectedLineupKRate: lineupSummary.projectedLineupKRate != null,
      projectedLineupWhiffRate: lineupSummary.projectedLineupWhiffRate != null,
      recentVsStarters: (detail?.opponentLastFiveGames ?? []).length > 0,
      recentVsStartersPlateAppearances: false,
    },
    context: {
      workloadRow: workloadRow != null,
      lineupRows: lineupSummary.hitterCount,
      detailRow: detail != null,
    },
  };
}

function buildV2Input({ rawPitcher, workloadRow, lineupSummary, detail, leagueContext, isHome }) {
  const expectedBF = toFiniteNumber(workloadRow?.projection?.expectedBF);
  const expectedInnings = toFiniteNumber(workloadRow?.projection?.expectedInnings);
  const legacyIp = toFiniteNumber(rawPitcher?.legacyProjectedIP ?? rawPitcher?.projectedIP);
  const legacyK9 = toFiniteNumber(rawPitcher?.legacyProjectedK9 ?? rawPitcher?.projectedK9);
  const recentKPer9 = deriveRecentKPer9FromDetails(detail);
  const bfPerInning = expectedBF != null && expectedInnings != null && expectedInnings > 0
    ? expectedBF / expectedInnings
    : null;

  return {
    pitcher: {
      seasonKRate: rawPitcher?.kRate ?? workloadRow?.pitcherContext?.seasonKRate ?? null,
      seasonKPer9: legacyK9,
      seasonWhiffRate: rawPitcher?.whiffRate ?? workloadRow?.pitcherContext?.whiffRate ?? null,
      recentKRate: workloadRow?.pitcherContext?.recentKRate ?? null,
      recentKPer9,
      recentWhiffRate: null,
      homeKRate: null,
      awayKRate: null,
      homeWhiffRate: null,
      awayWhiffRate: null,
      handedness: normalizeHand(rawPitcher?.hand ?? workloadRow?.pitcherContext?.hand),
      projectedInnings: expectedInnings ?? legacyIp,
      projectedBattersFaced: expectedBF,
      averageBattersFacedPerInning: bfPerInning,
      pitchCountTrend: workloadRow?.inputs?.recentPitchAverage ?? null,
      pitcherKScore: null,
      recentStarts: buildRecentStartsForV2(detail),
    },
    opponent: {
      seasonKRate: workloadRow?.opponentContext?.seasonKRate ?? null,
      recentKRate: workloadRow?.opponentContext?.recent14KRate ?? null,
      homeKRate: null,
      awayKRate: null,
      vsLhpKRate: null,
      vsRhpKRate: null,
      seasonWhiffRate: null,
      recentWhiffRate: null,
      homeWhiffRate: null,
      awayWhiffRate: null,
      projectedLineupKRate: lineupSummary.projectedLineupKRate,
      opponentKScore: null,
      matchupRating: null,
      recentVsStarters: buildRecentVsStartersForV2(detail),
    },
    context: {
      pitcherIsHome: Boolean(isHome),
      leagueAverageKRate: leagueContext?.kRate ?? null,
      leagueAverageWhiffRate: leagueContext?.whiffRate ?? null,
    },
  };
}

function buildComparison(legacy, v2, market) {
  return {
    v2MinusLegacyKs:
      v2.projectedStrikeouts != null && legacy.projectedKs != null ? round(v2.projectedStrikeouts - legacy.projectedKs, 3) : null,
    legacyEdgeToLine:
      legacy.projectedKs != null && market.kLine != null ? round(legacy.projectedKs - market.kLine, 3) : null,
    v2EdgeToLine:
      v2.projectedStrikeouts != null && market.kLine != null ? round(v2.projectedStrikeouts - market.kLine, 3) : null,
  };
}

export function buildKPropsShadowArtifact({
  rawPayload,
  workloadPayload = null,
  detailsPayload = null,
  projectStrikeoutsV2,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (typeof projectStrikeoutsV2 !== "function") {
    throw new TypeError("buildKPropsShadowArtifact requires projectStrikeoutsV2");
  }

  const warnings = [];
  const slateDate = rawPayload?.date ?? workloadPayload?.date ?? detailsPayload?.date ?? null;
  if (!slateDate) throw new Error("Unable to build K props shadow artifact without slate date");
  if (!Array.isArray(rawPayload?.pitchers)) throw new Error("rawPayload.pitchers is required");

  if (workloadPayload?.date && workloadPayload.date !== slateDate) {
    addWarning(warnings, `Workload shadow date ${workloadPayload.date} does not match slate date ${slateDate}.`);
  }
  if (detailsPayload?.date && detailsPayload.date !== slateDate) {
    addWarning(warnings, `Strikeout detail date ${detailsPayload.date} does not match slate date ${slateDate}.`);
  }

  const workloadIndex = indexByPitcherAndTeam(workloadPayload?.pitchers ?? []);
  const lineupIndex = buildLineupIndex(rawPayload?.batters ?? []);
  const detailsIndex = buildDetailsIndex(detailsPayload?.details ?? []);

  const rows = rawPayload.pitchers.map((rawPitcher) => {
    const workloadRow = findJoinedRow(workloadIndex, rawPitcher);
    const lineupRows = findLineupRows(lineupIndex, rawPitcher);
    const lineupSummary = buildLineupSummary(lineupRows);
    const detail = findDetail(detailsIndex, rawPitcher, slateDate);
    const isHome = workloadRow?.isHome ?? null;
    const v2Input = buildV2Input({
      rawPitcher,
      workloadRow,
      lineupSummary,
      detail,
      leagueContext: workloadPayload?.leagueContext ?? null,
      isHome,
    });
    const v2 = projectStrikeoutsV2(v2Input);
    const legacy = {
      projectedIP: toFiniteNumber(rawPitcher?.legacyProjectedIP ?? rawPitcher?.projectedIP),
      projectedK9: toFiniteNumber(rawPitcher?.legacyProjectedK9 ?? rawPitcher?.projectedK9),
      projectedKs: toFiniteNumber(rawPitcher?.legacyProjectedKs ?? rawPitcher?.projectedKs),
      projectionSource: rawPitcher?.projectionSource ?? null,
      projectionFallbackReason: rawPitcher?.projectionFallbackReason ?? null,
    };
    const market = {
      kLine: toFiniteNumber(rawPitcher?.kLine),
      oddsOver: rawPitcher?.kOddsOver ?? null,
      oddsUnder: rawPitcher?.kOddsUnder ?? null,
      book: rawPitcher?.kOddsBook ?? null,
      slateDate: rawPitcher?.kOddsSlateDate ?? null,
    };
    const availability = buildAvailability({ rawPitcher, workloadRow, lineupSummary, detail, v2Input });

    return {
      key: buildStrikeoutPropDetailKey({
        pitcher: rawPitcher?.pitcher,
        team: rawPitcher?.team,
        opponent: rawPitcher?.opponent,
        gameDate: slateDate,
      }),
      slateDate,
      game: {
        gameId: toFiniteNumber(rawPitcher?.gameId ?? workloadRow?.gamePk),
        gameKey: rawPitcher?.gameKey ?? workloadRow?.gameKey ?? null,
        gameDate: workloadRow?.gameDate ?? null,
        venue: workloadRow?.venue ?? rawPitcher?.ballpark ?? null,
        pitcherIsHome: isHome,
      },
      pitcher: {
        id: toFiniteNumber(rawPitcher?.pitcherId),
        name: rawPitcher?.pitcher ?? null,
        team: normalizeTeam(rawPitcher?.team),
        opponent: normalizeTeam(rawPitcher?.opponent),
        handedness: v2Input.pitcher.handedness,
      },
      market,
      legacy,
      v2: {
        modelVersion: v2.modelVersion,
        projectedStrikeouts: v2.projectedStrikeouts,
        projectedKRate: v2.projectedKRate,
        projectedBattersFaced: v2.projectedBattersFaced,
        projectedInnings: v2.projectedInnings,
        pitcherSkillRate: v2.pitcherSkillRate,
        opponentEnvironmentRate: v2.opponentEnvironmentRate,
        matchupAdjustment: v2.matchupAdjustment,
        confidence: v2.confidence,
        components: v2.components,
        fallbacks: v2.fallbacks,
        warnings: v2.warnings,
      },
      comparison: buildComparison(legacy, v2, market),
      inputs: {
        v2Input,
        availability,
        workload: workloadRow == null
          ? null
          : {
            role: workloadRow.role ?? null,
            workloadFetchOk: workloadRow.workloadFetchOk === true,
            expectedBF: toFiniteNumber(workloadRow?.projection?.expectedBF),
            expectedInnings: toFiniteNumber(workloadRow?.projection?.expectedInnings),
            expectedPitchLimit: toFiniteNumber(workloadRow?.projection?.expectedPitchLimit),
            recentPitchAverage: toFiniteNumber(workloadRow?.inputs?.recentPitchAverage),
            recentBfAverage: toFiniteNumber(workloadRow?.inputs?.recentBfAverage),
            recentIpAverage: toFiniteNumber(workloadRow?.inputs?.recentIpAverage),
            confidenceGrade: workloadRow?.confidence?.grade ?? null,
            confidenceScore: toFiniteNumber(workloadRow?.confidence?.score),
            flags: workloadRow?.flags ?? [],
          },
        opponent: workloadRow?.opponentContext ?? null,
        lineup: lineupSummary,
        details: detail == null
          ? null
          : {
            pitcherLastFiveStarts: detail.pitcherLastFiveStarts ?? [],
            opponentLastFiveGames: detail.opponentLastFiveGames ?? [],
          },
      },
    };
  }).sort(compareRows);

  const diagnostics = {
    totalRows: rows.length,
    v2ComputedRows: rows.filter((row) => row.v2.projectedStrikeouts != null).length,
    legacyOnlyRows: rows.filter((row) => row.v2.projectedStrikeouts == null && row.legacy.projectedKs != null).length,
    missingWorkloadRows: rows.filter((row) => row.inputs.workload == null).length,
    missingOpponentRows: rows.filter((row) => row.inputs.opponent == null || row.inputs.opponent.seasonKRate == null).length,
    missingLineupRows: rows.filter((row) => row.inputs.lineup.hitterCount === 0).length,
    warnings,
  };

  return {
    schemaVersion: K_PROPS_V2_SHADOW_SCHEMA_VERSION,
    slateDate,
    generatedAt,
    modelVersion: rows.find((row) => row.v2.modelVersion)?.v2.modelVersion ?? "mlb-k-projection-v2-shadow",
    projectionMode: K_PROPS_V2_SHADOW_MODE,
    rows,
    diagnostics,
  };
}
