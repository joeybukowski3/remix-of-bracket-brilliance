// Compact freshness/status classification for the /mlb/performance-preview
// tracker header. Deliberately separate from "zero rows matched the current
// filter" (that is a normal, non-error state rendered by the result table
// itself) -- this module only classifies the health of the underlying data
// pipeline: fresh, stale, or failed to load.
//
// "Stale" is judged from generatedAt age, never from a per-tracker asOfDate
// field -- Numerology's asOfDate is known to lag its own generatedAt by up
// to a day (see audit), so deriving staleness from it would produce a
// self-contradictory label.

const STALE_AFTER_HOURS = 36;

export type FreshnessLevel = "fresh" | "stale" | "error";

export interface FreshnessStatusResult {
  level: FreshnessLevel;
  label: string;
  detail: string | null;
}

export interface ComputeFreshnessParams {
  generatedAt: string | null;
  gradedThrough: string | null;
  hasError: boolean;
  errorMessage?: string | null;
  pendingCount?: number;
  now?: Date;
}

function formatGeneratedAt(generatedAt: string): string {
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) return generatedAt;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function computeFreshnessStatus({
  generatedAt,
  gradedThrough,
  hasError,
  errorMessage,
  pendingCount = 0,
  now = new Date(),
}: ComputeFreshnessParams): FreshnessStatusResult {
  if (hasError) {
    return { level: "error", label: "Data unavailable", detail: errorMessage ?? "Failed to load tracker data." };
  }

  if (!generatedAt) {
    return { level: "error", label: "Data unavailable", detail: "No generation timestamp present." };
  }

  const generated = new Date(generatedAt);
  const ageHours = Number.isNaN(generated.getTime()) ? null : (now.getTime() - generated.getTime()) / (1000 * 60 * 60);
  const isStale = ageHours == null || ageHours > STALE_AFTER_HOURS;

  const base = `Updated ${formatGeneratedAt(generatedAt)}${gradedThrough ? ` · Graded through ${gradedThrough}` : ""}`;
  const pendingNote = pendingCount > 0 ? ` · ${pendingCount} pending` : "";

  return {
    level: isStale ? "stale" : "fresh",
    label: isStale ? "Stale" : "Fresh",
    detail: `${base}${pendingNote}`,
  };
}
