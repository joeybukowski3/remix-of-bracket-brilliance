/**
 * Structured availability of the NFL Command Center's supporting data modules.
 * Warning copy is built from module IDs only -- never from raw loader errors,
 * which can contain fetch URLs, HTTP statuses, or file paths.
 */
export const NFL_COMMAND_CENTER_MODULE_IDS = ["market", "spreadProjections", "jkbTotals", "currentPowerRatings", "fantasyRankings"] as const;

export type NflCommandCenterModuleId = (typeof NFL_COMMAND_CENTER_MODULE_IDS)[number];

export const NFL_COMMAND_CENTER_MODULE_LABELS: Readonly<Record<NflCommandCenterModuleId, string>> = {
  market: "Market data",
  spreadProjections: "Spread projections",
  jkbTotals: "JKB totals",
  currentPowerRatings: "Current power ratings",
  fantasyRankings: "Fantasy rankings",
};

interface ArtifactLoaderState {
  loading: boolean;
  error: string | null;
}

export interface NflModuleLoaderStates {
  market: ArtifactLoaderState;
  spreadProjections: ArtifactLoaderState;
  jkbTotals: ArtifactLoaderState;
  currentPowerRatings: ArtifactLoaderState;
  fantasyStatus: "loading" | "ready" | "missing" | "error";
}

/** A module is unavailable only when its own loader has settled into an error/missing state. */
export function deriveUnavailableModules(states: NflModuleLoaderStates): NflCommandCenterModuleId[] {
  const failed: Record<NflCommandCenterModuleId, boolean> = {
    market: !states.market.loading && states.market.error !== null,
    spreadProjections: !states.spreadProjections.loading && states.spreadProjections.error !== null,
    jkbTotals: !states.jkbTotals.loading && states.jkbTotals.error !== null,
    currentPowerRatings: !states.currentPowerRatings.loading && states.currentPowerRatings.error !== null,
    fantasyRankings: states.fantasyStatus === "missing" || states.fantasyStatus === "error",
  };
  return NFL_COMMAND_CENTER_MODULE_IDS.filter((id) => failed[id]);
}

function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 2) return labels.join(" and ");
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/** Returns null when every supporting module is available. */
export function formatSupportingDataWarning(
  unavailable: readonly NflCommandCenterModuleId[],
  week: number,
): string | null {
  const ordered = NFL_COMMAND_CENTER_MODULE_IDS.filter((id) => unavailable.includes(id));
  if (ordered.length === 0) return null;

  const labels = ordered.map((id) => NFL_COMMAND_CENTER_MODULE_LABELS[id]);
  const onlyRatings = ordered.length === 1 && ordered[0] === "currentPowerRatings";
  const scope = onlyRatings ? "" : ` for Week ${week}`;
  const lead = `${joinLabels(labels)} unavailable${scope}.`;

  if (ordered.length === 1 && ordered[0] === "fantasyRankings") {
    const remaining = NFL_COMMAND_CENTER_MODULE_IDS.filter((id) => id !== "fantasyRankings").map((id) => NFL_COMMAND_CENTER_MODULE_LABELS[id]);
    return `${lead} Schedule, ${joinLabels(remaining)} remain available.`;
  }
  if (ordered.length === 1) return `${lead} Schedule and other available modules continue normally.`;
  return `${lead} Other available modules continue normally.`;
}
