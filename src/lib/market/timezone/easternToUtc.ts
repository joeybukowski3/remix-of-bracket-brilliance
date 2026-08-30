/**
 * DST-aware conversion of a SportsDataIO "US Eastern Time" wall-clock timestamp
 * into a UTC ISO-8601 instant.
 *
 * SportsDataIO documents its football `DateTime` / `Date` / `Day` / betting-split
 * `Created` / `LastSeen` values as US Eastern local time with no offset. Football
 * season straddles the EDT↔EST transition, so a fixed −04:00 / −05:00 offset is
 * wrong for part of the year. This helper resolves the correct offset from the
 * IANA `America/New_York` zone for the specific instant, with no dependency on
 * the machine's local timezone and no third-party library.
 *
 * Fails closed: unparseable input, impossible calendar dates, the spring-forward
 * gap (a wall time that never occurred), and the fall-back overlap (a wall time
 * that occurred twice) all throw {@link EasternTimeConversionError}.
 */

export class EasternTimeConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EasternTimeConversionError";
  }
}

const EASTERN_ZONE = "America/New_York";

const EASTERN_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Wall-clock components that `America/New_York` shows at the given UTC instant. */
function easternWallClockAt(instantMs: number): WallClock {
  const parts = EASTERN_PARTS_FORMATTER.formatToParts(new Date(instantMs));
  const lookup: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of parts) {
    if (part.type !== "literal") lookup[part.type] = part.value;
  }
  let hour = Number(lookup.hour);
  if (hour === 24) hour = 0; // some ICU builds emit "24" for midnight
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour,
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

/** Milliseconds `America/New_York` is ahead of UTC at the given instant (negative in the US). */
function easternOffsetMsAt(instantMs: number): number {
  const wall = easternWallClockAt(instantMs);
  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  return wallAsUtc - instantMs;
}

function sameWallClock(a: WallClock, b: WallClock): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second
  );
}

const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?(?:\.\d+)?$/;

/**
 * Convert an Eastern local timestamp such as `2026-09-13T20:25:00`,
 * `2026-12-14 13:00`, or the date-only `2026-10-03` (interpreted as local
 * midnight) into a UTC ISO-8601 string with millisecond precision.
 */
export function easternLocalToUtcIso(input: string): string {
  if (typeof input !== "string" || input.trim() === "") {
    throw new EasternTimeConversionError(
      `Eastern timestamp must be a non-empty string; received ${JSON.stringify(input)}.`,
    );
  }

  const trimmed = input.trim().replace(/Z$/i, "");
  const match = TIMESTAMP_PATTERN.exec(trimmed);
  if (!match) {
    throw new EasternTimeConversionError(
      `Unparseable Eastern timestamp: ${JSON.stringify(input)}.`,
    );
  }

  const target: WallClock = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: match[4] === undefined ? 0 : Number(match[4]),
    minute: match[5] === undefined ? 0 : Number(match[5]),
    second: match[6] === undefined ? 0 : Number(match[6]),
  };

  if (
    target.month < 1 ||
    target.month > 12 ||
    target.day < 1 ||
    target.day > 31 ||
    target.hour > 23 ||
    target.minute > 59 ||
    target.second > 59
  ) {
    throw new EasternTimeConversionError(
      `Eastern timestamp has an out-of-range field: ${JSON.stringify(input)}.`,
    );
  }

  const naiveUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
  );
  const naive = new Date(naiveUtc);
  if (
    naive.getUTCFullYear() !== target.year ||
    naive.getUTCMonth() !== target.month - 1 ||
    naive.getUTCDate() !== target.day
  ) {
    throw new EasternTimeConversionError(
      `Eastern timestamp is not a real calendar date: ${JSON.stringify(input)}.`,
    );
  }

  // Both plausible offsets around a transition are tried; a valid conversion is
  // one whose instant renders back to exactly the requested Eastern wall clock.
  const seedOffsets = [
    easternOffsetMsAt(naiveUtc),
    easternOffsetMsAt(naiveUtc - 12 * 60 * 60 * 1000),
    easternOffsetMsAt(naiveUtc + 12 * 60 * 60 * 1000),
  ];

  const valid = new Set<number>();
  for (const seed of seedOffsets) {
    let instant = naiveUtc - seed;
    for (let iteration = 0; iteration < 4; iteration += 1) {
      const next = naiveUtc - easternOffsetMsAt(instant);
      if (next === instant) break;
      instant = next;
    }
    if (sameWallClock(easternWallClockAt(instant), target)) valid.add(instant);
  }

  if (valid.size === 0) {
    throw new EasternTimeConversionError(
      `Eastern timestamp falls in a daylight-saving gap and never occurred: ${JSON.stringify(input)}.`,
    );
  }
  if (valid.size > 1) {
    throw new EasternTimeConversionError(
      `Eastern timestamp is ambiguous across a daylight-saving fall-back and occurred twice: ${JSON.stringify(input)}.`,
    );
  }

  return new Date([...valid][0]).toISOString();
}
