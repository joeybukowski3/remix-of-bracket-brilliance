/** One event, one market, one request. Deliberately has no CLI or auto-approval path. */
import type { SourceLicense } from "../sources/types";
import { ODDS_SOURCE_LICENSES, ODDS_SOURCE_PROFILES } from "./oddsSources";
import type { RequestGate } from "./budget";
import type { PropsProvider, PropsFetchResult } from "./pregameJob";
import type { ProbeClaim } from "./probeClaim";

export interface OneCreditProbeDeps {
  eventId: string;
  gate: RequestGate;
  provider: PropsProvider;
  claim: ProbeClaim;
  approvalId: string;
  license?: SourceLicense;
}

export function oneCreditNbaProbe(deps: OneCreditProbeDeps): () => Promise<PropsFetchResult> {
  let used = false;
  return async () => {
    if (used) return { status: "error", message: "single-use NBA probe already attempted", creditsCharged: 0 };
    used = true;
    if (!deps.eventId.trim()) return { status: "error", message: "NBA event id required", creditsCharged: 0 };
    if (!(deps.license ?? ODDS_SOURCE_LICENSES["the-odds-api"]).permittedUses.includes("private-research")) return { status: "error", message: "NBA Odds API license gate closed", creditsCharged: 0 };
    if (deps.provider.sourceId !== "the-odds-api" || deps.gate.accountId !== ODDS_SOURCE_PROFILES["the-odds-api"].quotaAccountId || !deps.gate.enforcesNbaAllowance) return { status: "error", message: "NBA probe quota gate mismatch", creditsCharged: 0 };
    if (!(await deps.claim.claim(deps.approvalId, "NBA one-event player_points one-credit probe", deps.eventId))) return { status: "error", message: "NBA probe approval already claimed", creditsCharged: 0 };
    const reservation = await deps.gate.reserve(1, "/events/{id}/odds");
    if (reservation.ok === false) return { status: "error", message: `NBA probe quota denied: ${reservation.code}`, creditsCharged: 0 };
    const request = { sourceEventId: deps.eventId, markets: ["pts"] as const };
    let result: PropsFetchResult;
    try {
      deps.provider.authorizeRequest?.(request);
      result = await deps.provider.fetchEventProps(request);
    } catch {
      result = { status: "error", message: "NBA probe request failed", failureKind: "network-error", creditsCharged: null };
    }
    try {
      await reservation.settle(result.creditsCharged, result.status === "ok" ? "ok" : result.failureKind ?? "provider-error", result.usageIssue, result.usageSnapshots);
    } catch {
      return { status: "error", message: "NBA probe quota settlement uncertain; approval remains consumed", creditsCharged: null };
    }
    return result;
  };
}
