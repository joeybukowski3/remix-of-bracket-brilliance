import type { PgaScheduleFeedEntry } from "@/components/pga/PgaHubShared";
import { normalizePlayerKey } from "@/lib/pga/historyModel";
import { buildPgaPlayerLookup, resolvePgaPlayerMatch, type PgaPlayerRecord } from "@/lib/pga/playerIdentity";

export type PgaCurrentField = {
  tournament: string;
  tournamentId?: string;
  tournamentSlug?: string;
  localScheduleId?: string;
  source: string;
  sourceUrl?: string;
  validated?: boolean;
  fieldCount?: number;
  alternatesExcluded?: boolean;
  fetchedAt?: string;
  players: string[];
  playerDetails?: Array<{
    id: string;
    name: string;
  }>;
};

export function isPgaCurrentField(value: unknown): value is PgaCurrentField {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && typeof (value as PgaCurrentField).tournament === "string"
    && Array.isArray((value as PgaCurrentField).players);
}

export function pgaCurrentFieldMatchesEvent(field: PgaCurrentField, event: PgaScheduleFeedEntry) {
  const expected = new Set([event.id, event.slug, event.name, event.shortName].filter(Boolean).map(normalizePgaEventIdentity));
  return [field.localScheduleId, field.tournamentSlug, field.tournament]
    .filter(Boolean)
    .map(normalizePgaEventIdentity)
    .some((value) => expected.has(value));
}

export function isPgaCurrentFieldUsable(field: PgaCurrentField | null, event: PgaScheduleFeedEntry | null) {
  return Boolean(
    field
    && event
    && pgaCurrentFieldMatchesEvent(field, event)
    && field.validated !== false
    && field.players.length > 0,
  );
}

export function buildPgaCurrentFieldKeys<T extends PgaPlayerRecord>(
  field: PgaCurrentField | null,
  usable: boolean,
  playerPool: readonly T[],
) {
  if (!usable || !field) return new Set<string>();
  const lookup = buildPgaPlayerLookup(playerPool);
  return new Set(field.players.map((player) => {
    const match = resolvePgaPlayerMatch(player, lookup);
    return normalizePlayerKey(match.matchedPlayer?.player ?? player);
  }));
}

export function buildPgaCurrentFieldPlayerIdMap<T extends PgaPlayerRecord>(
  field: PgaCurrentField | null,
  playerPool: readonly T[],
) {
  const lookup = buildPgaPlayerLookup(playerPool);
  return new Map((field?.playerDetails ?? []).map((player) => {
    const match = resolvePgaPlayerMatch(player.name, lookup);
    return [normalizePlayerKey(match.matchedPlayer?.player ?? player.name), player.id];
  }));
}

export function normalizePgaEventIdentity(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(the|presented by|championship|tournament|2026|picks)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
