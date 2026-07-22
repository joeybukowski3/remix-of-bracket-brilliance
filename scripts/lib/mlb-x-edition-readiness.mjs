/**
 * Shared readiness decision for MLB X editions.
 *
 * ONE pure function, consumed by both the workflow planner and the K/HR
 * posting scripts. On 2026-07-21 the planner reported
 * k_status=READY_CONFIRMED_SELECTIONS and launched a heavy posting job that
 * installed dependencies, Playwright and a full site build, whereupon the
 * poster applied its own opposing-lineup rule, returned
 * WAITING_FOR_OPPOSING_LINEUP, and exited 0 having published nothing. Two of
 * the day's three usable polls were consumed that way. Neither side may
 * reinterpret readiness independently, so both call resolveEditionReadiness
 * and act on its verdict verbatim.
 *
 * Design rules encoded here:
 *
 *  - Each run is self-sufficient. Inside an open window with everything it
 *    needs, the answer is POST, never "wait for a better run". Yesterday's
 *    scheduler delivered 11 of ~60 expected polls; assuming another run
 *    arrives shortly is how a slate publishes nothing.
 *  - Absence of an OPTIONAL input is a warning; absence of a REQUIRED one is
 *    a blocker. Optional enrichment may never eliminate a valid post.
 *  - Language is chosen from what was actually verified, never from what was
 *    hoped for. "Lineups confirmed" is only ever emitted when every selected
 *    recommendation satisfies the confirmation policy.
 *
 * Pure: no clock, no filesystem, no network. `now` is injected.
 */

import { buildEditionReceiptKey } from "./mlb-x-edition-receipts.mjs";

export const Decision = Object.freeze({
  POST: "POST",
  WAIT: "WAIT",
  SKIP: "SKIP",
  BLOCKED: "BLOCKED",
});

export const ReadinessStatus = Object.freeze({
  READY_TO_POST: "READY_TO_POST",
  READY_TO_FALLBACK_POST: "READY_TO_FALLBACK_POST",
  WAITING_FOR_SELECTED_LINEUPS: "WAITING_FOR_SELECTED_LINEUPS",
  ALREADY_POSTED: "ALREADY_POSTED",
  NOT_DUE: "NOT_DUE",
  NO_GAMES: "NO_GAMES",
  INVALID_SLATE: "INVALID_SLATE",
  NO_VALID_PICKS: "NO_VALID_PICKS",
  MISSED_WINDOW: "MISSED_WINDOW",
  IMAGE_FAILED: "IMAGE_FAILED",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
  FIRST_GAME_STARTED: "FIRST_GAME_STARTED",
});

/**
 * Terminal statuses the POSTING layer may add once it has acted. The decision
 * module never returns these -- it cannot know whether the X API succeeded.
 */
export const PostingStatus = Object.freeze({
  POSTED: "POSTED",
  FALLBACK_POSTED: "FALLBACK_POSTED",
  X_API_FAILED: "X_API_FAILED",
});

/** Caption register. Drives which fixed string a poster is permitted to use. */
export const LanguageMode = Object.freeze({
  MORNING: "morning",
  CONFIRMED: "confirmed",
  PREGAME_FALLBACK: "pregame_fallback",
});

/** Where in the edition lifecycle the decision was taken. */
export const Stage = Object.freeze({
  BEFORE_WINDOW: "before_window",
  MORNING: "morning",
  PREFERRED: "preferred",
  FALLBACK: "fallback",
  AFTER_WINDOW: "after_window",
});

export const MORNING_WINDOW_OPEN_ET = { hour: 9, minute: 45 };
export const MORNING_WINDOW_CLOSE_ET = { hour: 11, minute: 15 };

/** Minutes before first pitch. Larger number = earlier. */
export const CONFIRMED_WINDOW_OPEN_MINUTES = 140; // 2h20m
export const CONFIRMED_PREFERRED_END_MINUTES = 100; // 1h40m
export const CONFIRMED_WINDOW_CLOSE_MINUTES = 75; // 1h15m

const MS_PER_MINUTE = 60_000;

/**
 * Captions. Fixed strings, chosen only from verified state.
 *
 * The confirmed edition may republish the morning edition's picks and image
 * when nothing underneath changed, so the caption is the only thing that
 * distinguishes the two to a reader -- it has to be exactly right.
 */
export const Caption = Object.freeze({
  MORNING_K:
    "Morning model projections showing the clearest strikeout edges on today's slate. Check final lineups before betting.",
  MORNING_HR:
    "Morning model targets based on the current slate and available prices. Check final lineups before betting.",
  CONFIRMED_COMPLETE:
    "Updated with confirmed lineups and the latest available market numbers.",
  CONFIRMED_INCOMPLETE:
    "Updated pregame model card using the latest available lineup information.",
});

/** Eastern wall-clock parts for an instant, correct across DST transitions. */
export function easternParts(now, timeZone = "America/New_York") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(now));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  const hour = get("hour") % 24; // en-US can render midnight as 24
  return {
    year: get("year"), month: get("month"), day: get("day"),
    hour, minute: get("minute"),
    date: `${String(get("year")).padStart(4, "0")}-${String(get("month")).padStart(2, "0")}-${String(get("day")).padStart(2, "0")}`,
    minutesOfDay: hour * 60 + get("minute"),
  };
}

const asMinutes = ({ hour, minute }) => hour * 60 + minute;

function normalizeSelectedLineupStatus(value) {
  if (Array.isArray(value)) {
    const total = value.length;
    const confirmed = value.filter((entry) =>
      entry === true || entry?.confirmed === true).length;
    return { total, confirmed, known: true };
  }
  if (value && typeof value === "object") {
    const total = Number(value.total ?? value.totalCount);
    const confirmed = Number(value.confirmed ?? value.confirmedCount);
    if (Number.isFinite(total) && Number.isFinite(confirmed)) {
      return { total, confirmed, known: true };
    }
  }
  // Unknown confirmation state. Never treated as confirmed.
  return { total: 0, confirmed: 0, known: false };
}

function buildResult({
  decision, status, stage = null, languageMode = null, caption = null,
  confirmationComplete = null, warnings, blockers, detail = {},
  receiptKey = null, nextEligibleAt = null, windowClosesAt = null,
}) {
  return {
    decision,
    status,
    stage,
    languageMode,
    caption,
    confirmationComplete,
    shouldPost: decision === Decision.POST,
    // The planner reads this to decide whether to launch a heavy posting job.
    // It is the SAME value the poster will compute, which is the property that
    // makes a planner READY / poster WAITING split impossible.
    shouldRunPoster: decision === Decision.POST,
    warnings,
    blockers,
    detail,
    receiptKey,
    // When this edition could next become eligible, and when its window shuts.
    // Null where not meaningful (already posted, no games, missed window).
    nextEligibleAt,
    windowClosesAt,
  };
}

/** ISO instant for an ET wall-clock time on the ET calendar date of `now`. */
function etWallClockToIso(now, timeZone, { hour, minute }) {
  const base = new Date(now).getTime();
  const cur = easternParts(now, timeZone);
  const deltaMinutes = (hour * 60 + minute) - cur.minutesOfDay;
  return new Date(base + deltaMinutes * MS_PER_MINUTE).toISOString();
}

/**
 * @param {object} input see the documented contract
 * @returns {{decision: string, status: string, stage: string|null, caption: string|null,
 *            confirmationComplete: boolean|null, shouldPost: boolean, shouldRunPoster: boolean,
 *            warnings: string[], blockers: string[], detail: object}}
 */
export function resolveEditionReadiness(input) {
  const {
    now,
    timeZone = "America/New_York",
    slateDate,
    market,
    edition,
    firstGameTime = null,
    gamesScheduled = 0,
    artifactSlateDate = null,
    artifactFreshnessStatus = null,
    validPicks = 0,
    selectedLineupStatus = null,
    image = {},
    receipt = {},
    liveMode = false,
    allowLivePost = false,
    credentialsPresent = false,
    verifiedAccount = false,
  } = input ?? {};

  const warnings = [];
  const blockers = [];
  const et = easternParts(now, timeZone);
  const nowMs = new Date(now).getTime();

  const detail = {
    etDate: et.date,
    etClock: `${String(et.hour).padStart(2, "0")}:${String(et.minute).padStart(2, "0")}`,
    slateDate, market, edition,
  };

  // Computed once so every decision below reports the same identity and
  // window bounds, whichever branch it exits through.
  let stage = null;
  let receiptKey = null;
  try {
    receiptKey = buildEditionReceiptKey({ market, slateDate, edition });
  } catch {
    receiptKey = null; // surfaced as CONFIGURATION_ERROR below
  }

  const firstMsRaw = firstGameTime ? new Date(firstGameTime).getTime() : Number.NaN;
  const hasFirstPitch = Number.isFinite(firstMsRaw);
  const windowClosesAt = edition === "morning"
    ? etWallClockToIso(now, timeZone, MORNING_WINDOW_CLOSE_ET)
    : hasFirstPitch
      ? new Date(firstMsRaw - CONFIRMED_WINDOW_CLOSE_MINUTES * MS_PER_MINUTE).toISOString()
      : null;
  const windowOpensAt = edition === "morning"
    ? etWallClockToIso(now, timeZone, MORNING_WINDOW_OPEN_ET)
    : hasFirstPitch
      ? new Date(firstMsRaw - CONFIRMED_WINDOW_OPEN_MINUTES * MS_PER_MINUTE).toISOString()
      : null;
  const common = { receiptKey, windowClosesAt };

  const fail = (status, extra = {}) => {
    blockers.push(status);
    return buildResult({ ...common, decision: Decision.BLOCKED, status, stage, warnings, blockers, detail: { ...detail, ...extra } });
  };

  // ── Already published ────────────────────────────────────────────────────
  // Only a receipt carrying a confirmed post id counts; an ATTEMPTED or FAILED
  // record must leave this edition eligible for a retry.
  if (receipt?.exists && receipt.outcome === "POSTED" && String(receipt.postId ?? "").trim()) {
    return buildResult({
      ...common,
      decision: Decision.SKIP, status: ReadinessStatus.ALREADY_POSTED,
      warnings, blockers, detail: { ...detail, postId: receipt.postId },
    });
  }

  // ── Slate validity. Prior-slate data is a hard blocker for both editions ──
  if (!gamesScheduled) {
    return buildResult({ ...common, decision: Decision.SKIP, status: ReadinessStatus.NO_GAMES, stage, warnings, blockers, detail });
  }
  if (artifactSlateDate && artifactSlateDate !== slateDate) {
    return fail(ReadinessStatus.INVALID_SLATE, { artifactSlateDate });
  }
  // Freshness beyond the slate-date match is advisory: a current-slate artifact
  // flagged merely "stale" still describes today's games.
  if (artifactFreshnessStatus && artifactFreshnessStatus !== "fresh") {
    warnings.push(`ARTIFACT_FRESHNESS_${String(artifactFreshnessStatus).toUpperCase()}`);
  }

  // ── Timing window ────────────────────────────────────────────────────────
  if (edition === "morning") {
    const openAt = asMinutes(MORNING_WINDOW_OPEN_ET);
    const closeAt = asMinutes(MORNING_WINDOW_CLOSE_ET);
    detail.windowEt = "09:45-11:15";
    stage = Stage.MORNING;
    if (et.date !== slateDate) {
      return buildResult({ ...common, decision: Decision.SKIP, status: ReadinessStatus.MISSED_WINDOW, stage, warnings, blockers, detail });
    }
    if (et.minutesOfDay < openAt) {
      stage = Stage.BEFORE_WINDOW;
      return buildResult({ ...common, decision: Decision.WAIT, status: ReadinessStatus.NOT_DUE, stage, nextEligibleAt: windowOpensAt, warnings, blockers, detail });
    }
    if (et.minutesOfDay > closeAt) {
      stage = Stage.AFTER_WINDOW;
      return buildResult({ ...common, decision: Decision.SKIP, status: ReadinessStatus.MISSED_WINDOW, stage, warnings, blockers, detail });
    }
  } else if (edition === "confirmed") {
    if (!firstGameTime) {
      return buildResult({ ...common, decision: Decision.SKIP, status: ReadinessStatus.NO_GAMES, stage, warnings, blockers, detail });
    }
    const firstMs = new Date(firstGameTime).getTime();
    if (!Number.isFinite(firstMs)) {
      return buildResult({ ...common, decision: Decision.SKIP, status: ReadinessStatus.NO_GAMES, stage, warnings, blockers, detail });
    }
    const minutesUntilFirstPitch = Math.round((firstMs - nowMs) / MS_PER_MINUTE);
    detail.minutesUntilFirstPitch = minutesUntilFirstPitch;
    detail.windowMinutesBeforeFirstPitch = `${CONFIRMED_WINDOW_OPEN_MINUTES}-${CONFIRMED_WINDOW_CLOSE_MINUTES}`;

    // Never publish this edition once the earliest game is under way.
    if (minutesUntilFirstPitch <= 0) {
      stage = Stage.AFTER_WINDOW;
      return buildResult({ ...common, decision: Decision.SKIP, status: ReadinessStatus.FIRST_GAME_STARTED, stage, warnings, blockers, detail });
    }
    if (minutesUntilFirstPitch > CONFIRMED_WINDOW_OPEN_MINUTES) {
      stage = Stage.BEFORE_WINDOW;
      return buildResult({ ...common, decision: Decision.WAIT, status: ReadinessStatus.NOT_DUE, stage, nextEligibleAt: windowOpensAt, warnings, blockers, detail });
    }
    if (minutesUntilFirstPitch < CONFIRMED_WINDOW_CLOSE_MINUTES) {
      stage = Stage.AFTER_WINDOW;
      return buildResult({ ...common, decision: Decision.SKIP, status: ReadinessStatus.MISSED_WINDOW, stage, warnings, blockers, detail });
    }
    stage = minutesUntilFirstPitch >= CONFIRMED_PREFERRED_END_MINUTES
      ? Stage.PREFERRED
      : Stage.FALLBACK;
    detail.stage = stage;
  } else {
    return fail(ReadinessStatus.CONFIGURATION_ERROR, { reason: `unknown edition "${edition}"` });
  }

  // ── Required content ─────────────────────────────────────────────────────
  // Fewer than three picks is explicitly allowed; zero is a blocker.
  if (!Number.isFinite(validPicks) || validPicks < 1) {
    return fail(ReadinessStatus.NO_VALID_PICKS, { validPicks });
  }
  if (validPicks < 3) warnings.push("FEWER_THAN_THREE_PICKS");

  if (!image?.exists) return fail(ReadinessStatus.IMAGE_FAILED);
  if (image.slateDate && image.slateDate !== slateDate) {
    return fail(ReadinessStatus.IMAGE_FAILED, { imageSlateDate: image.slateDate });
  }
  if (!image.slateDate) warnings.push("IMAGE_SLATE_DATE_UNKNOWN");
  const w = Number(image.width); const h = Number(image.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return fail(ReadinessStatus.IMAGE_FAILED, { width: image.width, height: image.height });
  }

  // ── Live posting configuration ───────────────────────────────────────────
  if (liveMode && !(allowLivePost && credentialsPresent && verifiedAccount)) {
    return fail(ReadinessStatus.CONFIGURATION_ERROR, { allowLivePost, credentialsPresent, verifiedAccount });
  }

  // ── Edition policy ───────────────────────────────────────────────────────
  if (edition === "morning") {
    // No lineup requirement whatsoever: not opposing orders for K, not batting
    // orders for HR. The caption says to check lineups precisely because this
    // edition does not claim them.
    return buildResult({
      ...common,
      decision: Decision.POST,
      status: ReadinessStatus.READY_TO_POST,
      stage,
      languageMode: LanguageMode.MORNING,
      caption: market === "k" ? Caption.MORNING_K : Caption.MORNING_HR,
      confirmationComplete: false,
      warnings, blockers, detail,
    });
  }

  const lineups = normalizeSelectedLineupStatus(selectedLineupStatus);
  // Only the games and players actually represented in the selected
  // recommendations matter -- a slate-wide coverage requirement is what kept
  // HR at 0/15 all day.
  const complete = lineups.known && lineups.total > 0 && lineups.confirmed === lineups.total;
  detail.selectedConfirmed = lineups.confirmed;
  detail.selectedTotal = lineups.total;
  detail.selectedConfirmationKnown = lineups.known;

  if (complete) {
    return buildResult({
      ...common,
      decision: Decision.POST,
      status: ReadinessStatus.READY_TO_POST,
      stage, languageMode: LanguageMode.CONFIRMED,
      caption: Caption.CONFIRMED_COMPLETE, confirmationComplete: true,
      warnings, blockers, detail,
    });
  }

  if (stage === Stage.PREFERRED) {
    // Still time for orders to post; keep waiting, but only within the
    // preferred stage -- the fallback stage below guarantees this cannot
    // defer indefinitely the way the old design did.
    return buildResult({
      ...common,
      decision: Decision.WAIT,
      status: ReadinessStatus.WAITING_FOR_SELECTED_LINEUPS,
      stage, confirmationComplete: false,
      // Guaranteed publication point: the fallback stage cannot defer further.
      nextEligibleAt: hasFirstPitch
        ? new Date(firstMsRaw - CONFIRMED_PREFERRED_END_MINUTES * MS_PER_MINUTE).toISOString()
        : null,
      warnings, blockers, detail,
    });
  }

  // Fallback stage: publish the best valid current-slate card. Incomplete
  // confirmation is a soft warning here, never a blocker, and the caption
  // must not claim lineups are confirmed.
  warnings.push("SELECTED_LINEUP_CONFIRMATION_INCOMPLETE");
  return buildResult({
    ...common,
    decision: Decision.POST,
    status: ReadinessStatus.READY_TO_FALLBACK_POST,
    stage, languageMode: LanguageMode.PREGAME_FALLBACK,
    caption: Caption.CONFIRMED_INCOMPLETE, confirmationComplete: false,
    warnings, blockers, detail,
  });
}
