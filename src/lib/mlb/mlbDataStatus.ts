/**
 * Pure MLB data-status derivation.
 *
 * Architectural twin of `lib/pga/pgaFreshness.ts`: a single deterministic
 * function that turns a payload + fetch state + an injected clock into one
 * discriminated status, with no React, no fetching, and no dependency on
 * `MlbHrProps.tsx` or any page. Nothing imports this module yet -- it is a
 * tests-first foundation for a future `useMlbPropsData` integration.
 *
 * ET-date handling reuses the exact pattern already proven in this
 * codebase by `useMLBNumerology.ts`'s `getEtDate()` and the MLB HR
 * generator's `getEasternDate()` (`scripts/generate-mlb-hr-props.mjs`):
 * `Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", ... })`,
 * which formats as `YYYY-MM-DD` directly. Slate-date string validation
 * reuses the generator's `resolveSlateDate()` technique -- parse at noon
 * UTC and round-trip through `toISOString()` -- so a malformed date (e.g.
 * "2026-02-30") is rejected rather than silently rolled over.
 *
 * PRECEDENCE (first match wins; each rule assumes every rule above it did
 * not match):
 *   1. loading            -- fetchState.hasCompletedInitialFetch is false
 *                             AND the payload is not usable (no valid
 *                             slate date). Deliberately does NOT consult
 *                             fetchState.loading: once the initial fetch
 *                             has completed with a usable payload, a
 *                             background refresh setting `loading: true`
 *                             again must never make existing data vanish
 *                             into a full-page loading state. `loading`
 *                             stays in MlbFetchState for a future hook to
 *                             use for its own (non-blocking) UI, but this
 *                             function's precedence never reads it.
 *   2. error               -- fetchState.error is non-null. Checked before
 *                             "unavailable" and "stale" so a fetch failure
 *                             is never misreported as an empty slate or a
 *                             wrong-slate payload. Carries
 *                             `hasLastKnownData` plus any slateDate/
 *                             generatedAt the retained payload has, since
 *                             a future hook integration may choose to keep
 *                             showing the last good payload alongside an
 *                             error banner (see the linked freshness audit,
 *                             Option B) -- this function never discards or
 *                             mutates that payload itself.
 *   3. unavailable         -- fetch completed, no error, but the payload
 *                             has no valid slate date (missing, malformed,
 *                             or payload itself is null). A successful
 *                             request/normalization path that produced
 *                             nothing usable, not a network failure.
 *   4. stale               -- payload.date does not equal today's ET date.
 *                             Only a date-identity mismatch in this PR --
 *                             deliberately NOT an age/generatedAt-based
 *                             check (that threshold is an open product
 *                             decision, not resolved here). Both
 *                             before-today and after-today mismatches are
 *                             "stale" for now, distinguished only by the
 *                             `direction` field for future wording.
 *   5. waiting-for-slate   -- slate date matches today, zero games, and a
 *                             valid `nextRunAt` (non-empty time AND label)
 *                             exists. Never inferred from time-of-day
 *                             alone -- if `nextRunAt` is absent or
 *                             malformed, this rule does not fire.
 *   6. no-games-scheduled  -- slate date matches today, zero games, and no
 *                             valid `nextRunAt`.
 *   7. lineup-pending      -- slate date matches today, at least one game,
 *                             at least one batter row, and at least one
 *                             batter whose `lineupStatus` is not exactly
 *                             "confirmed" (case-insensitive). Any
 *                             incomplete confirmation set counts --
 *                             informational only, never blocks or filters
 *                             rows. A payload with games but zero/absent
 *                             batter rows does NOT fall into this state
 *                             (falls through to "current" instead).
 *   8. current             -- everything else: usable payload, today's
 *                             slate, at least one game, and no
 *                             higher-priority state applies.
 *
 * Explicitly unsupported in this PR (see the freshness audit for why):
 * "updating", "odds-pending", "no-qualifying-results", park/weather
 * readiness, pitcher-workload readiness, strikeout-market status,
 * model-specific filtering results, generatedAt-age staleness, retry
 * state, polling state. None of these have a shared, reliable signal yet,
 * or they belong to page-specific logic (e.g. `kPropStatus.ts`) rather
 * than this shared derivation.
 */

export type MlbFetchState = {
  readonly loading: boolean;
  readonly error: string | null;
  readonly hasCompletedInitialFetch: boolean;
};

export interface MlbStatusBatterInput {
  readonly lineupStatus?: string | null;
}

export interface MlbStatusNextRunAtInput {
  readonly time?: string | null;
  readonly label?: string | null;
}

/**
 * Deliberately minimal structural payload type -- not the large,
 * page-owned `HrDashboardPayload` from `MlbHrProps.tsx`. Importing that
 * type here would invert the dependency (a low-level status module
 * depending on a specific page component) exactly the way the MLB tool
 * registry's own header docs warn against for icon components. Any object
 * shaped like this -- including the real `HrDashboardPayload` -- is
 * structurally assignable.
 */
export interface MlbStatusPayload {
  readonly date?: string | null;
  readonly generatedAt?: string | null;
  readonly games?: readonly unknown[] | null;
  readonly batters?: readonly MlbStatusBatterInput[] | null;
  readonly nextRunAt?: MlbStatusNextRunAtInput | null;
}

export type MlbDataStatus =
  | { kind: "loading" }
  | {
      kind: "error";
      message: string;
      hasLastKnownData: boolean;
      slateDate?: string;
      generatedAt?: string;
    }
  | { kind: "unavailable" }
  | {
      kind: "stale";
      slateDate: string;
      todayEt: string;
      /** Whether the retained slate is from before or after today's ET date. */
      direction: "past" | "future";
      generatedAt?: string;
    }
  | {
      kind: "waiting-for-slate";
      slateDate: string;
      /**
       * Always present when this variant is returned -- the derivation
       * rule requires a valid nextRunAt before choosing this state, so
       * (unlike the illustrative contract in the task brief) it is typed
       * as required here rather than optional, giving callers a stronger
       * guarantee without an extra null check.
       */
      nextRunAt: { time: string; label: string };
      generatedAt?: string;
    }
  | {
      kind: "no-games-scheduled";
      slateDate: string;
      generatedAt?: string;
    }
  | {
      kind: "lineup-pending";
      slateDate: string;
      confirmedCount: number;
      totalCount: number;
      generatedAt?: string;
    }
  | {
      kind: "current";
      slateDate: string;
      generatedAt?: string;
    };

/** `Intl.DateTimeFormat("en-CA", ...)` formats as YYYY-MM-DD directly -- the same trick `getEasternDate`/`getEtDate` already use. */
function getEasternDateString(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Validates a slate-date string using the same technique as the
 * generator's `resolveSlateDate()`: parse at noon UTC (never midnight, to
 * stay clear of any local-timezone rollover) and require the result to
 * round-trip back to the exact same string. Rejects malformed strings
 * like "2026-02-30" that `new Date(...)` would otherwise silently roll
 * over into a different, wrong date.
 */
function isValidSlateDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

function hasUsablePayload(payload: MlbStatusPayload | null): payload is MlbStatusPayload & { date: string } {
  return payload != null && isValidSlateDateString(payload.date);
}

/** `generatedAt` is metadata only here -- never parsed, never validated, never used for computation. A present non-empty string is preserved verbatim; anything else is safely omitted. */
function readGeneratedAt(payload: MlbStatusPayload): string | undefined {
  return typeof payload.generatedAt === "string" && payload.generatedAt.trim() !== "" ? payload.generatedAt : undefined;
}

function readGameCount(payload: MlbStatusPayload): number {
  return Array.isArray(payload.games) ? payload.games.length : 0;
}

function readBatters(payload: MlbStatusPayload): readonly MlbStatusBatterInput[] {
  return Array.isArray(payload.batters) ? payload.batters : [];
}

function isConfirmedBatter(batter: MlbStatusBatterInput): boolean {
  return typeof batter?.lineupStatus === "string" && batter.lineupStatus.trim().toLowerCase() === "confirmed";
}

/** A "valid" nextRunAt requires both a non-empty time and a non-empty label -- matching the generator's own `getNextRunAt()`, which always writes both together or returns null, never a partial object. */
function readValidNextRunAt(payload: MlbStatusPayload): { time: string; label: string } | null {
  const candidate = payload.nextRunAt;
  if (candidate == null) return null;
  const time = typeof candidate.time === "string" ? candidate.time.trim() : "";
  const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
  if (!time || !label) return null;
  return { time, label };
}

/**
 * Derives one discriminated MLB data status from a payload, a fetch
 * state, and an injected clock. Pure: the same three inputs always
 * produce a deeply-equal result, nothing is mutated, no fetch or system
 * clock read happens internally, and no React types are involved.
 */
export function deriveMlbDataStatus(
  payload: MlbStatusPayload | null,
  fetchState: MlbFetchState,
  now: Date,
): MlbDataStatus {
  const usable = hasUsablePayload(payload);

  if (!fetchState.hasCompletedInitialFetch && !usable) {
    return { kind: "loading" };
  }

  if (fetchState.error != null) {
    const generatedAt = usable ? readGeneratedAt(payload) : undefined;
    return {
      kind: "error",
      message: fetchState.error,
      hasLastKnownData: usable,
      ...(usable ? { slateDate: payload.date } : {}),
      ...(generatedAt ? { generatedAt } : {}),
    };
  }

  if (!usable) {
    return { kind: "unavailable" };
  }

  const generatedAt = readGeneratedAt(payload);
  const slateDate = payload.date;
  const todayEt = getEasternDateString(now);

  if (slateDate !== todayEt) {
    return {
      kind: "stale",
      slateDate,
      todayEt,
      direction: slateDate < todayEt ? "past" : "future",
      ...(generatedAt ? { generatedAt } : {}),
    };
  }

  const gameCount = readGameCount(payload);

  if (gameCount === 0) {
    const nextRunAt = readValidNextRunAt(payload);
    if (nextRunAt) {
      return { kind: "waiting-for-slate", slateDate, nextRunAt, ...(generatedAt ? { generatedAt } : {}) };
    }
    return { kind: "no-games-scheduled", slateDate, ...(generatedAt ? { generatedAt } : {}) };
  }

  const batters = readBatters(payload);
  if (batters.length > 0) {
    const totalCount = batters.length;
    const confirmedCount = batters.filter(isConfirmedBatter).length;
    if (confirmedCount < totalCount) {
      return { kind: "lineup-pending", slateDate, confirmedCount, totalCount, ...(generatedAt ? { generatedAt } : {}) };
    }
  }

  return { kind: "current", slateDate, ...(generatedAt ? { generatedAt } : {}) };
}
