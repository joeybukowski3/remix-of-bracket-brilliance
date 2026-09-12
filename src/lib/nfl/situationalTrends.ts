export const NFL_SITUATIONAL_TRENDS_PATH = "/data/nfl/2026/situational-trend-matchups.json";

export type TrendTier = "NOTEWORTHY" | "CONTEXTUAL" | "CLASSIC_ANGLE";
export type TrendResearchPhase = "PHASE_1" | "PHASE_2B";
export type TrendHistoricalDirection = "POSITIVE" | "NEGATIVE" | "MIXED" | "NO_BROAD_EDGE";
export type TrendQualificationStatus =
  | "CONFIRMED"
  | "AWAITING_MARKET"
  | "AWAITING_PRIOR_RESULT"
  | "UNAVAILABLE"
  | "NOT_APPLICABLE";

export type SituationalTrendMetrics = {
  qualifyingTeamGames: number;
  atsWins: number;
  atsLosses: number;
  atsPushes: number;
  atsWinPct: number | null;
  atsRoiAtMinus110: number | null;
  sampleSizeLabel: string | null;
};

export type SituationalTrendVariant = {
  id: string;
  label: string;
  definition: string | null;
  fullHistory: SituationalTrendMetrics;
  recentForm: SituationalTrendMetrics;
  classification: string;
  confidence: string;
};

export type SituationalTrendResearch = {
  id: string;
  name: string;
  definition: string;
  category: string;
  researchPhase: TrendResearchPhase;
  classification: string;
  confidence: string;
  recentEvidenceClassification: string;
  fullHistory: SituationalTrendMetrics;
  recentForm: SituationalTrendMetrics;
  robustnessLabel: string | null;
  robustnessInterpretation: string | null;
  articleNote: string;
  stability: {
    eraDirectionReverses?: boolean;
    recentMateriallyDiffersFromFullHistory?: boolean;
    recentChange?: string;
  } | null;
  variants: SituationalTrendVariant[];
  tier: TrendTier;
  historicalDirection: TrendHistoricalDirection;
};

export type SituationalTrendEvaluation = {
  gameId: string;
  team: string;
  trendId: string;
  status: Exclude<TrendQualificationStatus, "NOT_APPLICABLE">;
  reason: string;
  variantIds: string[];
  tier: TrendTier;
  classification: string;
  confidence: string;
};

export type SituationalTrendGame = {
  gameId: string;
  week: number;
  away: string;
  home: string;
  awayName: string;
  homeName: string;
  gameSlug: string | null;
  kickoff: string | null;
  status: "final" | "scheduled";
  qualifiers: SituationalTrendEvaluation[];
  pending: SituationalTrendEvaluation[];
};

export type NflSituationalTrendsArtifact = {
  schemaVersion: "nfl-situational-trend-matchups-v1";
  season: number;
  generatedAt: null;
  asOf: { schedule: string | null; results: string | null; market: string | null };
  sources: Record<string, string>;
  definitionVersions: { phase1: string; phase2: string; phase2b: string };
  evaluatedTrendIds: string[];
  researchLibrary: SituationalTrendResearch[];
  games: SituationalTrendGame[];
  limitations: string[];
};

export type ResolvedTrendQualifier = SituationalTrendEvaluation & {
  trend: SituationalTrendResearch;
  variants: SituationalTrendVariant[];
};

const TIER_ORDER: Record<TrendTier, number> = {
  NOTEWORTHY: 3,
  CONTEXTUAL: 2,
  CLASSIC_ANGLE: 1,
};

const ROBUSTNESS_ORDER: Record<string, number> = {
  "BROADLY SUPPORTED": 4,
  "SUBGROUP-DEPENDENT": 3,
  "ERA-DEPENDENT": 2,
  "WEAK / NO BROAD EDGE": 1,
};

const CLASSIFICATION_ORDER: Record<string, number> = {
  "HISTORICALLY MEANINGFUL": 4,
  "CONTEXT-DEPENDENT": 3,
  "LITTLE/NO EVIDENCE": 2,
  "INSUFFICIENT DATA": 1,
};

const CONFIDENCE_ORDER: Record<string, number> = { High: 3, Moderate: 2, Low: 1 };

function stabilityWeight(trend: SituationalTrendResearch): number {
  if (trend.stability?.eraDirectionReverses) return 0;
  return trend.stability?.recentChange === "STABLE" ? 2 : 1;
}

/** Deterministic evidence ordering; ATS percentage is deliberately not a sort key. */
export function compareTrendEvidence(a: SituationalTrendResearch, b: SituationalTrendResearch): number {
  return (
    TIER_ORDER[b.tier] - TIER_ORDER[a.tier] ||
    (ROBUSTNESS_ORDER[b.robustnessLabel ?? ""] ?? 0) - (ROBUSTNESS_ORDER[a.robustnessLabel ?? ""] ?? 0) ||
    (CLASSIFICATION_ORDER[b.classification] ?? 0) - (CLASSIFICATION_ORDER[a.classification] ?? 0) ||
    (CONFIDENCE_ORDER[b.confidence] ?? 0) - (CONFIDENCE_ORDER[a.confidence] ?? 0) ||
    b.fullHistory.qualifyingTeamGames - a.fullHistory.qualifyingTeamGames ||
    stabilityWeight(b) - stabilityWeight(a) ||
    a.name.localeCompare(b.name)
  );
}

export function rankTrendResearch(trends: readonly SituationalTrendResearch[]): SituationalTrendResearch[] {
  return [...trends].sort(compareTrendEvidence);
}

export function isNflSituationalTrendsArtifact(value: unknown): value is NflSituationalTrendsArtifact {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NflSituationalTrendsArtifact>;
  return candidate.schemaVersion === "nfl-situational-trend-matchups-v1" &&
    candidate.season === 2026 &&
    Array.isArray(candidate.researchLibrary) && candidate.researchLibrary.length === 24 &&
    Array.isArray(candidate.games) &&
    candidate.games.every((game) => Boolean(
      game && typeof game === "object" &&
      Array.isArray((game as SituationalTrendGame).qualifiers) &&
      Array.isArray((game as SituationalTrendGame).pending),
    ));
}

export function trendById(artifact: NflSituationalTrendsArtifact | null, trendId: string): SituationalTrendResearch | null {
  return artifact?.researchLibrary.find((trend) => trend.id === trendId) ?? null;
}

export function gameById(artifact: NflSituationalTrendsArtifact | null, gameId: string): SituationalTrendGame | null {
  return artifact?.games.find((game) => game.gameId === gameId) ?? null;
}

export function resolveGameQualifiers(
  artifact: NflSituationalTrendsArtifact | null,
  gameId: string,
): ResolvedTrendQualifier[] {
  const game = gameById(artifact, gameId);
  if (!artifact || !game) return [];
  const byId = new Map(artifact.researchLibrary.map((trend) => [trend.id, trend]));
  return game.qualifiers.flatMap((qualifier) => {
    const trend = byId.get(qualifier.trendId);
    if (!trend) return [];
    const variants = qualifier.variantIds.flatMap((id) => {
      const variant = trend.variants.find((candidate) => candidate.id === id);
      return variant ? [variant] : [];
    });
    return [{ ...qualifier, trend, variants }];
  }).sort((a, b) => compareTrendEvidence(a.trend, b.trend) || a.team.localeCompare(b.team));
}

export function qualificationStatusFor(
  game: SituationalTrendGame,
  trendId: string,
  team: string,
): TrendQualificationStatus {
  if (game.qualifiers.some((row) => row.trendId === trendId && row.team === team)) return "CONFIRMED";
  return game.pending.find((row) => row.trendId === trendId && row.team === team)?.status ?? "NOT_APPLICABLE";
}

export type TrendLibraryFilters = {
  search?: string;
  category?: string;
  classification?: string;
  confidence?: string;
  direction?: TrendHistoricalDirection | "ALL";
  researchPhase?: TrendResearchPhase | "ALL";
};

export function filterTrendLibrary(
  trends: readonly SituationalTrendResearch[],
  filters: TrendLibraryFilters,
): SituationalTrendResearch[] {
  const query = filters.search?.trim().toLowerCase() ?? "";
  return rankTrendResearch(trends.filter((trend) => {
    const searchable = `${trend.name} ${trend.definition} ${trend.category} ${trend.classification} ${trend.articleNote}`.toLowerCase();
    return (!query || searchable.includes(query)) &&
      (!filters.category || filters.category === "ALL" || trend.category === filters.category) &&
      (!filters.classification || filters.classification === "ALL" || trend.classification === filters.classification) &&
      (!filters.confidence || filters.confidence === "ALL" || trend.confidence === filters.confidence) &&
      (!filters.direction || filters.direction === "ALL" || trend.historicalDirection === filters.direction) &&
      (!filters.researchPhase || filters.researchPhase === "ALL" || trend.researchPhase === filters.researchPhase);
  }));
}

export type TrendGameFilters = {
  search?: string;
  week?: number | "ALL";
  trendId?: string;
  tier?: TrendTier | "ALL";
  classification?: string;
  noteworthyOnly?: boolean;
};

export function filterTrendGames(games: readonly SituationalTrendGame[], filters: TrendGameFilters): SituationalTrendGame[] {
  const query = filters.search?.trim().toLowerCase() ?? "";
  return games.filter((game) => {
    if (game.status === "final") return false;
    if (query && !`${game.away} ${game.home} ${game.awayName} ${game.homeName}`.toLowerCase().includes(query)) return false;
    if (filters.week !== undefined && filters.week !== "ALL" && game.week !== filters.week) return false;
    const considered = [...game.qualifiers, ...game.pending];
    if (filters.trendId && filters.trendId !== "ALL" && !considered.some((row) => row.trendId === filters.trendId)) return false;
    if (filters.tier && filters.tier !== "ALL" && !considered.some((row) => row.tier === filters.tier)) return false;
    if (filters.classification && filters.classification !== "ALL" && !considered.some((row) => row.classification === filters.classification)) return false;
    if (filters.noteworthyOnly && !considered.some((row) => row.tier === "NOTEWORTHY")) return false;
    return true;
  });
}

export function currentQualifyingGamesForTrend(
  games: readonly SituationalTrendGame[],
  trendId: string,
): SituationalTrendGame[] {
  return games.filter((game) => game.status !== "final" && game.qualifiers.some((row) => row.trendId === trendId));
}

export function formatTrendRecord(metrics: SituationalTrendMetrics): string {
  return `${metrics.atsWins}-${metrics.atsLosses}-${metrics.atsPushes}`;
}

export function formatTrendPercent(value: number | null): string {
  return value == null ? "N/A" : `${(value * 100).toFixed(1)}%`;
}

export function formatTrendRoi(value: number | null): string {
  if (value == null) return "N/A";
  const percentage = value * 100;
  return `${percentage > 0 ? "+" : percentage < 0 ? "−" : ""}${Math.abs(percentage).toFixed(1)}%`;
}

export const TREND_TIER_LABELS: Record<TrendTier, string> = {
  NOTEWORTHY: "Noteworthy",
  CONTEXTUAL: "Contextual",
  CLASSIC_ANGLE: "Classic angle",
};

export const TREND_STATUS_LABELS: Record<TrendQualificationStatus, string> = {
  CONFIRMED: "Confirmed",
  AWAITING_MARKET: "Awaiting market",
  AWAITING_PRIOR_RESULT: "Awaiting prior-game result",
  UNAVAILABLE: "Unavailable",
  NOT_APPLICABLE: "Not applicable",
};
