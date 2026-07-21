/**
 * Public projection of nfl-power-v0.3.0 Stage-1 preseason ratings.
 *
 * Exposes only fields safe for the public NFL power board.
 * Does not surface internalZ, historical trajectory internals,
 * context flags, manual adjustment governance, or uncertainty bands.
 */

import {
  deepFreeze,
  validateNflV03ReviewArtifact,
  type NflV03FullSeasonArtifact,
  type NflV03PreseasonArtifact,
  type NflV03PreseasonRating,
  type NflV03ReviewSeason,
} from "@/lib/nfl/v03Review";

export const NFL_V03_PUBLIC_MODEL_VERSION = "nfl-power-v0.3.0" as const;
export const NFL_V03_PUBLIC_PRESEASON_SEASON = 2026 as const satisfies NflV03ReviewSeason;
export const NFL_V03_PUBLIC_SCALE_CENTER = 50;
export const NFL_V03_PUBLIC_PRESEASON_FILENAME = "preseason-power-ratings.json";
export const NFL_V03_PUBLIC_FULL_SEASON_FILENAME = "full-season-team-metrics.json";

/** Stage-1 files the public surface may reference. Review-only files are excluded. */
export const NFL_V03_PUBLIC_ALLOWED_ARTIFACT_FILES = Object.freeze([
  NFL_V03_PUBLIC_PRESEASON_FILENAME,
  NFL_V03_PUBLIC_FULL_SEASON_FILENAME,
] as const);

export type NflPublicPowerTeam = {
  teamId: string;
  slug: string;
  abbr: string;
  name: string;
  color: string;
  rank: number;
  publicRating: number;
  offenseRating: number;
  defenseRating: number;
  offRank: number;
  defRank: number;
  /** publicRating − 50 (scale center), for vs-center display mode */
  overallVsCenter: number;
  offenseVsCenter: number;
  defenseVsCenter: number;
  rankChange: number | null;
  ratingChange: number | null;
  /** Source-season regular-season record when available, e.g. "12-5" or "12-4-1" */
  sourceRecord: string | null;
};

export type NflPublicPowerBoard = {
  season: NflV03ReviewSeason;
  sourceSeason: number;
  modelVersion: string;
  generatedAt: string;
  formula: string;
  teams: NflPublicPowerTeam[];
};

export type NflCanonicalTeamColor = {
  id: string;
  abbr: string;
  primaryColor: string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatRecord(wins: number, losses: number, ties: number): string {
  if (ties > 0) return `${wins}-${losses}-${ties}`;
  return `${wins}-${losses}`;
}

/** Rank 1 = best. Ties broken by name, then teamId (deterministic). */
export function rankByDescending(
  rows: readonly { key: string; value: number; name: string; teamId: string }[]
): Map<string, number> {
  const sorted = [...rows].sort(
    (a, b) =>
      b.value - a.value ||
      a.name.localeCompare(b.name) ||
      a.teamId.localeCompare(b.teamId)
  );
  return new Map(sorted.map((row, index) => [row.key, index + 1]));
}

export function buildRecordByAbbr(
  fullSeason: NflV03FullSeasonArtifact | null
): Map<string, string> {
  const map = new Map<string, string>();
  if (!fullSeason) return map;
  for (const team of fullSeason.teams) {
    if (
      !isFiniteNumber(team.wins) ||
      !isFiniteNumber(team.losses) ||
      !isFiniteNumber(team.ties)
    ) {
      continue;
    }
    map.set(team.abbr, formatRecord(team.wins, team.losses, team.ties));
  }
  return map;
}

export function buildColorByTeamId(
  teams: readonly NflCanonicalTeamColor[]
): Map<string, string> {
  return new Map(teams.map((team) => [team.id, team.primaryColor]));
}

function projectRating(
  row: NflV03PreseasonRating,
  offRank: number,
  defRank: number,
  color: string,
  sourceRecord: string | null
): NflPublicPowerTeam {
  return {
    teamId: row.teamId,
    slug: row.slug,
    abbr: row.abbr,
    name: row.name,
    color,
    rank: row.rank,
    publicRating: row.publicRating,
    offenseRating: row.offenseRating,
    defenseRating: row.defenseRating,
    offRank,
    defRank,
    overallVsCenter: row.publicRating - NFL_V03_PUBLIC_SCALE_CENTER,
    offenseVsCenter: row.offenseRating - NFL_V03_PUBLIC_SCALE_CENTER,
    defenseVsCenter: row.defenseRating - NFL_V03_PUBLIC_SCALE_CENTER,
    rankChange: row.rankChange,
    ratingChange: row.ratingChange,
    sourceRecord,
  };
}

/**
 * Map a validated preseason artifact (+ optional source-season records and colors)
 * into a frozen public power board. Strips all review-only fields.
 */
export function buildPublicPowerBoard(input: {
  season: NflV03ReviewSeason;
  preseason: NflV03PreseasonArtifact;
  sourceFullSeason?: NflV03FullSeasonArtifact | null;
  colors?: readonly NflCanonicalTeamColor[];
}): NflPublicPowerBoard {
  const { season, preseason } = input;
  if (preseason._meta.modelVersion !== NFL_V03_PUBLIC_MODEL_VERSION) {
    throw new Error(
      `Unexpected modelVersion ${preseason._meta.modelVersion}; expected ${NFL_V03_PUBLIC_MODEL_VERSION}`
    );
  }
  if (preseason._meta.season !== season) {
    throw new Error(
      `Preseason season mismatch: meta ${preseason._meta.season} vs requested ${season}`
    );
  }

  const colorById = buildColorByTeamId(input.colors ?? []);
  const recordByAbbr = buildRecordByAbbr(input.sourceFullSeason ?? null);

  const offRanks = rankByDescending(
    preseason.ratings.map((row) => ({
      key: row.teamId,
      value: row.offenseRating,
      name: row.name,
      teamId: row.teamId,
    }))
  );
  const defRanks = rankByDescending(
    preseason.ratings.map((row) => ({
      key: row.teamId,
      value: row.defenseRating,
      name: row.name,
      teamId: row.teamId,
    }))
  );

  const teams = [...preseason.ratings]
    .map((row) =>
      projectRating(
        row,
        offRanks.get(row.teamId) ?? 32,
        defRanks.get(row.teamId) ?? 32,
        colorById.get(row.teamId) ?? "#0c1f3a",
        recordByAbbr.get(row.abbr) ?? null
      )
    )
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.name.localeCompare(b.name) ||
        a.teamId.localeCompare(b.teamId)
    );

  return deepFreeze({
    season,
    sourceSeason: preseason.sourceSeason,
    modelVersion: preseason._meta.modelVersion,
    generatedAt: preseason._meta.generatedAt,
    formula:
      "40% opponent-adjusted offensive EPA/play + 40% inverted opponent-adjusted defensive EPA/play + 20% opponent-adjusted point differential/game · public scale 50 + 15 × (composite / 0.733), capped to [1, 99]",
    teams,
  });
}

export function parseCanonicalTeamsJson(value: unknown): NflCanonicalTeamColor[] {
  if (!value || typeof value !== "object") {
    throw new Error("teams.json must be an object");
  }
  const teams = (value as { teams?: unknown }).teams;
  if (!Array.isArray(teams)) throw new Error("teams.json.teams must be an array");
  return teams.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`teams.json.teams[${index}] must be an object`);
    }
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.abbr !== "string") {
      throw new Error(`teams.json.teams[${index}] missing id/abbr`);
    }
    if (typeof row.primaryColor !== "string") {
      throw new Error(`teams.json.teams[${index}] missing primaryColor`);
    }
    return {
      id: row.id,
      abbr: row.abbr,
      primaryColor: row.primaryColor,
    };
  });
}

export async function loadPublicPowerBoard(
  season: NflV03ReviewSeason = NFL_V03_PUBLIC_PRESEASON_SEASON,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<NflPublicPowerBoard> {
  const preseasonPath = `/data/nfl/${season}/${NFL_V03_PUBLIC_PRESEASON_FILENAME}`;
  const teamsPath = "/data/nfl/teams.json";

  const [preseasonResponse, teamsResponse] = await Promise.all([
    fetcher(preseasonPath, { cache: "no-store", signal }),
    fetcher(teamsPath, { cache: "no-store", signal }),
  ]);

  if (!preseasonResponse.ok) {
    throw new Error(
      preseasonResponse.status === 404
        ? `${preseasonPath} is missing`
        : `${preseasonPath} returned HTTP ${preseasonResponse.status}`
    );
  }
  if (!teamsResponse.ok) {
    throw new Error(`${teamsPath} returned HTTP ${teamsResponse.status}`);
  }

  const preseasonJson: unknown = await preseasonResponse.json();
  const teamsJson: unknown = await teamsResponse.json();
  const preseason = validateNflV03ReviewArtifact(
    "preseason",
    season,
    preseasonJson,
    preseasonPath
  );
  const colors = parseCanonicalTeamsJson(teamsJson);

  let sourceFullSeason: NflV03FullSeasonArtifact | null = null;
  const sourceSeason = preseason.sourceSeason;
  if (
    Number.isInteger(sourceSeason) &&
    sourceSeason >= 2022 &&
    sourceSeason <= 2026
  ) {
    const fullPath = `/data/nfl/${sourceSeason}/${NFL_V03_PUBLIC_FULL_SEASON_FILENAME}`;
    const fullResponse = await fetcher(fullPath, { cache: "no-store", signal });
    if (fullResponse.ok) {
      const fullJson: unknown = await fullResponse.json();
      sourceFullSeason = validateNflV03ReviewArtifact(
        "fullSeason",
        sourceSeason as NflV03ReviewSeason,
        fullJson,
        fullPath
      );
    }
  }

  return buildPublicPowerBoard({
    season,
    preseason,
    sourceFullSeason,
    colors,
  });
}
