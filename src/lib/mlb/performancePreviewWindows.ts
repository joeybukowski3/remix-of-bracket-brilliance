// Shared rolling time-window helpers for the /mlb/performance-preview tracker.
// Pure date-string math (dates are always "YYYY-MM-DD", which sorts/compares
// lexically) so these are trivially testable without mocking the system
// clock -- pass an explicit `today` to pin the reference date in tests.

export type TimeWindowId = "yesterday" | "last7" | "last30";

export const TIME_WINDOWS: { id: TimeWindowId; label: string }[] = [
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7" },
  { id: "last30", label: "Last 30 Days" },
];

export function getEtDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function windowRange(window: TimeWindowId, today: string = getEtDateString()): { start: string; end: string } {
  const yesterday = addDays(today, -1);
  if (window === "yesterday") return { start: yesterday, end: yesterday };
  if (window === "last7") return { start: addDays(today, -7), end: yesterday };
  return { start: addDays(today, -30), end: yesterday };
}

export function isDateInWindow(date: string, window: TimeWindowId, today: string = getEtDateString()): boolean {
  const { start, end } = windowRange(window, today);
  return date >= start && date <= end;
}
