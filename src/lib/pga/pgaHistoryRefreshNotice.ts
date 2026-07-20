import type { PgaHistoryLastRefresh } from "@/lib/pga/historyModel";

export type PgaHistoryRefreshNoticeContent = {
  names: string[];
  summarySentence: string;
  isCollapsed: boolean;
  timestampSentence: string | null;
};

const COLLAPSE_THRESHOLD = 4;

export function buildRefreshNoticeContent(lastRefresh: PgaHistoryLastRefresh | null | undefined): PgaHistoryRefreshNoticeContent | null {
  if (!lastRefresh || lastRefresh.failureCount <= 0 || !lastRefresh.failedPlayers?.length) return null;

  const names = lastRefresh.failedPlayers.map((failure) => failure.player).filter(Boolean);
  if (!names.length) return null;

  const isCollapsed = names.length >= COLLAPSE_THRESHOLD;
  const summarySentence = isCollapsed
    ? `Recent history data excludes the latest update for ${names.length} players.`
    : `Recent history data excludes the latest update for ${formatPlayerNameList(names)}. All other available player histories were refreshed.`;

  return {
    names,
    summarySentence,
    isCollapsed,
    timestampSentence: buildTimestampSentence(lastRefresh),
  };
}

export function formatPlayerNameList(names: string[]) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function buildTimestampSentence(lastRefresh: PgaHistoryLastRefresh) {
  const formatted = formatEasternTimestamp(lastRefresh.attemptedAt);
  if (!formatted) return null;
  const playerLabel = lastRefresh.failureCount === 1 ? "1 player unavailable" : `${lastRefresh.failureCount} players unavailable`;
  return `History refreshed ${formatted} with ${playerLabel}`;
}

function formatEasternTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" });
  const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" });
  return `${dateFormatter.format(date)} at ${timeFormatter.format(date)} ET`;
}
