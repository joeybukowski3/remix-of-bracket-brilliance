import type { CfbSeasonRecord } from "@/data/cfb/types";
import { formatRecord } from "./format";

export type CfbScheduleSite = "Home" | "Away" | "Neutral";

const SITE_CLASSES: Record<CfbScheduleSite, string> = {
  Home: "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200",
  Away: "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200",
  Neutral: "bg-violet-100 text-violet-900 ring-1 ring-inset ring-violet-200",
};

export function getCfbSitePillClass(site: CfbScheduleSite): string {
  return SITE_CLASSES[site];
}

const EASTERN_TIME_ZONE = "America/New_York";

const easternDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_TIME_ZONE,
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dateOnlyFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
  day: "numeric",
});

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function formatCfbScheduleDateTime(date: string, utcTime: string | null): string {
  if (!utcTime) {
    const dateOnly = new Date(`${date}T12:00:00Z`);
    return Number.isNaN(dateOnly.getTime()) ? date : dateOnlyFormatter.format(dateOnly);
  }

  const scheduledAt = new Date(`${date}T${utcTime}:00Z`);
  if (Number.isNaN(scheduledAt.getTime())) return date;

  const parts = easternDateTimeFormatter.formatToParts(scheduledAt);
  return `${getPart(parts, "month")} ${getPart(parts, "day")} · ${getPart(parts, "hour")}:${getPart(parts, "minute")} ${getPart(parts, "dayPeriod")} ET`;
}

const easternDateTimeShortFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dateOnlyShortFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

/** Compact kickoff label for tight card layouts, e.g. "Aug 30 · 7:30 PM ET". */
export function formatCfbKickoffLabel(date: string, utcTime: string | null): string {
  if (!utcTime) {
    const dateOnly = new Date(`${date}T12:00:00Z`);
    return Number.isNaN(dateOnly.getTime()) ? date : dateOnlyShortFormatter.format(dateOnly);
  }

  const scheduledAt = new Date(`${date}T${utcTime}:00Z`);
  if (Number.isNaN(scheduledAt.getTime())) return date;

  const parts = easternDateTimeShortFormatter.formatToParts(scheduledAt);
  return `${getPart(parts, "month")} ${getPart(parts, "day")} · ${getPart(parts, "hour")}:${getPart(parts, "minute")} ${getPart(parts, "dayPeriod")} ET`;
}

export function formatCfbOpponentRecord(record: CfbSeasonRecord | null | undefined): string {
  return record ? formatRecord(record.wins, record.losses, record.ties) : "—";
}
