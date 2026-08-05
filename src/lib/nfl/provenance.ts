export const NFL_SOURCE_KINDS = [
  "model",
  "market",
  "previous-season",
  "schedule",
  "external",
  "editorial",
  "unavailable",
] as const;

export type NflSourceKind = (typeof NFL_SOURCE_KINDS)[number];

export const NFL_SOURCE_KIND_LABELS: Record<NflSourceKind, string> = {
  model: "Model",
  market: "Market",
  "previous-season": "Previous season",
  schedule: "Schedule",
  external: "External source",
  editorial: "Editorial",
  unavailable: "Unavailable",
};

export type NflProvenanceViewModel = {
  sourceKind: NflSourceKind;
  sourceLabel?: string | null;
  generatedAt?: string | null;
  retrievedAt?: string | null;
  sourceUpdatedAt?: string | null;
  season?: number | null;
  week?: number | null;
  validationStatus?: string | null;
};

export function formatNflMetadataTimestamp(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const dateOnly = new Date(`${value}T12:00:00Z`);
    return Number.isNaN(dateOnly.getTime())
      ? value
      : dateOnly.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        });
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? value
    : timestamp.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}
