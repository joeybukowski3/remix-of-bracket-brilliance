import type { ComponentType, SVGProps } from "react";
import { AlertCircle, AlertTriangle, CalendarOff, CheckCircle2, Clock, Loader2, Users } from "lucide-react";
import type { MlbDataStatus } from "@/lib/mlb/mlbDataStatus";
import { cn } from "@/lib/utils";

export interface FreshnessStatusProps {
  status: MlbDataStatus;
  compact?: boolean;
  className?: string;
}

type Tone = "neutral" | "positive" | "caution" | "error";
type LiveRegionRole = "status" | "alert";

interface StatusContent {
  tone: Tone;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  spin: boolean;
  primary: string;
  secondary: string;
  /** Whether `secondary` must still render in compact mode -- caution/error/retained-data reasons must never disappear just because the surface is compact. */
  showSecondaryInCompact: boolean;
  role: LiveRegionRole;
  ariaLive: "polite" | "assertive";
}

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "border-border bg-muted/60 text-muted-foreground",
  positive: "border-success/30 bg-success/10 text-success",
  caution: "border-amber-300 bg-amber-50 text-amber-900",
  error: "border-destructive/50 bg-destructive/10 text-destructive",
};

/**
 * `generatedAt` is an arbitrary upstream ISO string -- never trusted to
 * parse cleanly. Returns null (never throws, never echoes the raw input)
 * so callers can safely fall back to non-timestamp copy.
 */
function formatGeneratedAt(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${formatted} ET`;
}

/**
 * Same noon-UTC-anchor + round-trip technique as
 * `mlbDataStatus.ts`'s `isValidSlateDateString` -- rejects malformed
 * strings like "2026-02-30" that `new Date(...)` would otherwise silently
 * roll over. Never throws; falls back to "the selected" so callers always
 * get grammatically valid copy.
 */
function formatSlateDate(value: string | null | undefined): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "the selected";
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "the selected";
  if (parsed.toISOString().slice(0, 10) !== value) return "the selected";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parsed);
}

function buildLineupPendingSecondary(confirmedCount: number, totalCount: number): string {
  if (totalCount === 1) {
    return confirmedCount === 0 ? "The listed batter is not confirmed yet." : "The listed batter is confirmed.";
  }
  if (confirmedCount === 0) {
    return `None of the ${totalCount} listed batters are confirmed yet.`;
  }
  return `${confirmedCount} of ${totalCount} listed batters are confirmed.`;
}

/** Optional trailing context for the retained-data error state -- omitted entirely when nothing safely formattable is available. */
function buildRetainedMetadata(slateDate: string | undefined, generatedAt: string | undefined): string | null {
  const parts: string[] = [];
  if (slateDate) parts.push(`retained data is for ${formatSlateDate(slateDate)}`);
  const formattedGeneratedAt = formatGeneratedAt(generatedAt);
  if (formattedGeneratedAt) parts.push(`generated ${formattedGeneratedAt}`);
  if (parts.length === 0) return null;
  return `${parts[0][0].toUpperCase()}${parts.join(", ").slice(1)}.`;
}

function getStatusContent(status: MlbDataStatus): StatusContent {
  switch (status.kind) {
    case "loading":
      return {
        tone: "neutral",
        icon: Loader2,
        spin: true,
        primary: "Loading MLB model data",
        secondary: "Checking the latest available slate.",
        showSecondaryInCompact: false,
        role: "status",
        ariaLive: "polite",
      };

    case "current": {
      const formatted = formatGeneratedAt(status.generatedAt);
      return {
        tone: "positive",
        icon: CheckCircle2,
        spin: false,
        primary: "Current slate data",
        secondary: formatted ? `Model updated ${formatted}.` : "Model data is available for today’s slate.",
        showSecondaryInCompact: false,
        role: "status",
        ariaLive: "polite",
      };
    }

    case "lineup-pending":
      return {
        tone: "neutral",
        icon: Users,
        spin: false,
        primary: "Lineups still updating",
        secondary: buildLineupPendingSecondary(status.confirmedCount, status.totalCount),
        showSecondaryInCompact: true,
        role: "status",
        ariaLive: "polite",
      };

    case "waiting-for-slate":
      return {
        tone: "neutral",
        icon: Clock,
        spin: false,
        primary: "Waiting for today’s slate",
        secondary: `Next scheduled update: ${status.nextRunAt.label}.`,
        showSecondaryInCompact: false,
        role: "status",
        ariaLive: "polite",
      };

    case "no-games-scheduled":
      return {
        tone: "neutral",
        icon: CalendarOff,
        spin: false,
        primary: "No MLB games currently listed",
        secondary: `No games are available for the ${formatSlateDate(status.slateDate)} slate.`,
        showSecondaryInCompact: false,
        role: "status",
        ariaLive: "polite",
      };

    case "stale":
      return {
        tone: "caution",
        icon: AlertTriangle,
        spin: false,
        primary: status.direction === "past" ? "Showing an earlier MLB slate" : "Showing a future MLB slate",
        secondary: `This data is for ${formatSlateDate(status.slateDate)}, not today’s slate.`,
        showSecondaryInCompact: true,
        role: "status",
        ariaLive: "polite",
      };

    case "unavailable":
      return {
        tone: "error",
        icon: AlertCircle,
        spin: false,
        primary: "MLB model data unavailable",
        secondary: "The current model payload could not be used.",
        showSecondaryInCompact: true,
        role: "alert",
        ariaLive: "assertive",
      };

    case "error": {
      if (!status.hasLastKnownData) {
        return {
          tone: "error",
          icon: AlertCircle,
          spin: false,
          primary: "Unable to load MLB model data",
          secondary: status.message.trim() ? status.message : "Please try again after the next scheduled update.",
          showSecondaryInCompact: true,
          role: "alert",
          ariaLive: "assertive",
        };
      }
      const metadata = buildRetainedMetadata(status.slateDate, status.generatedAt);
      const base = "Previously loaded data remains visible. It may no longer reflect the latest update.";
      return {
        tone: "caution",
        icon: AlertTriangle,
        spin: false,
        primary: "Unable to refresh MLB model data",
        secondary: metadata ? `${base} ${metadata}` : base,
        showSecondaryInCompact: true,
        role: "status",
        ariaLive: "polite",
      };
    }
  }
}

export function FreshnessStatus({ status, compact = false, className }: FreshnessStatusProps) {
  const content = getStatusContent(status);
  const Icon = content.icon;
  const showSecondary = compact ? content.showSecondaryInCompact : true;

  return (
    <div
      role={content.role}
      aria-live={content.ariaLive}
      aria-atomic="true"
      data-tone={content.tone}
      className={cn(
        "flex w-full items-start gap-2 rounded-lg border",
        compact ? "px-2.5 py-1.5" : "px-3 py-2.5",
        TONE_CLASSES[content.tone],
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("mt-0.5 h-4 w-4 shrink-0", content.spin && "animate-spin motion-reduce:animate-none")}
      />
      <div className="min-w-0">
        <p className={cn("font-medium leading-snug", compact ? "text-xs" : "text-sm")}>{content.primary}</p>
        {showSecondary && (
          <p className={cn("leading-snug opacity-80", compact ? "mt-0.5 text-[11px]" : "mt-1 text-xs")}>
            {content.secondary}
          </p>
        )}
      </div>
    </div>
  );
}
