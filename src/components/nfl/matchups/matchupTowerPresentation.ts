import type { NflMatchupTeam } from "@/lib/nfl/matchups";

/** Already-resolved presentation data. Charts never derive ranks or metric winners. */
export type MatchupTowerSidePresentation = {
  team: NflMatchupTeam;
  color: string;
  identityLabel: string;
  accessibleIdentityLabel?: string;
  formatted: string;
  rank: number | null;
  heightPercent: number | null;
};

export type MatchupTowerMetricPresentation = {
  id: string;
  label: string;
  shortLabel?: string;
  contextLabel?: string;
  pairingLabel?: string;
  away: MatchupTowerSidePresentation;
  home: MatchupTowerSidePresentation;
  badge?: { label: string; color: string };
};
