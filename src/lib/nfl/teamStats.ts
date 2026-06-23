export type NflTeamStatRow = {
  key: string;
  label: string;
  value: number | null;
  displayValue: string;
  rank: number | null;
};

export type NflTeamStatsResponse = {
  source: "espn";
  season: 2025;
  team: string;
  updatedAt: string;
  stale?: boolean;
  offense: NflTeamStatRow[];
  defense: NflTeamStatRow[];
};

type EspnStat = {
  name?: string;
  displayName?: string;
  value?: number;
  displayValue?: string;
  perGameValue?: number;
  perGameDisplayValue?: string;
  rank?: number;
};

type EspnCategory = {
  name?: string;
  displayName?: string;
  stats?: EspnStat[];
};

type EspnStatisticsPayload = {
  results?: {
    stats?: { categories?: EspnCategory[] } | EspnCategory[];
    opponent?: EspnCategory[];
  };
};

type StatSpec = {
  key: string;
  label: string;
  names: string[];
  perGame?: boolean;
  categories?: string[];
};

const OFFENSE_SPECS: StatSpec[] = [
  { key: "pointsPerGame", label: "Points per game", names: ["totalPointsPerGame"] },
  { key: "yardsPerGame", label: "Yards per game", names: ["totalYards"], perGame: true },
  { key: "playsPerGame", label: "Plays per game", names: ["totalOffensivePlays"], perGame: true },
  { key: "timeOfPossession", label: "Time of possession", names: ["avgTimeOfPossession"] },
  { key: "thirdDownPct", label: "3rd down conversion", names: ["thirdDownConvPct"] },
  { key: "yardsPerPlay", label: "Yards per play", names: ["yardsPerPlay"] },
  { key: "rushYardsPerGame", label: "Rush yards per game", names: ["rushingYards"], perGame: true },
  { key: "rushYardsPerAttempt", label: "Yards per rush", names: ["yardsPerRushAttempt"] },
  { key: "completionPct", label: "Completion percentage", names: ["completionPct"] },
  { key: "passYardsPerGame", label: "Pass yards per game", names: ["netPassingYards", "passingYards"], perGame: true },
  { key: "passYardsPerAttempt", label: "Yards per pass", names: ["netYardsPerPassAttempt", "yardsPerPassAttempt"] },
  { key: "giveawaysPerGame", label: "Giveaways per game", names: ["totalGiveaways"], perGame: true },
];

const DEFENSE_OPPONENT_SPECS: StatSpec[] = [
  { key: "pointsAllowedPerGame", label: "Points allowed per game", names: ["totalPointsPerGame"] },
  { key: "yardsAllowedPerGame", label: "Yards allowed per game", names: ["totalYards"], perGame: true },
  { key: "thirdDownAllowedPct", label: "3rd down conversion allowed", names: ["thirdDownConvPct"] },
  { key: "yardsAllowedPerPlay", label: "Yards allowed per play", names: ["yardsPerPlay"] },
  { key: "rushYardsAllowedPerGame", label: "Rush yards allowed per game", names: ["rushingYards"], perGame: true },
  { key: "rushYardsAllowedPerAttempt", label: "Yards allowed per rush", names: ["yardsPerRushAttempt"] },
  { key: "completionPctAllowed", label: "Completion percentage allowed", names: ["completionPct"] },
  { key: "passYardsAllowedPerGame", label: "Pass yards allowed per game", names: ["netPassingYards", "passingYards"], perGame: true },
  { key: "passYardsAllowedPerAttempt", label: "Yards allowed per pass", names: ["netYardsPerPassAttempt", "yardsPerPassAttempt"] },
];

const DEFENSE_TEAM_SPECS: StatSpec[] = [
  { key: "sacksPerGame", label: "Sacks per game", names: ["sacks"], perGame: true, categories: ["defensive"] },
  { key: "takeawaysPerGame", label: "Takeaways per game", names: ["totalTakeaways"], perGame: true },
];

function asCategories(value: EspnStatisticsPayload["results"] extends infer _T ? unknown : never): EspnCategory[] {
  if (Array.isArray(value)) return value as EspnCategory[];
  if (value && typeof value === "object" && Array.isArray((value as { categories?: unknown }).categories)) {
    return (value as { categories: EspnCategory[] }).categories;
  }
  return [];
}

function normalizeName(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findStat(categories: EspnCategory[], spec: StatSpec): EspnStat | null {
  const allowedCategories = spec.categories?.map(normalizeName) ?? null;
  const names = spec.names.map(normalizeName);

  for (const category of categories) {
    if (allowedCategories && !allowedCategories.includes(normalizeName(category.name))) continue;
    const stat = category.stats?.find((entry) => names.includes(normalizeName(entry.name)));
    if (stat) return stat;
  }
  return null;
}

function decimal(value: number, digits = 1) {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function displayStat(stat: EspnStat, perGame: boolean) {
  if (perGame) {
    if (stat.perGameDisplayValue) return stat.perGameDisplayValue;
    if (Number.isFinite(stat.perGameValue)) return decimal(Number(stat.perGameValue));
  }
  if (stat.displayValue) return stat.displayValue;
  if (Number.isFinite(stat.value)) return decimal(Number(stat.value));
  return "—";
}

function numericStat(stat: EspnStat, perGame: boolean) {
  const value = perGame ? stat.perGameValue : stat.value;
  return Number.isFinite(value) ? Number(value) : null;
}

function buildRows(categories: EspnCategory[], specs: StatSpec[]): NflTeamStatRow[] {
  return specs.flatMap((spec) => {
    const stat = findStat(categories, spec);
    if (!stat) return [];
    return [{
      key: spec.key,
      label: spec.label,
      value: numericStat(stat, Boolean(spec.perGame)),
      displayValue: displayStat(stat, Boolean(spec.perGame)),
      rank: Number.isFinite(stat.rank) ? Number(stat.rank) : null,
    }];
  });
}

export function normalizeNflTeamStats(payload: unknown): Pick<NflTeamStatsResponse, "offense" | "defense"> {
  const results = (payload as EspnStatisticsPayload | null)?.results;
  const teamCategories = asCategories(results?.stats);
  const opponentCategories = Array.isArray(results?.opponent) ? results?.opponent ?? [] : [];

  const offense = buildRows(teamCategories, OFFENSE_SPECS);
  const defense = [
    ...buildRows(opponentCategories, DEFENSE_OPPONENT_SPECS),
    ...buildRows(teamCategories, DEFENSE_TEAM_SPECS),
  ];

  return { offense, defense };
}
