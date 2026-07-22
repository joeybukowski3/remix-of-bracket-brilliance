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

export const Decision = Object.freeze({
  POST: "POST",
  WAIT: "WAIT",
  SKIP: "SKIP",
  BLOCKED: "BLOCKED",
});

export const ReadinessStatus = Object.freeze({
  READY_MORNING: "READY_MORNING",
  READY_CONFIRMED_SELECTIONS: "READY_CONFIRMED_SELECTIONS",
  READY_FALLBACK_INCOMPLETE_LINEUPS: "READY_FALLBACK_INCOMPLETE_LINEUPS",

  ALREADY_POSTED: "ALREADY_POSTED",

  BEFORE_WINDOW: "BEFORE_WINDOW",
  AFTER_WINDOW: "AFTER_WINDOW",
  FIRST_GAME_STARTED: "FIRST_GAME_STARTED",
  NO_GAMES_SCHEDULED: "NO_GAMES_SCHEDULED",
  NO_FIRST_GAME_TIME: "NO_FIRST_GAME_TIME",

  STALE_ARTIFACT_SLATE: "STALE_ARTIFACT_SLATE",
  NO_VALID_PICKS: "NO_VALID_PICKS",
  IMAGE_MISSING: "IMAGE_MISSING",
  IMAGE_WRONG_SLATE: "IMAGE_WRONG_SLATE",
  IMAGE_UNUSABLE: "IMAGE_UNUSABLE",
  X_CONFIG_INVALID: "X_CONFIG_INVALID",

  WAITING_FOR_SELECTED_LINEUPS: "WAITING_FOR_SELECTED_LINEUPS",
});

/** Which sub-stage of the confirmed window a decision was made in. */
export const ConfirmedStage = Object.freeze({
  PREFERRED: "PREFERRED",
  FALLBACK: "FALLBACK",
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

function buildResult({ decision, status, stage = null, caption = null, confirmationComplete = null, warnings, blockers, detail = {} }) {
  return {
    decision,
    status,
    stage,
    caption,
    confirmationComplete,
    shouldPost: decision === Decision.POST,
    // The planner reads this to decide whether to launch a heavy posting job.
    // It is the SAME value the poster will compute, which is the property
    // that makes a planner READY / poster WAITING split impossible.
    shouldRunPoster: decision === Decision.POST,
    warnings,
    blockers,
    detail,
  };
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

  const fail = (status, extra = {}) => {
    blockers.push(status);
    return buildResult({ decision: Decision.BLOCKED, status, warnings, blockers, detail: { ...detail, ...extra } });
  };

  // ── Already published ────────────────────────────────────────────────────
  // Only a receipt carrying a confirmed post id counts; an ATTEMPTED or FAILED
  // record must leave this edition eligible for a retry.
  if (receipt?.exists && receipt.outcome === "POSTED" && String(receipt.postId ?? "").trim()) {
    return buildResult({
      decision: Decision.SKIP, status: ReadinessStatus.ALREADY_POSTED,
      warnings, blockers, detail: { ...detail, postId: receipt.postId },
    });
  }

  // ── Slate validity. Prior-slate data is a hard blocker for both editions ──
  if (!gamesScheduled) {
    return buildResult({ decision: Decision.SKIP, status: ReadinessStatus.NO_GAMES_SCHEDULED, warnings, blockers, detail });
  }
  if (artifactSlateDate && artifactSlateDate !== slateDate) {
    return fail(ReadinessStatus.STALE_ARTIFACT_SLATE, { artifactSlateDate });
  }
  // Freshness beyond the slate-date match is advisory: a current-slate artifact
  // flagged merely "stale" still describes today's games.
  if (artifactFreshnessStatus && artifactFreshnessStatus !== "fresh") {
    warnings.push(`ARTIFACT_FRESHNESS_${String(artifactFreshnessStatus).toUpperCase()}`);
  }

  // ── Timing window ────────────────────────────────────────────────────────
  let stage = null;
  if (edition === "morning") {
    const openAt = asMinutes(MORNING_WINDOW_OPEN_ET);
    const closeAt = asMinutes(MORNING_WINDOW_CLOSE_ET);
    detail.windowEt = "09:45-11:15";
    if (et.date !== slateDate) {
      return buildResult({ decision: Decision.SKIP, status: ReadinessStatus.AFTER_WINDOW, warnings, blockers, detail });
    }
    if (et.minutesOfDay < openAt) {
      return buildResult({ decision: Decision.WAIT, status: ReadinessStatus.BEFORE_WINDOW, warnings, blockers, detail });
    }
    if (et.minutesOfDay > closeAt) {
      return buildResult({ decision: Decision.SKIP, status: ReadinessStatus.AFTER_WINDOW, warnings, blockers, detail });
    }
  } else if (edition === "confirmed") {
    if (!firstGameTime) {
      return buildResult({ decision: Decision.SKIP, status: ReadinessStatus.NO_FIRST_GAME_TIME, warnings, blockers, detail });
    }
    const firstMs = new Date(firstGameTime).getTime();
    if (!Number.isFinite(firstMs)) {
      return buildResult({ decision: Decision.SKIP, status: ReadinessStatus.NO_FIRST_GAME_TIME, warnings, blockers, detail });
    }
    const minutesUntilFirstPitch = Math.round((firstMs - nowMs) / MS_PER_MINUTE);
    detail.minutesUntilFirstPitch = minutesUntilFirstPitch;
    detail.windowMinutesBeforeFirstPitch = `${CONFIRMED_WINDOW_OPEN_MINUTES}-${CONFIRMED_WINDOW_CLOSE_MINUTES}`;

    // Never publish this edition once the earliest game is under way.
    if (minutesUntilFirstPitch <= 0) {
      return buildResult({ decision: Decision.SKIP, status: ReadinessStatus.FIRST_GAME_STARTED, warnings, blockers, detail });
    }
    if (minutesUntilFirstPitch > CONFIRMED_WINDOW_OPEN_MINUTES) {
      return buildResult({ decision: Decision.WAIT, status: ReadinessStatus.BEFORE_WINDOW, warnings, blockers, detail });
    }
    if (minutesUntilFirstPitch < CONFIRMED_WINDOW_CLOSE_MINUTES) {
      return buildResult({ decision: Decision.SKIP, status: ReadinessStatus.AFTER_WINDOW, warnings, blockers, detail });
    }
    stage = minutesUntilFirstPitch >= CONFIRMED_PREFERRED_END_MINUTES
      ? ConfirmedStage.PREFERRED
      : ConfirmedStage.FALLBACK;
    detail.stage = stage;
  } else {
    return fail(ReadinessStatus.X_CONFIG_INVALID, { reason: `unknown edition "${edition}"` });
  }

  // ── Required content ─────────────────────────────────────────────────────
  // Fewer than three picks is explicitly allowed; zero is a blocker.
  if (!Number.isFinite(validPicks) || validPicks < 1) {
    return fail(ReadinessStatus.NO_VALID_PICKS, { validPicks });
  }
  if (validPicks < 3) warnings.push("FEWER_THAN_THREE_PICKS");

  if (!image?.exists) return fail(ReadinessStatus.IMAGE_MISSING);
  if (image.slateDate && image.slateDate !== slateDate) {
    return fail(ReadinessStatus.IMAGE_WRONG_SLATE, { imageSlateDate: image.slateDate });
  }
  if (!image.slateDate) warnings.push("IMAGE_SLATE_DATE_UNKNOWN");
  const w = Number(image.width); const h = Number(image.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return fail(ReadinessStatus.IMAGE_UNUSABLE, { width: image.width, height: image.height });
  }

  // ── Live posting configuration ───────────────────────────────────────────
  if (liveMode && !(allowLivePost && credentialsPresent && verifiedAccount)) {
    return fail(ReadinessStatus.X_CONFIG_INVALID, { allowLivePost, credentialsPresent, verifiedAccount });
  }

  // ── Edition policy ───────────────────────────────────────────────────────
  if (edition === "morning") {
    // No lineup requirement whatsoever: not opposing orders for K, not batting
    // orders for HR. The caption says to check lineups precisely because this
    // edition does not claim them.
    return buildResult({
      decision: Decision.POST,
      status: ReadinessStatus.READY_MORNING,
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
      decision: Decision.POST,
      status: ReadinessStatus.READY_CONFIRMED_SELECTIONS,
      stage, caption: Caption.CONFIRMED_COMPLETE, confirmationComplete: true,
      warnings, blockers, detail,
    });
  }

  if (stage === ConfirmedStage.PREFERRED) {
    // Still time for orders to post; keep waiting, but only within the
    // preferred stage -- the fallback stage below guarantees this cannot
    // defer indefinitely the way the old design did.
    return buildResult({
      decision: Decision.WAIT,
      status: ReadinessStatus.WAITING_FOR_SELECTED_LINEUPS,
      stage, confirmationComplete: false, warnings, blockers, detail,
    });
  }

  // Fallback stage: publish the best valid current-slate card. Incomplete
  // confirmation is a soft warning here, never a blocker, and the caption
  // must not claim lineups are confirmed.
  warnings.push("SELECTED_LINEUP_CONFIRMATION_INCOMPLETE");
  return buildResult({
    decision: Decision.POST,
    status: ReadinessStatus.READY_FALLBACK_INCOMPLETE_LINEUPS,
    stage, caption: Caption.CONFIRMED_INCOMPLETE, confirmationComplete: false,
    warnings, blockers, detail,
  });
}
