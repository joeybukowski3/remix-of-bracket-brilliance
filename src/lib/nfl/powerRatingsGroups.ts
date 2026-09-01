/**
 * Page-level view grouping for /nfl/power-ratings — League / Conference / Division.
 *
 * Presentation only: this module partitions the board's already-sorted row
 * array by each row's canonical `conference` / `division` (sourced from
 * public/data/nfl/teams.json via useNflPowerRatingsBoard). It does not compute,
 * re-rank, or re-heat anything — ranks, ratings, and JKB Heat stay whatever the
 * league-wide board already resolved.
 *
 * Grouping a globally-sorted array by a predicate preserves the comparator's
 * order within each group (a total order restricted to a subset is still
 * sorted), so callers should sort the full board once and group the result —
 * never sort per group.
 */

import type { PowerRatingsRow } from "@/hooks/useNflPowerRatingsBoard";

export const POWER_RATINGS_GROUP_VIEWS = ["league", "conference", "division"] as const;
export type PowerRatingsGroupView = (typeof POWER_RATINGS_GROUP_VIEWS)[number];

export const POWER_RATINGS_GROUP_VIEW_LABELS: Record<PowerRatingsGroupView, string> = {
  league: "League",
  conference: "Conference",
  division: "Division",
};

export type PowerRatingsGroup = {
  key: string;
  eyebrow: string;
  name: string;
  rows: PowerRatingsRow[];
};

const CONFERENCE_ORDER = ["AFC", "NFC"] as const;

/** Display order only — team-to-conference/division identity comes from the canonical row data. */
const DIVISION_ORDER = [
  "AFC East",
  "AFC North",
  "AFC South",
  "AFC West",
  "NFC East",
  "NFC North",
  "NFC South",
  "NFC West",
] as const;

export function groupRowsByConference(rows: readonly PowerRatingsRow[]): PowerRatingsGroup[] {
  return CONFERENCE_ORDER.map((conference) => ({
    key: conference,
    eyebrow: "Conference",
    name: conference,
    rows: rows.filter((row) => row.conference === conference),
  }));
}

export function groupRowsByDivision(rows: readonly PowerRatingsRow[]): PowerRatingsGroup[] {
  return DIVISION_ORDER.map((division) => ({
    key: division,
    eyebrow: "Division",
    name: division,
    rows: rows.filter((row) => row.division === division),
  }));
}
