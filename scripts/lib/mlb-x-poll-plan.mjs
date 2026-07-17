import { ReadinessStatus } from "./mlb-x-readiness.mjs";

export const PollPlanState = {
  READY: "READY",
  WAITING: "WAITING",
  POSTED: "POSTED",
  EXPIRED: "EXPIRED",
  NO_GAMES: "NO_GAMES",
  SOURCE_FAILURE: "SOURCE_FAILURE",
};

function stateFor({ posted, readiness }) {
  if (posted) return PollPlanState.POSTED;
  if (readiness?.finalStatus === ReadinessStatus.FAILED_CONFIRMATION_SOURCE) return PollPlanState.SOURCE_FAILURE;
  if (readiness?.finalStatus === ReadinessStatus.SKIPPED_NO_GAMES) return PollPlanState.NO_GAMES;
  if (
    readiness?.finalStatus === ReadinessStatus.SKIPPED_AFTER_CUTOFF ||
    readiness?.finalStatus === ReadinessStatus.SKIPPED_ALL_GAMES_STARTED
  ) {
    return PollPlanState.EXPIRED;
  }
  return readiness?.ready ? PollPlanState.READY : PollPlanState.WAITING;
}

function contentPlan({ posted, readiness }) {
  const state = stateFor({ posted, readiness });
  return {
    state,
    reason: posted ? ReadinessStatus.SKIPPED_ALREADY_POSTED_TODAY : readiness?.finalStatus,
    shouldRun: state === PollPlanState.READY,
    // Reporting-only game-diversity/coverage fields, forwarded verbatim from
    // resolvePostingReadiness so callers (e.g. plan-mlb-x-posts.mjs) can log
    // them without reaching past this plan into the raw readiness object.
    // null/0 for content types with no game-diversity concept (K/Numerology)
    // or once already posted, never a fabricated number.
    confirmedGameCount: readiness?.confirmedGameCount ?? null,
    confirmedRowsWithoutGameIdentity: readiness?.confirmedRowsWithoutGameIdentity ?? 0,
    scheduledGameCount: readiness?.scheduledGameCount ?? null,
    confirmedGameCoverage: readiness?.confirmedGameCoverage ?? null,
  };
}

/** Pure plan composition over already-resolved receipt and readiness inputs. */
export function createMlbXPollPlan({ slateDate, hrPosted = false, kPosted = false, hrReadiness, kReadiness } = {}) {
  const bothAlreadyPosted = hrPosted && kPosted;
  const hr = contentPlan({ posted: hrPosted, readiness: hrReadiness });
  const k = contentPlan({ posted: kPosted, readiness: kReadiness });
  return {
    slateDate,
    bothAlreadyPosted,
    shouldFetchLiveData: !bothAlreadyPosted,
    hr,
    k,
  };
}
