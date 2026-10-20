# Phase 5E: one-credit NBA probe readiness

Status: **NO-GO as of 2026-10-19**. This is a rights-decision proposal and offline audit. It does not grant permission, change quotas, create an approval, or contact the provider.

## Proposed rights decision

The provider's [Terms and Conditions, last updated August 31, 2026](https://the-odds-api.com/terms-and-conditions.html) expressly allow storing and retaining data indefinitely, research and analytical dashboards, derived values, and statistical or machine-learning training. They allow display in websites and commercial applications, while barring resale, repackaging or redistribution as a standalone API, feed or download. The terms say attribution is appreciated but not required. The [NBA product page](https://the-odds-api.com/sports/nba-odds.html) says current NBA player props use the event-odds endpoint and current data is available on the free plan. The [public plan page](https://the-odds-api.com/) lists Starter at $0, 500 credits/month, all sports and all betting markets; historical API access is excluded. The distinction is material: storing current odds collected now is permitted by the terms, while fetching past snapshots from the historical API requires a paid plan.

**Proposal for owner review:** permit `private-research`, `model-development`, and `public-display` for this source, covering private prediction and evaluation, storage of captured current odds, model training, and public derived statistics and projections. Continue to forbid `raw-redistribution`, standalone odds feeds, and downloadable raw records. This proposal concerns rights only; it does not establish that the existing credential belongs to the free account, that its subscription is active, or that there is sufficient credit headroom. Keep `ODDS_SOURCE_LICENSES["the-odds-api"]` closed pending an explicit decision.

## Account evidence required from the owner

Use the authenticated [account dashboard](https://dash.the-odds-api.com/) personally. Share only the plan name and price, monthly limit, used and remaining credits with observation time and reset date, and whether current NBA `player_points` is available to that account. Do not share a credential or a screenshot that displays it. Confirm whether `THE_ODDS_API_KEY`, used by the proposed local probe and the NFL daily job, belongs to this same dashboard account; the other two configured key names remain unverified. The public plan page supports possible entitlement but is not proof of the existing account's state.

A dashboard reading alone does not currently populate the local quota ledger. `monthEvidence` requires a same-month provider snapshot in `FileUsageStore`; the probe CLI has no reviewed path for recording a dashboard reading. Do not treat the October 19 historical 232/500 observation as current headroom.

## Path audit

| Requirement | Finding |
| --- | --- |
| One event, points only, US only | CLI accepts one `--event-id`, the probe supplies only `pts`, and the adapter fixes `basketball_nba`, `regions=us`, `oddsFormat=american`. |
| One request, no retry | The probe closure and adapter make one fetch attempt each per invocation. Neither retries. A new CLI invocation creates a new closure. |
| At most one expected billable credit | The [v4 event-odds cost rule](https://the-odds-api.com/liveapi/guides/v4/) is unique markets returned × regions requested, so this request shape costs at most one credit under the published rule. A provider-side discrepancy cannot be prevented after sending the request. |
| Single-use approval | **Gap:** quota approval tracks charged units, not attempt count. If a response reports `x-requests-last: 0` (possible for empty data), the ledger records zero and the same approval can fund a later process. The one-use closure only protects one process. |
| Fresh counter and other-sports reserve | The NBA request gate checks the 24-hour evidence limit, 206/month, 15/day, and the peer reserve before reserving. The current account is still unknown/blocked with no approval. Dashboard evidence is not ingested by the CLI. |
| Failure and header reconciliation | Missing headers or network failures conservatively charge the estimate. **Gaps:** the adapter ignores `x-requests-used` and `x-requests-remaining`; if `x-requests-last` exceeds the estimate, it discards that value and records only the one-credit estimate. Header disagreement is not flagged. A settlement failure may be retried as a network-error settlement and leave an unclear result. |
| Credential safety | The adapter returns generic errors and does not return or print the key or provider body. The key is sent as the provider-required query parameter only after authorization. |
| Event discovery | The CLI performs no discovery; an event ID must be supplied. The provider's [v4 `/events` endpoint](https://the-odds-api.com/liveapi/guides/v4/) excludes odds and costs zero credits, but no separately gated NBA discovery command exists. No discovery request was made. |

## Response-shape audit

The parser tolerates books with no requested market and reports missing or incomplete Over/Under sides. It separates different point values and sportsbooks. It requires a player `description`, and a missing timestamp yields a line of unknown freshness in the pregame snapshot path. It accepts market-level update times, as the [v4 event-odds response schema](https://the-odds-api.com/liveapi/guides/v4/) describes. Limits: one malformed outcome whose `price` is not a number fails the entire event schema rather than retaining valid books; player descriptions alone cannot distinguish two athletes with the same name on different teams; duplicate book/market records are not explicitly resolved. These are data-quality limits for a one-credit probe, and any real response would need review before use in research or display.

## GO conditions

Before separately approving a live request: record the owner-approved rights decision; verify the same existing free account, entitlement and fresh counter; add a reviewed way to enter that counter into the local quota ledger; make the one-credit approval irrevocable after one **attempt**, even when the provider charges zero; conservatively reconcile all three usage headers and flag disagreement; and choose one event ID through a separately authorized, gated discovery step or a verified dashboard listing. Keep the NFL and other-sports reserve check intact. No live probe is authorized by this document.
