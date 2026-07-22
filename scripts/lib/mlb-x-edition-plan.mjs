/**
 * Four-target planner for MLB X editions.
 *
 * Builds one frozen plan per publication target -- k/morning, hr/morning,
 * k/confirmed, hr/confirmed -- each carrying the selected rows the poster will
 * publish verbatim and the readiness verdict both sides obey.
 *
 * Selection runs ONCE per market and the rows are frozen before any edition is
 * evaluated. Running selection separately per edition could produce two
 * different cards from identical inputs, and the confirmed edition is
 * explicitly allowed to republish the morning card when nothing underneath
 * changed.
 *
 * Lightweight by construction: this module reads already-loaded data and calls
 * pure functions. No Playwright, no browser, no render, no Vite build, no X
 * call, and it never writes a successful receipt.
 */
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildEditionReceiptKey, EDITIONS, MARKETS } from "./mlb-x-edition-receipts.mjs";
import { isPostedReceipt } from "./mlb-x-edition-receipts.mjs";
import { resolveEditionReadiness } from "./mlb-x-edition-readiness.mjs";

export const PLAN_VERSION = 1;

/** Geometry a pending render is expected to produce. */
const PLANNED_IMAGE = Object.freeze({ width: 1200, height: 675 });

/**
 * Normalized confirmation status for one market's frozen selections.
 *
 * Scoped to the SELECTED picks only. A slate-wide coverage requirement is what
 * pinned HR at 0/15 on 2026-07-21 while six games already had confirmed orders.
 *
 * @param {object[]} selectedRows frozen selections for this market
 * @param {(row: object) => boolean|null} isConfirmed true / false / null (unknown)
 * @param {(row: object) => string|number|null} getGameId game identity for coverage
 */
export function buildSelectedLineupStatus({ selectedRows = [], isConfirmed = () => null, getGameId = (row) => row?.gameId ?? null, promotedFromLiveCount = 0 } = {}) {
  const selectedGames = new Set();
  const confirmedGames = new Set();
  const unresolvedPlayers = [];
  let confirmedPickCount = 0;

  for (const row of selectedRows) {
    const gameId = getGameId(row);
    if (gameId != null) selectedGames.add(gameId);
    const confirmed = isConfirmed(row);
    if (confirmed === true) {
      confirmedPickCount += 1;
      if (gameId != null) confirmedGames.add(gameId);
    } else {
      // Both an explicit false and an unknown null are unresolved: neither is
      // confirmation, and the fallback stage exists precisely for this state.
      unresolvedPlayers.push(row?.player ?? row?.pitcher ?? null);
    }
  }

  const selectedPickCount = selectedRows.length;
  return {
    selectedPickCount,
    selectedGameCount: selectedGames.size,
    confirmedPickCount,
    confirmedGameCount: confirmedGames.size,
    unresolvedPickCount: selectedPickCount - confirmedPickCount,
    unresolvedPlayers: unresolvedPlayers.filter(Boolean),
    coverageRatio: selectedPickCount ? confirmedPickCount / selectedPickCount : 0,
    fullyConfirmed: selectedPickCount > 0 && confirmedPickCount === selectedPickCount,
    promotedFromLiveCount,
  };
}

/**
 * Builds all four plans.
 *
 * @param {object} params
 * @param {object} params.markets per-market frozen input keyed "k" and "hr"
 */
export function buildEditionPlans({
  now,
  slateDate,
  firstGameTime = null,
  gamesScheduled = 0,
  markets = {},
  readReceipt = () => null,
  imageBundleFor = () => null,
  liveMode = false,
  allowLivePost = false,
  credentialsPresent = false,
  verifiedAccount = false,
  generatedAt = new Date().toISOString(),
}) {
  const plans = [];

  for (const market of MARKETS) {
    const source = markets[market] ?? null;
    for (const edition of EDITIONS) {
      const receiptKey = buildEditionReceiptKey({ market, slateDate, edition });
      const receipt = readReceipt(receiptKey);
      const posted = isPostedReceipt(receipt);

      // A market whose artifact is missing blocks only that market. The other
      // market's two editions are unaffected.
      const available = Boolean(source?.available !== false && source);
      const selectedRows = available ? (source.selectedRows ?? []) : [];
      const lineupStatus = available
        ? (source.selectedLineupStatus ?? buildSelectedLineupStatus({ selectedRows }))
        : buildSelectedLineupStatus({ selectedRows: [] });

      const bundle = imageBundleFor(market);
      const imageReadyAtPlanTime = Boolean(bundle?.valid);
      const posterMustRenderImage = !imageReadyAtPlanTime;

      // A missing image must not suppress an otherwise eligible target: the
      // poster renders synchronously and revalidates with the real bundle
      // before publishing. Planning therefore evaluates against the image the
      // poster is contracted to produce, and records that it must.
      const image = imageReadyAtPlanTime
        ? { exists: true, slateDate: bundle.metadata.slateDate, generatedAt: bundle.metadata.generatedAt, width: bundle.metadata.width, height: bundle.metadata.height, source: "bundle", path: bundle.metadata.imagePath }
        : { exists: true, slateDate, generatedAt: null, ...PLANNED_IMAGE, source: "pending-render", path: null };

      const readiness = resolveEditionReadiness({
        now,
        slateDate,
        market,
        edition,
        firstGameTime,
        gamesScheduled: available ? gamesScheduled : 0,
        artifactSlateDate: available ? source.artifactSlateDate ?? slateDate : null,
        artifactGeneratedAt: available ? source.artifactGeneratedAt ?? null : null,
        artifactFreshnessStatus: available ? source.artifactFreshnessStatus ?? null : null,
        validPicks: selectedRows.length,
        selectedGames: selectedRows.map((row) => row?.gameId ?? null).filter((id) => id != null),
        selectedLineupStatus: edition === "confirmed"
          ? { total: lineupStatus.selectedPickCount, confirmed: lineupStatus.confirmedPickCount }
          : null,
        image,
        receipt: { exists: Boolean(receipt), outcome: receipt?.outcome ?? null, postId: receipt?.postId ?? null },
        liveMode,
        allowLivePost,
        credentialsPresent,
        verifiedAccount,
      });

      plans.push({
        version: PLAN_VERSION,
        market,
        edition,
        slateDate,
        generatedAt,
        firstGameTime,
        selectedRows,
        selectedLineupStatus: lineupStatus,
        readiness,
        artifactSources: available ? source.artifactSources ?? [] : [],
        artifactGeneratedAt: available ? source.artifactGeneratedAt ?? null : null,
        promotedFromLiveCount: lineupStatus.promotedFromLiveCount ?? 0,
        imageReadyAtPlanTime,
        posterMustRenderImage,
        alreadyPosted: posted,
      });
    }
  }
  return plans;
}

export function planFileName(market, edition) {
  return `${market}-${edition}.json`;
}

/** Writes each plan through a temp file + rename so no reader sees a partial plan. */
export function writePlansAtomically(plans, directory) {
  mkdirSync(directory, { recursive: true });
  const written = [];
  for (const plan of plans) {
    const target = path.join(directory, planFileName(plan.market, plan.edition));
    const temp = `${target}.tmp`;
    writeFileSync(temp, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    renameSync(temp, target);
    written.push(target);
  }
  return written;
}

/** Small scalar outputs for the workflow. The full plan stays in the artifact. */
export function toWorkflowOutputs(plans) {
  const outputs = {};
  for (const plan of plans) {
    const prefix = `${plan.market}_${plan.edition}`;
    outputs[`${prefix}_should_run`] = String(Boolean(plan.readiness.shouldRunPoster));
    outputs[`${prefix}_status`] = plan.readiness.status;
    outputs[`${prefix}_stage`] = plan.readiness.stage ?? "";
    outputs[`${prefix}_receipt_key`] = plan.readiness.receiptKey ?? "";
    outputs[`${prefix}_plan_file`] = planFileName(plan.market, plan.edition);
    outputs[`${prefix}_reason`] = conciseReason(plan);
  }
  return outputs;
}

function conciseReason(plan) {
  const r = plan.readiness;
  if (r.status === "READY_TO_POST" || r.status === "READY_TO_FALLBACK_POST") {
    return `${plan.selectedRows.length} picks; ${r.confirmationComplete ? "confirmed" : "unconfirmed"} lineups`;
  }
  if (r.blockers?.length) return `blocked: ${r.blockers.join(",")}`;
  if (r.status === "WAITING_FOR_SELECTED_LINEUPS") {
    const s = plan.selectedLineupStatus;
    return `${s.confirmedPickCount}/${s.selectedPickCount} selected picks confirmed`;
  }
  return r.status;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export const PlanRejection = Object.freeze({
  UNSUPPORTED_VERSION: "UNSUPPORTED_VERSION",
  INVALID_MARKET: "INVALID_MARKET",
  INVALID_EDITION: "INVALID_EDITION",
  MISSING_SLATE_DATE: "MISSING_SLATE_DATE",
  MALFORMED_FIRST_GAME_TIME: "MALFORMED_FIRST_GAME_TIME",
  SELECTED_ROWS_NOT_ARRAY: "SELECTED_ROWS_NOT_ARRAY",
  READINESS_MISSING: "READINESS_MISSING",
  READINESS_TARGET_MISMATCH: "READINESS_TARGET_MISMATCH",
  READINESS_RECEIPT_KEY_MISMATCH: "READINESS_RECEIPT_KEY_MISMATCH",
  PLAN_SLATE_MISMATCH: "PLAN_SLATE_MISMATCH",
  INVALID_LINEUP_STATUS: "INVALID_LINEUP_STATUS",
  NEGATIVE_COUNT: "NEGATIVE_COUNT",
  CONFIRMED_EXCEEDS_SELECTED: "CONFIRMED_EXCEEDS_SELECTED",
  UNRESOLVED_COUNT_INCONSISTENT: "UNRESOLVED_COUNT_INCONSISTENT",
});

/**
 * Validates a plan before a poster acts on it. The poster must fail visibly
 * rather than silently publish a card built from a plan it cannot trust.
 *
 * @param {object} plan
 * @param {object} [expected] {slateDate, market, edition} the poster believes it is running
 */
export function validatePlan(plan, expected = {}) {
  const reject = (reason, detail = null) => ({ valid: false, reason, detail });

  if (!plan || typeof plan !== "object") return reject(PlanRejection.READINESS_MISSING);
  if (plan.version !== PLAN_VERSION) return reject(PlanRejection.UNSUPPORTED_VERSION, plan.version);
  if (!MARKETS.includes(plan.market)) return reject(PlanRejection.INVALID_MARKET, plan.market);
  if (!EDITIONS.includes(plan.edition)) return reject(PlanRejection.INVALID_EDITION, plan.edition);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(plan.slateDate ?? ""))) return reject(PlanRejection.MISSING_SLATE_DATE, plan.slateDate);
  if (plan.firstGameTime != null && !Number.isFinite(Date.parse(plan.firstGameTime))) {
    return reject(PlanRejection.MALFORMED_FIRST_GAME_TIME, plan.firstGameTime);
  }
  if (!Array.isArray(plan.selectedRows)) return reject(PlanRejection.SELECTED_ROWS_NOT_ARRAY);

  const r = plan.readiness;
  if (!r || typeof r !== "object") return reject(PlanRejection.READINESS_MISSING);
  if (r.detail?.market !== plan.market || r.detail?.edition !== plan.edition) {
    return reject(PlanRejection.READINESS_TARGET_MISMATCH, { market: r.detail?.market, edition: r.detail?.edition });
  }
  const expectedKey = buildEditionReceiptKey({ market: plan.market, slateDate: plan.slateDate, edition: plan.edition });
  if (r.receiptKey !== expectedKey) return reject(PlanRejection.READINESS_RECEIPT_KEY_MISMATCH, r.receiptKey);

  for (const [key, value] of Object.entries(expected)) {
    if (value != null && plan[key] !== value) {
      return reject(key === "slateDate" ? PlanRejection.PLAN_SLATE_MISMATCH : PlanRejection.READINESS_TARGET_MISMATCH, { key, expected: value, actual: plan[key] });
    }
  }

  const s = plan.selectedLineupStatus;
  if (!s || typeof s !== "object") return reject(PlanRejection.INVALID_LINEUP_STATUS);
  const counts = [s.selectedPickCount, s.confirmedPickCount, s.unresolvedPickCount, s.selectedGameCount, s.confirmedGameCount];
  if (counts.some((c) => !Number.isFinite(c))) return reject(PlanRejection.INVALID_LINEUP_STATUS, counts);
  if (counts.some((c) => c < 0)) return reject(PlanRejection.NEGATIVE_COUNT, counts);
  if (s.confirmedPickCount > s.selectedPickCount) return reject(PlanRejection.CONFIRMED_EXCEEDS_SELECTED, s);
  if (s.confirmedGameCount > s.selectedGameCount) return reject(PlanRejection.CONFIRMED_EXCEEDS_SELECTED, s);
  if (s.unresolvedPickCount !== s.selectedPickCount - s.confirmedPickCount) {
    return reject(PlanRejection.UNRESOLVED_COUNT_INCONSISTENT, s);
  }
  // selectedRows and the status it describes must agree.
  if (s.selectedPickCount !== plan.selectedRows.length) {
    return reject(PlanRejection.UNRESOLVED_COUNT_INCONSISTENT, { selectedPickCount: s.selectedPickCount, rows: plan.selectedRows.length });
  }

  return { valid: true, reason: null, detail: null };
}
