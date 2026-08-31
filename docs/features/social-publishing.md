# MLB automated X / social publishing

Durable operational contract for the JoeKnowsBall MLB automated X (Twitter)
publishing system: which workflow is canonical, how HR and K are gated, and the
duplicate-protection machinery. This is a **feature/automation** document — it
owns routes, producers, workflows, and current-vs-legacy status. Model
methodology lives in the HR / K model and feature docs.

Subject to the authority hierarchy in [../DECISIONS.md](../DECISIONS.md)
(`KS-004`, `KS-005`, `KS-008`). Surface routing: [mlb.md](mlb.md). Do not modify
the workflows named here without explicit approval (AGENTS.md "Workflow and
production safety").

Point-in-time evidence, **not** current authority: memory `mlb-x-slate-timing`
(PR #67).

## Canonical publisher

`.github/workflows/mlb-x-canonical.yml` — **"MLB X Canonical Publisher"** — is
the one and only scheduled, live-capable public MLB X publisher for the HR and K
products. Its Phase 7 cutover header states this explicitly: every legacy
scheduled / live-capable HR-K path was retired **in the same PR** that enabled
it, so no interval exists where two systems could publish the same
product / slate date.

Entry script: `scripts/post-mlb-social-canonical.mjs` (also the manual/local
entry point) → `publishCanonicalSocialPost` in
`scripts/lib/mlb-social-canonical-publisher.mjs`. Readiness policy:
`scripts/lib/mlb-x-canonical-readiness.mjs`. Plan construction:
`scripts/lib/mlb-social-plan-source.mjs` → `composeSocialPostPlan`
(`scripts/lib/mlb-social-composition.mjs`).

### HR and K are independent products / jobs

The workflow has two jobs — `publish-hr` and `publish-k` — each with its own
`concurrency` group (`mlb-x-canonical-hr`, `mlb-x-canonical-k`), its own image
directory, its own lease directory, its own state-work dir, and its own
canonical receipt namespace. One product's failure (X API error, image render
failure, missing production data) can never block, delay, or duplicate the
other. There is deliberately no workflow-wide concurrency group.

### Schedule / cadence

Two cron expressions, `*/15 12-23 * * *` and `*/15 0-2 * * *` — every 15 minutes
across roughly 8am–10pm ET on both DST offsets, reusing the retired poll
workflow's exact pregame window. Plus `workflow_dispatch`. Most firings resolve
to a cheap `NO_POST_YET` / `ALREADY_PUBLISHED`; canonical readiness decides per
firing whether there is anything to do.

### Concurrency behavior

`concurrency: { group: mlb-x-canonical-<product>, cancel-in-progress: false }`.
This only prevents two overlapping **scheduled runs for the same product** from
racing before the lease/receipt becomes visible. The authoritative one-post
guarantee is the receipt + lease, not the concurrency group.

## Duplicate-protection machinery

### One post per product / slate date (receipt identity)

Publication identity is `plan.receiptKey` = `${product}:${slateDate}` — **no
morning/confirmed/edition axis**. `product` is `mlb-hr-props` or `mlb-k-props`;
`slateDate` is the ET slate calendar date (never the runner's UTC date — every
job derives it via `TZ=America/New_York date +%Y-%m-%d`). A receipt already
recorded for that key blocks a later attempt for the same product/date outright,
**regardless of `rowFingerprint`**: a data change after the first canonical post
can never become a second primary or an "update" tweet. `rowFingerprint` governs
only image-bundle reuse, never whether a new primary is allowed.

### Receipts

Path: `mlb-x/<slate-date>/canonical/<product>.json` on the state branch
(`canonicalReceiptPathFor` in `scripts/lib/mlb-x-state-store.mjs`). Distinct from
the legacy market/edition namespace (`mlb-x/<date>/<market>-<edition>.json`) and
the daily-card namespace (`mlb-x/<date>/receipts/daily-card-morning.json`).
Written **before** the reply is attempted so a crash cannot duplicate the
primary. The receipt also persists the reply decision and exact reply text
(`replyRequired`, `replyCaption`, `replyStatus`) computed once from the frozen
plan — a later reply-only recovery reads that text, never a freshly recomposed
plan.

### Leases

`acquirePublicationLease({ receiptKey, leaseDir })`
(`scripts/lib/mlb-x-publication-lease.mjs`), keyed by `product:slateDate`. An
in-process guard around the exact publish sequence; the receipt re-read happens
**under** the lease. A lost lease returns `LEASE_UNAVAILABLE` (no post).

### State branch

`automation/mlb-x-state` (`MLB_X_STATE_BRANCH`). A dedicated git branch —
strongly consistent read-after-write via `fetch`, never Actions cache or
artifacts. Fetched as a **separate clone** (`MLB_X_STATE_REMOTE_URL`, a
token-embedded URL that is masked and never echoed). Never force-pushes; a push
that loses a race resets onto the fetched tip and re-applies. A competing
runner's receipt for the same product/date stops the retry and surfaces their
receipt rather than clobbering it (`conflicted: true`). A `vercel.json`
ignore-command on the branch keeps state commits from triggering deploys
(`[skip ci]` commit messages).

### Readiness gating

`evaluateCanonicalPublication` resolves exactly four public statuses:

- `NO_POST_YET` — keep evaluating on a later run (data may still resolve).
- `READY_TO_PUBLISH` — publish this exact frozen plan now.
- `ALREADY_PUBLISHED` — receipt says done (or primary posted / reply pending
  recovery-only); never post a new primary.
- `NO_POST_FOR_SLATE` — terminal; the slate has genuinely closed
  (`isExpired` / `allGamesStarted` from `mlb-x-slate-timing.mjs`) with no
  publication; never revisited.

Ordered checks: (1) receipt-first (a fully-published product returns before any
plan build, timing fetch, or render); (2) terminal slate condition;
(3) `plan == null` → `NO_QUALIFIED_PLAN` (composition enforces the
`DISPLAY_MIN_ROWS = 2` floor, this module never second-guesses it);
(4) confirmation completeness — `deriveConfirmationCompleteness` requires
`pendingConfirmationCount === 0` (HR's `projectedExcludedCount` / K's
`heldForOpposingCount`); unknown (`null`) is treated as still-pending, never
assumed complete; (5) per-row pregame safety.

### Failure-closed behavior

- Live posting is **off by default at every layer**. `--live` alone is not
  enough; `assertLivePostAllowed` also requires `GITHUB_EVENT_NAME` ∈
  {`workflow_dispatch`, `schedule`, `workflow_run`} **and**
  `X_ALLOW_LIVE_POST === "true"` (an operator-set repo variable, never a
  hardcoded literal, unset = closed) **and** real `JKB_X_*` credentials **and**
  `verifyExpectedXAccount` matching `_joeknowsball_`. Omitting `--dry-run` and
  `--live` still resolves to a dry run.
- `--source=production` is the only source a scheduled live run may use. For K
  it **throws** rather than posting if the candidates file is missing/malformed
  — a scheduled run can never silently post fixture placeholder data.
- `CONSISTENCY_FAILED` blocks publication if the caption or freshly-rendered
  graphic does not describe the same frozen plan in the same order.
- Phase 7 cutover guard: `isBeforeCanonicalCutover` refuses any slate date
  before `CANONICAL_CUTOVER_FIRST_SLATE_DATE = "2026-08-20"` (legacy systems may
  have published those under a different receipt namespace).

### Game identity and doubleheaders

Each plan row carries its **own** `gameId` / `gameStartTime` / `gameNumber` /
`isDoubleheader`. `evaluateRowTimingSafety` is per-row and fails closed: a row
with no parseable `gameStartTime` is `MISSING_GAME_START_TIME` (unsafe); a row
whose game starts in `< ROW_SAFE_PREGAME_MINUTES` (40, the repo-wide
`FINAL_CUTOFF_MINUTES`) blocks the whole plan. A doubleheader G1 leg that has
started blocks the plan even when G2 is hours out. G1/G2 identity comes only from
authoritative doubleheader schedule data (`isDoubleheaderCode` on the raw
`doubleHeader` field / `gameNumber`), never inferred.

## K candidate selection

The K job first runs
`npx tsx scripts/generate-mlb-k-production-candidates.ts` →
`buildCanonicalKCandidatePool` (`src/lib/mlb/kPropCanonicalCandidates.ts`),
writing `artifacts/mlb-x-canonical/k-production-candidates.json`. That pool is
the **union of the Strikeout Props page's Top Over Plays and Top Under Plays**,
produced by the site's own `buildPitcherStrikeoutRows` →
`buildKPropBestBets(rows, 3)` pipeline, unchanged. It never scrapes rendered HTML
and never recomputes eligibility. The generator step writes JSON only — no X
call, no receipt, no state write.

## Site selection vs social selection

For **K**, the social candidate source *is* the site's Strikeout Props
best-bets selection authority (same `buildKPropBestBets`), so the website and the
X post cannot disagree about which pitchers/sides qualify. `composeSocialPostPlan`
then applies its own display cap/floor (`DISPLAY_MIN_ROWS = 2`,
`DISPLAY_MAX_ROWS = 5`) and doubleheader-aware ordering on that already-ranked
pool. For **HR**, `--source=production` reads the same committed
`public/data/mlb/hr-props-raw.json` the site reads, through the real
`getHrCandidatePoolWithPendingConfirmation` path. Neither publisher reranks or
reselects after a plan is frozen.

## Numerology and Moneyline social paths (not the canonical publisher)

- **Numerology** delivery (email + X) is a **separate** system:
  `.github/workflows/poll-mlb-numerology-delivery.yml`
  (`scripts/plan-mlb-numerology-delivery.mjs`,
  `scripts/lib/mlb-numerology-x-selection-core.mjs`,
  `scripts/generate-mlb-numerology-email.mjs`). First-pitch-relative
  120 / 75 / 30-minute timing; confirmed-lineup-only + score-threshold
  eligibility; one frozen selection artifact shared between email and X so they
  can never diverge; independent per-channel delivery receipts. See
  [numerology.md](numerology.md). `post-mlb-numerology-to-x.yml` and
  `mlb-numerology-email-rescue.yml` are manual/rescue-only.
- **Moneyline** X posting (`post-mlb-ml-edges-to-x.yml`,
  `scripts/post-mlb-ml-edges-to-x.mjs`) is **PAUSED** —
  `ML_X_POSTING_ENABLED` gates every live path and is not set. Generation /
  preview only.

## Legacy / retired publishers

All retained for forensic/manual dry-run only — none can reach a live post
through any trigger:

| Workflow | Status |
| --- | --- |
| `mlb-x-editions.yml` (K/HR morning + confirmed, daily-card-morning) | Scheduled/`workflow_run` live capability **permanently retired** (Phase 7). Only dry-run / diagnostic modes remain; still generates daily model cards as artifacts. |
| `poll-mlb-x-posts.yml` | `schedule` trigger removed; live post-hr/post-k jobs removed. Read-only `plan` diagnostic retained. |
| `post-mlb-hr-props-to-x.yml`, `post-mlb-strikeout-props-to-x.yml` | Live posting removed; `X_ALLOW_LIVE_POST` never set. `dry-run` / `verify-account` only. |
| `post-mlb-daily-picks.yml` (`scripts/generate-mlb-daily-picks.mjs`) | Deprecated legacy path; live-posting step removed entirely; generation/preview only. Candidate for deletion. |

## Relevant scripts / tests

- Publisher core: `scripts/lib/mlb-social-canonical-publisher.mjs` (+ `.test`),
  `mlb-x-canonical-readiness.mjs` (+ `.test`), `mlb-social-plan-source.mjs`,
  `mlb-social-composition.mjs`, `mlb-x-state-store.mjs` (+ `.test`),
  `mlb-x-publication-lease.mjs` (+ `.test`),
  `mlb-social-canonical-caption.mjs`, `mlb-social-canonical-image.mjs`,
  `mlb-social-plan-consistency.mjs`.
- K candidate parity: `src/lib/mlb/kPropCanonicalCandidates.test.ts`,
  `src/lib/mlb/kPropBestBets*` behavior via the Strikeout Props tests.
- Static workflow audit: `scripts/lib/mlb-x-workflows-static-audit.test.mjs`.
- Slate timing / DST: `scripts/lib/mlb-x-slate-timing.test.mjs`,
  `mlb-x-dst-gate.test.mjs`.

## Locked invariants

Proven by current committed code and workflows:

1. **One canonical scheduled live-capable MLB X publisher** — `mlb-x-canonical.yml`. No second scheduled publisher for HR/K exists.
2. **HR and K remain independently gated** — separate jobs, concurrency groups, leases, image/lease dirs, and receipt files.
3. **Receipt identity is product + ET slate date** — `${product}:${slateDate}`, no edition axis; a later run for the same product/date is `ALREADY_PUBLISHED` regardless of `rowFingerprint` / row / readiness differences.
4. **G1/G2 only from authoritative doubleheader schedule data** — per-row `gameNumber` / `isDoubleheader` / `gameStartTime`, never inferred.
5. **K social candidates reuse the canonical Strikeout Props selection authority** — `buildCanonicalKCandidatePool` → `buildPitcherStrikeoutRows` + `buildKPropBestBets`; no separate/independent K model, no HTML scrape.
6. **Live publishing fails closed unless explicitly enabled** — event gate + `X_ALLOW_LIVE_POST === "true"` + credentials + account verification; unset = no post; K `--source=production` throws rather than posting fixture data.
7. **Receipts and leases protect duplicate-post behavior** — receipt written before reply, re-read under the lease on the strongly-consistent state branch; races surface, never silently overwrite.
