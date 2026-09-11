# NFL Grok + ChatGPT Dual-Independent Handicapping — Architecture & Design (Phase 1)

Status: **Design/audit only. No production code implemented.** This document is
the canonical, repo-specific blueprint for a future dual-independent Grok +
ChatGPT NFL handicapping system. It does not add API calls, workflows, or
public-facing picks. See [`docs/DECISIONS.md`](DECISIONS.md) for durable
decisions and [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) for the overall
system map this plugs into.

Branch: `feat/nfl-grok-game-analysis-v1`.

---

## 0. Executive summary

The repo already has three of the hardest pieces most of the way built:

1. **A deterministic, provenance-tracked pregame context builder** —
   `scripts/lib/nfl-game-context.ts` (`buildPregameGameContext`) — that
   produces exactly the "JKB numbers only, never AI-authored, always tagged
   `available`/`unavailable`" object the spec calls the Game Context Packet.
   It needs to be *extended* (market, schedule, players, situational,
   trends, weather), not invented.
2. **An immutable, content-hashed prediction archive schema** —
   `scripts/lib/nfl-production-prediction-archive.ts`
   (`PredictionSnapshotV1`, schema `jkb-football-prediction-v1`) plus
   `scripts/resolve-nfl-prediction-outcomes.ts` — that already models
   snapshot immutability, market-line-at-selection-time capture, and
   content-hash provenance. It needs a `model: "jkb" | "grok" | "chatgpt"`
   discriminator and evidence/article references, not a parallel system.
3. **A working Grok API integration pattern** — `scripts/generate-pga-best-bets.mjs`
   (`callGrokWithRetry`, `GROK_API_KEY`, JSON-mode parsing, retry/backoff,
   `DRY_RUN` fixture replay, and an explicit "Data Discipline Rules" prompt
   block that already enforces "use only the frozen data given you, never
   invent numbers") — reusable almost as-is for the Grok NFL handicapper
   adapter's writing pass.

What's genuinely new: the evidence-normalization schema (nothing like it
exists anywhere in the repo), the ChatGPT/OpenAI adapter (no `OPENAI_API_KEY`
or OpenAI code exists yet), the comparison engine, the editorial QA layer,
and the private review UI (though its route pattern — unlisted
`/internal/<slug>` — is already established by `NflV03Review` and
`WalterResearch`).

Go/no-go risk flagged up front (see §23): **deployment target is ambiguous**
(`docs/ARCHITECTURE.md` documents both a Vercel config and a GitHub Pages
workflow with no resolved authority), which matters because AI orchestration
needs a server-side execution environment (GitHub Actions is the safe
default, matching every existing NFL data workflow's pattern).

---

## 1. Existing data inventory

All paths relative to repo root. "Pregame-safe" means the artifact is
guaranteed not to contain information generated after the field it's used
for was queried.

### 1.1 Market data

| Dataset | Path | Producer | Cadence | Pregame-safe? | Notes |
|---|---|---|---|---|---|
| Current sportsbook lines | `public/data/market/betting-lines-current.json` (`jkb-betting-lines-current-v1`) | `scripts/market/refresh-current-nfl-betting-lines.ts` | Daily 10:00 UTC, `.github/workflows/nfl-betting-lines-daily.yml` | Yes, if consumed before kickoff | Per-game `books[]`: `sportsbook`, `capturedAt`, `providerUpdatedAt`, `firstObservedAt`, `lastObservedAt`, `contentHash`, `spread{homeLine,awayLine,homePrice,awayPrice}`, `total{line,overPrice,underPrice}`, `moneyline{homePrice,awayPrice}`. Provider: the-odds-api, paid, `THE_ODDS_API_KEY`. |
| Line-movement history | `public/data/market/betting-lines-history/nfl/<jkbGameId>.json` (`jkb-betting-lines-history-v1`) | same workflow | Daily append | Yes | `series[]` = chronological, deduped-by-`contentHash` snapshots of the same per-book shape. Verified live example (`2026_01_BAL_IND.json`): 55 snapshots across 11 days. |
| Raw/private market mirror | `data/market/betting-lines/history/nfl/<season>/...`, `data/market/betting-lines/quota-state.json` | same | Daily | Yes | Odds-API credit tracking; not browser-served. |
| Legacy market view | `public/data/nfl/matchup-market.json` | nflverse-based generator | in-season, `.github/workflows/nfl-matchup-market.yml` (06:40 UTC) | Yes | Distinct from the sportsbook pipeline; the codebase deliberately keeps the two separate. |
| Yardage alt-market (Kalshi) | `public/data/nfl/nfl-yardage-alt-market.json` (`nfl-yardage-alt-market-v1`) | `.github/workflows/nfl-yardage-market.yml` | in-season | Yes | Player-level passing/rushing/receiving-yards markets (`KXNFLPASSYDS` etc.), fallback when sportsbook props are unfilled. Prop-market only, not game spread/total. |
| View adapter (not on `main`) | `src/lib/nfl/bettingLinesView.ts`, `src/hooks/useNflBettingLines.ts` | branch `feat/nfl-matchup-betting-lines-adapter` | n/a | n/a | `selectSportsbook` (deterministic priority draftkings→fanduel→betmgm→caesars→first-available, **never averages**), `deriveFreshness` (fresh ≤6h/recent ≤24h/stale), `deriveLineMovement` (pure `current - firstObserved`, no interpolation). Directly reusable read layer for the context builder once merged. |
| Market UI (not on `main`) | `src/components/nfl/matchups/MatchupMarketContext.tsx`, `bettingLinesPresentation.ts` | branch `feat/nfl-matchup-betting-lines-ui[-v2]` | n/a | n/a | Current Market + Line Movement + Splits-placeholder UI; stopped for visual review per prior session notes. |

**Critical caveat for article generation**: the-odds-api adapter's own doc
comment states it does **not** supply a true market open — `firstObservedAt`
means "earliest snapshot JKB happened to capture," not the market's actual
opening line. Any article text claiming an "opening line" must be phrased as
"first tracked line" or equivalent, never as the true open. This must be
enforced by the fact-validator (§ "Fact validation").

### 1.2 JKB models

| Dataset | Path | Producer | Model version | Cadence | Notes |
|---|---|---|---|---|---|
| Power ratings | `public/data/nfl/<season>/power-ratings.json` | `scripts/generate-nfl-team-stats-power-ratings.mjs` et al. | `nfl-power-v0.3.1` (nflfastR play-by-play EPA) | in-season, `.github/workflows/nfl-team-ratings.yml` (Tuesdays) | `docs/models/nfl-power-rating.md` is the current authority; `docs/nfl-power-v0.3.1-epa-migration.md` is historical migration record. Earlier `v0.1`/`v0.2` notes in `docs/nfl-data-inventory.md` are superseded. |
| Projected spread/total | consumed via matchup analyzer artifacts | — | `nfl-spread-v0.1.0` | in-season | `docs/models/nfl-projected-spread.md` is the authority. Compares JKB fair line vs market line — this is the "JKB numbers remain authoritative" boundary the AI writers may reference but never override. |
| Matchup EPA windows | `public/data/nfl/matchup-epa.json` | — | — | in-season | Consumed directly by `buildEpaContext` in `scripts/lib/nfl-game-context.ts`; window `"prior-season-full"` only (leakage-safe by construction — always season N-1 or earlier). |
| Matchup metrics (YPP etc.) | `public/data/nfl/matchup-metrics.json` | — | — | in-season | Consumed by `buildYppContext`. |
| Trench metrics | `public/data/nfl/matchup-trench-metrics.json` | ESPN trench-metrics archive ingest | — | annual/season | Consumed by `buildTrenchesContext`; window `"prior_season_through_week_18"`. Components: off pass-block/run-block win rate, def pass-rush/run-stop win rate. |
| Coaching ratings | `rating-snapshots/<season>/<week>.json` (point-in-time) | Coaching Rating v1 pipeline | — | weekly snapshot | Consumed by `buildCoachingContext`; explicit leakage guard (`generated_from_cutoff` must not be after kickoff) and an explicit `SOURCE_UNAVAILABLE` contract — never silently falls back to current ratings for a historical game. Even-threshold `±4`. |
| Team identity | `public/data/nfl/teams.json` | hand-curated | — | static | `id`, `slug`, `abbr`, `nflverseAbbr`, `name`/`fullName`/`shortName`, `conference`/`division`, `primaryColor`/`logoUrl`, `isDome`/`latitude`/`longitude`. Canonical source of truth; every generated file must resolve team codes against it. |
| Team comparison / period selector | `src/components/nfl` matchup-comparison components | — | — | — | Period selector `2025 / 2026 / Last8`; SoS via EPA-Overall rank. |

### 1.3 Player / fantasy / prop / situational

| Dataset | Path | Producer | Cadence | Notes |
|---|---|---|---|---|
| Yardage projections | `public/data/nfl/<season>/yardage-projections.json` | `scripts/generate-nfl-current-week-yardage-projections.ts` | weekly, frozen strictly before first kickoff of the target week | `NflYardageProjection` (statistical), `NflYardageMatchupScore` (0-100 presentation, opportunity+environment, **not** an edge/confidence), `NflYardagePropEdge` (schema-only, unimplemented — sportsbook player-prop lines explicitly blocked pending a free-first-compliant source). QB starter resolution is heuristic (`starterUncertain` flag) — no real depth-chart-order source exists yet. |
| TD Score | `public/data/nfl/2026/touchdown-preview.json` | `scripts/generate-nfl-touchdown-preview.ts` | weekly | Presentation-only 0-100 composite (25% TD opportunities, 20% player usage, 15% team usage%, 15% empirical-Bayes TD success, 10% opponent TD-opp-against, 10% opponent TDs-to-position, 5% implied team points). Fails closed to `null` on any missing component. Windows: 2025/2026/last8 (default). |
| DFS lineup context | `public/data/nfl/dfs/<season>/week-<NN>.json` (`nfl-dfs-lineup-context-v1`) | `scripts/generate-nfl-dfs-lineup-context.ts` | weekly, 48h freshness window | **Closest existing thing to a mini game-context aggregator.** Per-player rows with `depthRank`, `starterEvidence`, `roleConflict`, `projectedCarries`/`projectedTargets`, `availability`/`availabilityStale`/`injuryFeedStale`, and full `sourceReferences` provenance. Top-level `sources[]` lists every upstream artifact + sha256 — **this provenance pattern should be reused verbatim for the Game Context Packet's `provenance` block.** Composes: fantasy projections, yardage-projections, depth-charts, weekly-rosters, matchup-injuries, games.json, team-performance-analytics, power ratings, matchup-market, team-totals, matchup-trench-metrics. |
| Injuries | `public/data/nfl/matchup-injuries.json` | live single snapshot, no weekly archive | irregular | **Known gap**: currently a stale 2025-Week-12 snapshot per the DFS artifact's own staleness flag. No per-week injury archive exists. |
| Schedule | `public/data/nfl/<season>/games.json` | `scripts/generate-nfl-schedules-results.mjs` | weekly/as-needed | `gameId`, `season`, `week`, `seasonType`, `dateUtc`, `homeTeam`/`awayTeam`, `homeAbbr`/`awayAbbr`, `status`, `stadium`, `isDome`, `neutralSite`. No rest-days/short-week/bye/travel-distance field precomputed — internally derivable from `dateUtc` + team history, but no utility does it today. |
| Static preseason schedule notes | `src/lib/nfl/warrenSharpSchedule2026.ts` | hand-curated 2026 preview extract | static | `shortWeekRoadGames[Rank]`, per-week `bye`/`opponent`/`homeAway`. **Internal research input, not a substitute for computed situational fields** — no per-claim timestamp/URL provenance. |
| Weather | — | — | — | **Confirmed entirely absent for NFL.** Field references exist in docs/type contracts (`matchupComparison.ts`, `totalsModelContract.ts`) but no actual provider is wired. Category C gap (needs new provider), not merely unresearched. |
| VSiN / Warren Sharp team profiles | `src/lib/nfl/vsinGuide2026.ts`, `src/lib/nfl/warrenSharpTeams2026.ts` | hand-curated 2026 preview extracts | static | `NflVsinGuideTeam` (statistics.offense/defense with rank), `WarrenSharpTeamProfile2026` (7 positional categories, personnel/draft notes). **Static preseason publication extracts — internal model inputs, not something the AI pipelines should present as "external research they performed."** No per-claim provenance; do not route through the evidence schema as if independently sourced. |

### 1.4 Prediction archive & grading (existing, reusable)

| Asset | Path | Notes |
|---|---|---|
| Prediction snapshot schema | `scripts/lib/nfl-production-prediction-archive.ts` (`PredictionSnapshotV1`, schema `jkb-football-prediction-v1`) | Already covers `prediction_type: spread \| passing \| rushing \| receiving \| team_opportunity \| team_total`, `model_name`/`model_version`, `pipeline_version`, `run_id`, `workflow_run_id`, `cutoff_policy: slate_before_first_kickoff \| game_before_kickoff`, `status`, typed `ProjectionPayload` union, content-hashed `feature_snapshot` (`source_manifest_hashes`, `fitted_model_hash`, `feature_payload_hash`), and `market_snapshot_refs[]` with `designation: first_observed \| available_at_prediction \| final_pre_kickoff \| other`. This is the immutable-pregame-pick precedent — see §8. |
| Outcome resolver | `scripts/resolve-nfl-prediction-outcomes.ts` | Reads `data/nfl/predictions/<season>/...`, writes `data/nfl/prediction-outcomes/...`; CLI args `--season`/`--week`/`--prediction-types=`/`--dry-run`. |
| Cross-sport grading precedent | `scripts/persist-top-hr-picks.mjs` (MLB) | Idempotent, keyed by `date+playerId+gameId`, **never overwrites an already-graded record** — the immutability pattern to port. |
| Generic grading engine | none | Grading is bespoke per sport/market (`grade-mlb-hr-results.mjs`, `grade-mlb-ml-results.mjs`, `grade-polymarket-results.mjs`, `grade-sin-city-picks.mjs`, `grade-top-hr-picks.mjs`, `grade-top-k-picks.mjs`); no `grade-nfl-*` script exists today, but `resolve-nfl-prediction-outcomes.ts` fills that role for the archive above. |

### 1.5 Existing AI integration

| Item | Location | Notes |
|---|---|---|
| Grok adapter pattern | `scripts/generate-pga-best-bets.mjs`, `scripts/generate-mlb-hr-props.mjs`, `scripts/generate-mlb-numerology.mjs` | `callGrokWithRetry(prompt, maxRetries, validate, label, maxTokens)` → `https://api.x.ai/v1/chat/completions`, model `grok-4-1-fast-non-reasoning`, `GROK_API_KEY \|\| XAI_API_KEY`. Exponential backoff (`2^n * 1500ms`, 3 retries), JSON-mode parsing (`parseModelJson`), `validate` callback that throws on shape mismatch, `DRY_RUN`/`DRY_RUN_PROMPTS` fixture-replay for offline/CI-safe testing, `sanitizeResponseSnippet` for safe logging. Explicit **"Data Discipline Rules"** prompt block instructs Grok to use only frozen pre-supplied data and never invent stats/odds/injuries. **Directly reusable template for the Grok writing-pass adapter.** |
| ChatGPT/OpenAI | none | No `OPENAI_API_KEY`, no `api.openai.com` reference anywhere in `src/` or `scripts/`. 100% new integration; no local pattern to imitate — see §12. |
| `.env.example` | repo root | Declares `GROK_API_KEY` only (already provisioned). No `OPENAI_API_KEY` entry yet — add one following the same naming convention. |

### 1.6 Reusable UI

| Component | Path | Reuse for |
|---|---|---|
| NFL shell | `src/components/nfl/NflPlatformLayout.tsx` | App wrapper for the game-analysis page. |
| Sitemap sidebar | `src/components/nfl/NflSectionSidebar.tsx` | Sticky (`sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto`) desktop rail + Radix `Sheet` mobile slide-over pattern — imitate the sticky/mobile mechanics for the **game navigation rail** (§16), though this component itself is a page sitemap, not a per-game list. |
| Matchup header | `src/components/nfl/matchups/MatchupIdentityHeader.tsx` | Already matches the spec's header requirements almost exactly: `NflTeamCrest` logos, away/home identity + record/division, kickoff/venue/week meta, `MatchupMarketSummaryGrid`. Tailwind + a few custom classes (`nfl-h2h-rail`, `matchup-identity__*` in `nflMatchupSheet.css`), not CSS modules. |
| Team logo/colors | `nflLogoUrl` (`src/data/nflPreseason2026.ts`), `NflTeamCrest.tsx`, `teams.json.primaryColor`, `matchupTheme.ts` | Header/pick-card team branding. |
| Weekly dashboard | `src/components/nfl/weekly-dashboard/WeeklyCommandCenter.tsx` (663 lines) | **Direct template for the Weekly Summary page** (§16.6) — already has `WeeklyDashboardGame[]` with gameId/kickoff/teams/logos/market spread-total/JKB projection/model-vs-market/`matchupHref`. Needs Grok/ChatGPT pick columns added. |
| Tabs | `src/components/nfl/matchups/MatchupTabRow.tsx` / `MatchupTabStrip.tsx` (143 lines) | Fully built accessible tab system (`role="tablist"`, arrow-key nav) already used for "Statistical Comparison / Unit by Unit / What the Book Says." **Directly reusable for the Grok / ChatGPT / Compare tab UI.** |
| Mobile nav | `MatchupJumpNav.tsx`, `MatchupMobileStickyHeader.tsx` | Sticky-below-header anchor nav (mobile) / static toolbar (desktop), horizontal-scroll pattern — reuse for mobile game switching. |
| Grading/pick UI primitives | `src/components/nfl/performance/NflPerformanceKpiStrip.tsx`, `NflPerformanceBadges.tsx` (`NflResultBadge`: WIN/LOSS/PUSH/NEUTRAL; `NflHealthStatusBadge`: HEALTHY/DEGRADED/STALE/NOT_AVAILABLE/**NOT_IMPLEMENTED**) | The health-status enum is a near-exact match for the spec's per-model failure-isolation states (§13). `NflPerformanceSidesTab/Table`, `...TotalsTab/Table`, `...PropsTab/Table` show the side/total-separated grading-table pattern the weekly summary needs, doubled for Grok and ChatGPT. |
| Deterministic context builder | `scripts/lib/nfl-game-context.ts` | See §0 — the seed of the Game Context Packet. |
| Private/unlisted route precedent | `src/App.tsx` — `/internal/jkb-nfl-v03-review-7f3c9a` (`NflV03Review`), `/walter` (`WalterResearch`) | Established convention: unauthenticated but unlisted, obscure-slug route for private review pages. Use the same pattern for the dual-AI private review page (§18) rather than inventing auth. |

### 1.7 Caveats to carry forward

- `docs/nfl-data-inventory.md` is explicitly marked superseded for
  model/product behavior; only its identity/schema conventions
  (`teams.json`, `_meta` schema, fail-on-unknown-team) remain current.
- Market data (the-odds-api, sportsdataio for splits) is **paid**, which
  contradicts the "free-first" mandate as applied to schedules/power
  ratings — that mandate scopes to the nflverse-sourced pipeline only, not
  the separately built market pipeline. Cost tracking (§19) must treat the
  Odds API's ~90 credits/month against a 500/month free-plan quota as an
  existing constraint the AI system must not blow through by triggering
  extra refreshes.
- `docs/ARCHITECTURE.md` documents an unresolved deployment ambiguity
  (Vercel config vs. GitHub Pages workflow both present) — flagged in §23.

---

## 2. Reusable systems (summary)

Already covered with file paths in §1; summarized by category:

- **Prediction archive & immutability**: `nfl-production-prediction-archive.ts` + `resolve-nfl-prediction-outcomes.ts` (extend, don't replace).
- **Market history/snapshots**: `betting-lines-current.json` / `betting-lines-history/nfl/*.json` + (once merged) `bettingLinesView.ts`.
- **Team identity/logos/colors**: `teams.json`, `nflLogoUrl`, `NflTeamCrest`, `matchupTheme.ts`.
- **NFL layout/sidebar/tabs/mobile-nav**: `NflPlatformLayout`, `NflSectionSidebar`, `MatchupTabStrip`, `MatchupJumpNav`.
- **Matchup UI**: `MatchupIdentityHeader`, `MatchupMarketContext` (branch).
- **Performance UI**: `NflPerformanceKpiStrip`, `NflPerformanceBadges`, `NflPerformanceSidesTab/TotalsTab/PropsTab`.
- **Trend research**: `scripts/research/` NFL TD-score calibration work (research-only, not production-safe yet — see §3).
- **Injury/availability data**: DFS `week-<NN>.json` per-player availability fields + `sourceReferences` provenance pattern (though the underlying injury feed itself is stale).
- **Coaching**: `buildCoachingContext` / `rating-snapshots/<season>/<week>.json`.
- **DFS/fantasy/player context**: `nfl-dfs-lineup-context-v1` aggregator.
- **Grok adapter pattern**: `callGrokWithRetry` + Data Discipline Rules prompt block.
- **Private review route convention**: unlisted `/internal/<slug>` pattern.

---

## 3. Data gaps

### A. Internally derivable (compute, don't research)

- Rest differential, short week, bye, back-to-back road (from `games.json.dateUtc` + team schedule history — no utility exists yet, but all inputs are present).
- Travel distance (from `teams.json.latitude/longitude` + prior game's stadium — same, computable now).
- "Opening" line caveat: cannot derive a true market open; must present `firstObservedAt` honestly (see §1.1 caveat) rather than research it externally.

### B. Requires external research (the AI's job)

- Breaking injury news, practice participation trends, inactives.
- Coach/coordinator comments, beat-reporter reporting, scheme-change signals.
- Late-week roster/depth-chart changes not yet reflected in internal feeds.
- Weather (see gap C — until a provider exists, this is AI-researched, with `pregameSafe`/source discipline enforced by evidence validation).
- General "what changed" narrative context.

### C. Requires a new data provider

- **Weather**: no NFL weather source exists at all (confirmed absent). Until
  a provider is added, weather claims must go through the evidence pipeline
  as AI-researched external facts (category `weather`), not treated as a
  JKB deterministic field.
- **Real depth-chart/starter-order feed**: yardage-projections currently
  heuristically infers the starting QB; a real depth-chart source would
  remove the `starterUncertain` flag.
- **Fresh, weekly-archived injury data**: current injury artifact is a
  stale single snapshot with no weekly history — a real per-week injury
  archive (not just "AI researches it live") would materially improve
  reliability, but is out of scope for Phase 1.

### D. Not worth adding (noise, not signal)

- Sportsbook "sharp money" labeling without real bet-percentage data — the
  spec explicitly forbids this claim without evidence, and no such feed
  exists; don't chase it.
- Generic ATS trivia trends (e.g., "Team X is 7-1 in Week 3 games after 4pm")
  — the spec explicitly rejects this category; the situational-trends
  system should surface only trends with a defined rule, real sample, and
  matchup relevance (the TD-score calibration research shows the bar this
  repo already applies to trend validation — AUC/monotonicity checks, not
  raw trivia).
- Full historical betting-splits ingestion beyond what the Kalshi/odds
  pipeline already provides — building a second splits provider before the
  first end-to-end test is unnecessary scope.

---

## 4. Game Context Schema

Extends `PregameGameContext` (`scripts/lib/nfl-game-context.ts`) rather than
replacing it. New top-level sections draw from the artifacts inventoried in
§1. Every field carries or inherits a `provenance_status`; nothing here is
AI-written.

```typescript
// Builds on existing types: TeamAdvantage, EpaContext, YppContext,
// TrenchesContext, CoachingContext (scripts/lib/nfl-game-context.ts) — reused verbatim.

type ProvenanceStatus = "available" | "unavailable" | "stale";

interface GameContextIdentity {
  gameId: string;              // matches games.json gameId
  season: number;
  week: number;
  seasonType: "REG" | "WC" | "DIV" | "CON" | "SB";
  homeTeam: string;             // teams.json abbr
  awayTeam: string;
  homeTeamFull: string;
  awayTeamFull: string;
}

interface GameContextSchedule {
  kickoffUtc: string;
  venue: { stadium: string; isDome: boolean; neutralSite: boolean };
  restDays: { home: number | null; away: number | null };
  shortWeek: { home: boolean; away: boolean };
  offBye: { home: boolean; away: boolean };
  travel: { homeMilesFromPrevGame: number | null; awayMilesFromPrevGame: number | null };
  provenance_status: ProvenanceStatus; // "unavailable" if prior-game lookup fails, never guessed
}

interface GameContextMarket {
  sportsbook: string;               // from selectSportsbook() deterministic priority
  spread: { home: number | null; away: number | null; homePrice: number | null; awayPrice: number | null };
  total: { line: number | null; overPrice: number | null; underPrice: number | null };
  moneyline: { home: number | null; away: number | null };
  firstObserved: { spread: number | null; total: number | null; observedAt: string | null };
  lineMovement: { spread: number | null; total: number | null }; // current - firstObserved, no interpolation
  freshness: "fresh" | "recent" | "stale";                        // deriveFreshness()
  openingLineCaveat: true;           // always present — reminds writer this is "first tracked," not true open
  provenance_status: ProvenanceStatus;
}

interface GameContextJkbModels {
  powerRating: { home: number | null; away: number | null; modelVersion: "nfl-power-v0.3.1" | string };
  projectedSpread: { line: number | null; favoredTeam: string | null; modelVersion: "nfl-spread-v0.1.0" | string };
  projectedTotal: { line: number | null; modelVersion: string };
  modelMarketEdge: { spread: number | null; total: number | null }; // JKB fair - market, signed
  provenance_status: ProvenanceStatus;
}

interface GameContextTeamMetrics {
  epa: EpaContext;        // reused from nfl-game-context.ts
  ypp: YppContext;         // reused
  periodWindow: "2025" | "2026" | "last8"; // matches existing period selector
  sos: { home: number | null; away: number | null; basis: "epa-overall-rank" };
}

interface GameContextMatchup {
  trenches: TrenchesContext;         // reused
  offenseVsDefense: { passing: TeamAdvantage | null; rushing: TeamAdvantage | null };
}

interface GameContextCoaching extends CoachingContext {} // reused verbatim, already leak-safe

interface GameContextPlayers {
  yardageProjections: {
    playerId: string; name: string; team: string; position: string;
    statCategory: "passing" | "rushing" | "receiving";
    projectedYards: number | null; matchupScore: number | null; // 0-100, presentation only
    starterUncertain: boolean;
  }[];
  tdScores: { playerId: string; name: string; team: string; tdScore: number | null; window: "2025" | "2026" | "last8" }[];
  provenance_status: ProvenanceStatus;
}

interface GameContextAvailability {
  injuries: {
    playerId: string; name: string; team: string; position: string;
    status: "out" | "doubtful" | "questionable" | "probable" | "active" | null;
    asOf: string | null;
  }[];
  depthChart: { playerId: string; team: string; position: string; depthRank: number | null; evidence: string | null }[];
  feedStale: boolean;    // surfaced honestly; matches DFS artifact's injuryFeedStale flag
  provenance_status: ProvenanceStatus;
}

interface GameContextSituational {
  restDifferential: number | null;   // derived, see GameContextSchedule
  divisionalGame: boolean;
  revengeGame: boolean;              // computed from prior-season result only, never inferred narratively
}

interface GameContextTrends {
  id: string; rule: string; sampleSize: number; historicalResult: string;
  relevanceNote: string; productionSafe: boolean; // false unless validated per §3's trend-quality bar
}

interface GameContextWeather {
  status: "not_available";           // Category C gap — no provider yet; Phase 1 always this value
  note: "No internal NFL weather provider exists; weather must be AI-researched and evidence-tracked, not treated as deterministic.";
}

interface GameContextProvenance {
  sources: { logicalName: string; path: string; contentHash: string; generatedAt: string | null }[]; // reuse DFS artifact's sources[] pattern
  contextVersion: string;   // e.g. "nfl-game-context-v1"
  builtAt: string;
}

export interface NflGameContextPacket {
  identity: GameContextIdentity;
  schedule: GameContextSchedule;
  market: GameContextMarket;
  jkbModels: GameContextJkbModels;
  teamMetrics: GameContextTeamMetrics;
  matchup: GameContextMatchup;
  coaching: GameContextCoaching;
  players: GameContextPlayers;
  availability: GameContextAvailability;
  situational: GameContextSituational;
  trends: GameContextTrends[];
  weather: GameContextWeather;
  provenance: GameContextProvenance;
  generatedAt: string;
}
```

Storage: `data/nfl/game-context/<season>/<week>/<gameId>.json` (mirrors the
prediction archive's `data/nfl/predictions/<season>/...` convention — not
browser-served, matching the repo's "generated data private unless
explicitly published" posture from `AGENTS.md`).

---

## 5. Evidence schema (model-specific, external research)

New — nothing like this exists in the repo today (confirmed by fork audit:
no `sourceUrl`/`citation`/`evidenceId` pattern anywhere).

```typescript
export type EvidenceCategory =
  | "injury" | "personnel" | "scheme" | "news" | "weather" | "market" | "coaching";

export type EvidenceConfidence = "high" | "medium" | "low";

export interface EvidenceRecord {
  evidenceId: string;            // `${model}-${gameId}-${sequence}`, e.g. "grok-2026_01_BAL_IND-0007"
  model: "grok" | "chatgpt";     // which pipeline produced this — never shared
  gameId: string;
  claim: string;                 // atomic, single factual statement
  category: EvidenceCategory;
  sourceUrl: string | null;      // null only for evidenceRequiredAttribution=false social claims, flagged below
  sourceName: string;
  sourceTier: "official" | "beat_reporter" | "national_media" | "reputable_media" | "social_attributed";
  publishedAt: string | null;    // source's own timestamp, if available
  retrievedAt: string;           // when the AI pipeline fetched it
  teamsAffected: string[];       // teams.json abbrs
  playersAffected: string[];     // player ids where resolvable
  confidence: EvidenceConfidence;
  handicapRelevance: string;     // one sentence: why this matters to the pick
  verified: boolean;             // true only after fact-validation pass (§ Fact validation) confirms it's traceable
  pregameSafe: boolean;          // false if publishedAt is after game kickoff or ambiguous
  contextVersionAtRetrieval: string; // ties evidence to a specific Game Context Packet version
}
```

Storage: `data/nfl/analysis/<season>/<week>/<gameId>/<model>/evidence.json`
(array of `EvidenceRecord`). Source-tier preference order matches the
spec exactly: official → injury report → beat reporter → national reporter
→ reputable media → other (labeled). Social-media claims require
`sourceTier: "social_attributed"` and an explicit attribution string inside
`claim`; they can never silently become `sourceTier: "official"`.

Articles may only cite `evidenceId`s where `verified: true` and
`pregameSafe: true` — enforced structurally by the writer prompt contract
(§14) and checked mechanically by the fact validator (§ "Fact validation").

---

## 6. Analysis schema (structured reasoning, no hidden chain-of-thought)

```typescript
export interface KeyFactor { statement: string; supportingEvidenceIds: string[] }

export interface UnitAnalysis {
  advantages: KeyFactor[];
  concerns: KeyFactor[];
  keyFactors: KeyFactor[];
}

export interface SideOpinion {
  pick: "home" | "away" | "pass";
  marketLineAtAnalysis: number | null;
  confidence: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  reasoning: string; // concise, decision-relevant, not chain-of-thought
}

export interface TotalOpinion {
  pick: "over" | "under" | "pass";
  marketLineAtAnalysis: number | null;
  confidence: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  reasoning: string;
}

export interface NflAnalysisV1 {
  schemaVersion: "nfl-analysis-v1";
  model: "grok" | "chatgpt";
  gameId: string;
  contextVersion: string;      // Game Context Packet version consumed
  evidenceVersion: string;     // evidence.json version consumed
  centralThesis: string;
  awayOffense: UnitAnalysis;
  homeOffense: UnitAnalysis;
  injuryImpact: KeyFactor[];
  marketRead: { summary: string; supportingEvidenceIds: string[] };
  situationalFactors: KeyFactor[];
  relevantTrends: { trendId: string; applicability: string }[]; // trendId refs GameContextTrends[].id
  supportingEvidenceIds: string[]; // full union, for validator cross-check
  risks: KeyFactor[];              // "what could break the handicap" — mandatory, 2-3 entries
  sideOpinion: SideOpinion;
  totalOpinion: TotalOpinion;
  generatedAt: string;
}
```

Storage: `data/nfl/analysis/<season>/<week>/<gameId>/<model>/analysis.json`.
No field permits free-text chain-of-thought; `reasoning` fields are
constrained (length-capped in the editorial contract, §14) to
decision-relevant summaries.

---

## 7. Article schema

```typescript
export type ArticleSectionId =
  | "handicap" | "whenAwayHasBall" | "whenHomeHasBall" | "injuryPersonnelImpact"
  | "whatChanged" | "trenches" | "situationalSpot" | "marketRead"
  | "relevantTrends" | "whatCouldBreakHandicap" | "jkbRead" | "bottomLine";

export interface ArticleSection {
  id: ArticleSectionId;
  present: boolean;          // omitted sections set present:false with no body, per "omit if nothing meaningful"
  heading: string;
  bodyMarkdown: string;
  citedEvidenceIds: string[]; // must be subset of verified+pregameSafe evidence
}

export interface NflArticleV1 {
  schemaVersion: "nfl-article-v1";
  model: "grok" | "chatgpt";
  gameId: string;
  contextVersion: string;
  evidenceVersion: string;
  analysisVersion: string;    // ties to NflAnalysisV1.generatedAt/hash
  header: {
    awayTeam: string; homeTeam: string; kickoffUtc: string; venue: string | null;
    marketSpread: number | null; marketTotal: number | null; openingSpread: number | null; openingTotal: number | null;
    jkbSpread: number | null; jkbTotal: number | null;
    spreadModelMarketDiff: number | null; totalModelMarketDiff: number | null;
  };
  sections: ArticleSection[];
  picks: { side: SideOpinion; total: TotalOpinion }; // duplicated from analysis for article-level immutability
  wordCount: number;
  editorialQaScore: EditorialQaScore | null; // see §15, null until QA pass runs
  status: "draft" | "validated" | "editorial_passed" | "locked" | "failed";
  generatedAt: string;
  lockedAt: string | null;   // set once, never cleared, once kickoff passes
}
```

Storage: `data/nfl/analysis/<season>/<week>/<gameId>/<model>/article.json`.

---

## 8. Pick archive schema (immutable pregame picks)

Extends `PredictionSnapshotV1` (`scripts/lib/nfl-production-prediction-archive.ts`,
schema `jkb-football-prediction-v1`) rather than inventing a parallel
envelope, per §0. Two additions:

```typescript
// Added to PredictionSnapshotV1's discriminants — extend PredictionType:
export type ExtendedPredictionType = PredictionType | "ai_side" | "ai_total";

// New field on PredictionSnapshotV1:
model_source: "jkb" | "grok" | "chatgpt";   // "jkb" for existing rows (back-compat default), new for AI picks

// New ProjectionPayload variants:
| { type: "ai_side"; pick: "home" | "away" | "pass"; confidence: number; articleRef: string; evidenceVersion: string }
| { type: "ai_total"; pick: "over" | "under" | "pass"; confidence: number; articleRef: string; evidenceVersion: string }
```

This reuses, unchanged: `cutoff_policy` (`slate_before_first_kickoff` /
`game_before_kickoff`), `market_snapshot_refs[]` with `designation`
(critically: `first_observed` / `available_at_prediction` /
`final_pre_kickoff` — exactly the "grade against the exact archived
selection-time line" requirement), and the content-hash provenance chain
(`feature_snapshot.source_manifest_hashes`, `feature_payload_hash`).

Storage: `data/nfl/predictions/<season>/<week>/<gameId>/<model>.json` — one
file per model per game, matching the existing archive's per-prediction
granularity. **PASS is a valid `pick` value** and is not specially
penalized in storage.

Immutability enforcement: port the MLB `persist-top-hr-picks.mjs` pattern —
idempotent write keyed by `gameId+model+predictionType`, refuse to
overwrite a record that already has `status !== "projected"` (i.e., already
locked or graded). No mutation path exists once `lockedAt` is set.

---

## 9. Comparison schema

```typescript
export interface ComparisonAngle { summary: string; sourceModel: "grok" | "chatgpt"; supportingEvidenceIds: string[] }

export interface NflComparisonV1 {
  schemaVersion: "nfl-comparison-v1";
  gameId: string;
  grokStatus: "complete" | "failed" | "unavailable";
  chatgptStatus: "complete" | "failed" | "unavailable";
  consensus: { topic: string; grokStatement: string; chatgptStatement: string }[];
  disagreements: { topic: string; grokStatement: string; chatgptStatement: string; possibleExplanation: string }[];
  uniqueGrokAngles: ComparisonAngle[];
  uniqueChatgptAngles: ComparisonAngle[];
  sideComparison: { grok: SideOpinion; chatgpt: SideOpinion; agree: boolean };
  totalComparison: { grok: TotalOpinion; chatgpt: TotalOpinion; agree: boolean };
  confidenceComparison: { grokConfidence: number; chatgptConfidence: number; delta: number };
  generatedAt: string;
}
```

Storage: `data/nfl/comparison/<season>/<week>/<gameId>.json`. **Only ever
generated when `grokStatus === "complete" && chatgptStatus === "complete"`**
— see §13 failure isolation. If either is `failed`/`unavailable`, no
comparison file is written and the UI shows single-model content, never a
fabricated comparison.

---

## 10. Grading design

- **Result source**: existing NFL results pipeline (`games.json` /
  `results.json` from `scripts/generate-nfl-schedules-results.mjs`) — same
  source JKB's own spread predictions already grade against, so no new
  final-score ingestion is needed.
- **Line source**: the `market_snapshot_refs[]` entry on the archived
  `PredictionSnapshotV1` row with `designation: "final_pre_kickoff"` if
  present at pick time, otherwise whatever `designation` was captured at
  `prediction_timestamp` — **never** the current or closing line. This is
  enforced by grading only reading from the already-locked archive record,
  never re-querying `betting-lines-current.json`.
- **Side grading**: standard ATS win/loss/push against the archived line;
  `pass` picks are excluded from win/loss record but retained in the
  archive for transparency (analogous to how `resolve-nfl-prediction-outcomes.ts`
  handles `status: "not_eligible"`).
- **Total grading**: standard over/under win/loss/push against the archived
  total line, same pass handling.
- **Push handling**: `result: "push"`, contributes 0 units, does not count
  toward win% denominator.
- **Units**: default 1-unit-to-win convention (repo has no existing generic
  staking convention to inherit from beyond simple win/loss counts in MLB
  trackers) — confirm with user before implementing if a different
  convention is preferred.
- **Grader output**: extend `resolve-nfl-prediction-outcomes.ts`'s output
  shape (`data/nfl/prediction-outcomes/...`) with `model_source`,
  `final_score`, `selected_line`, `result`, `units`, `graded_at`,
  `grader_version` — same idempotent, keyed-write, never-overwrite pattern
  as the MLB precedent.

---

## 11. Grok pipeline design

Passes (mirrors the "research pass vs writing pass" separation the spec
requires):

1. **Research pass** — Grok, given only `identity`+`schedule` (no JKB
   numbers yet, to avoid anchoring bias — see §13), researches injuries,
   personnel, scheme, news, weather via its own tools/search. Output:
   raw findings → normalized into `EvidenceRecord[]` (§5). Reuses
   `callGrokWithRetry` pattern with a new `validate` callback checking each
   record has `sourceUrl`/`sourceName`/`category`.
2. **Analysis pass** — Grok receives the full `NflGameContextPacket` (§4)
   plus its own `evidence.json`, produces `NflAnalysisV1` (§6). Data
   Discipline Rules block (already proven in the PGA script) extended to
   explicitly forbid altering `jkbModels` numbers.
3. **Writing pass** — Grok drafts `NflArticleV1` (§7) from its own
   analysis + evidence only.
4. **Fact validation** — mechanical (not AI) pass (§ Fact validation)
   checks every JKB numeric claim against the context packet and every
   evidence citation against `evidence.json`.
5. **Editorial pass** — separate Grok call (or a smaller/cheaper model),
   constrained to trim/clarify only — cannot alter picks, numbers, or
   introduce new claims (§ Editorial pass).

**Research responsibilities**: injuries/practice reports, personnel/scheme
news, coach comments, weather, market context interpretation (not
re-deriving lines).

**Validation**: structural JSON-shape validation via the existing
`validate` callback pattern at every pass boundary; fact validation and
editorial QA are shared modules, not per-model duplicated logic (see §15).

**Failure handling**: any pass failure sets `grokStatus: "failed"` on
that game's pipeline-run row; downstream passes for Grok do not run; the
ChatGPT pipeline is entirely unaffected (separate process/queue); no
partial article is ever marked `locked`.

**Model/version recording**: `model_name: "grok-4-1-fast-non-reasoning"` (or
newer, matching whatever the PGA/MLB scripts use at implementation time)
recorded on every artifact via `contextVersion`/`evidenceVersion` fields
already in the schemas above.

---

## 12. ChatGPT pipeline design

Same five-pass structure as §11, run as a fully separate process with no
shared state. Genuinely new integration work required (§1.5 confirms zero
existing OpenAI code in this repo):

- **API/model class**: to be selected at implementation time — needs a
  model class with reliable structured-output support (JSON mode /
  function calling) and, ideally, native web-search/browsing tool access
  for the research pass to be truly independent (OpenAI's tool-use
  capabilities differ from Grok's — do not assume parity, per the spec's
  explicit instruction).
- **Env var**: `OPENAI_API_KEY`, added to `.env.example` following the
  `GROK_API_KEY` convention, plus a matching GitHub Actions secret.
- **Adapter shape**: mirror `callGrokWithRetry`'s signature
  (`callChatGptWithRetry(prompt, maxRetries, validate, label, maxTokens)`)
  so the two adapters are structurally interchangeable from the
  orchestrator's point of view — this is what makes failure isolation and
  independence enforcement (§13) tractable without duplicating
  orchestration logic per model.
- **Research responsibilities**: identical categories to Grok (§11.1), but
  the actual search mechanism/tool surface must be verified against
  whatever OpenAI API tier is provisioned before implementation — do not
  assume ChatGPT has the same live-search reliability as Grok's endpoint.
- **Retries/timeouts/cost controls**: same backoff shape as the Grok
  adapter for consistency; per-call token/cost ceilings set independently
  since OpenAI and xAI pricing differ.

---

## 13. Independence guarantees (technical enforcement)

Independence must be structural, not prompt-only:

1. **Separate process invocation.** The orchestrator (a new script, e.g.
   `scripts/nfl/run-dual-handicap.ts`, not built in Phase 1) calls the Grok
   pipeline and ChatGPT pipeline as two independent async calls with no
   shared mutable state or shared prompt object. Each receives its own copy
   of `NflGameContextPacket`, serialized fresh per call — no object
   reference sharing that could leak a mutation.
2. **No sequential dependency in code.** The orchestrator must not await
   Grok's article before starting ChatGPT's research pass, and vice versa —
   `Promise.allSettled([runGrok(gameId), runChatgpt(gameId)])`-style
   concurrency, not sequential `await`.
3. **Filesystem/storage isolation.** Each model's evidence, analysis, and
   article live under `.../.../<gameId>/<model>/...` — physically separate
   directories. The comparison generator is the *only* code path permitted
   to read both `grok/` and `chatgpt/` directories for one `gameId`, and it
   is gated (§9) to only run after both are `status: "locked"`.
4. **No cross-model context injection.** Neither adapter prompt ever
   includes the other model's name, output, or even a reference to "the
   other AI" — verified at review time by grepping each pipeline's prompt
   templates for forbidden tokens (a cheap automated guard: fail the build
   if a Grok prompt template string contains "ChatGPT"/"OpenAI" or a
   ChatGPT prompt template contains "Grok"/"xAI").
5. **Timing does not create leakage.** Running one pipeline to completion
   before starting the other (e.g., for cost/rate-limit reasons) is
   permitted *operationally* (the spec forbids using outputs, not
   sequencing), but the implementation should still launch both
   concurrently by default to avoid any temptation to special-case one
   model's prompt based on runtime observation of the other's result.
6. **Comparison is append-only and one-directional.** The comparison
   engine reads from locked, immutable per-model artifacts; it never writes
   back into `grok/` or `chatgpt/` directories.

---

## 14. Editorial style contract

Enforceable, checkable rules distilled from the spec (used both as the
writer's system prompt and as the editorial QA rubric's literal checklist,
§15):

- Every paragraph must do at least one of: explain a matchup, cite
  evidence, interpret the market, explain injury/personnel significance,
  describe a situational edge, explain a model-market disagreement, state
  uncertainty, or state/refine the handicap. A paragraph doing none of
  these fails QA.
- Banned opening/transition phrases (exact list from the spec): "It's
  important to note...", "When it comes to...", "That being said...", "At
  the end of the day...", "This matchup presents an intriguing...", "There
  are several factors to consider...", "It will be interesting to see...",
  "One key factor to consider...", "Ultimately..." — mechanically
  grep-able by the QA layer.
- No invented "sharp money"/"smart money"/"professional action" language
  unless the sentence cites an `evidenceId` whose `category` is `"market"`
  and whose claim explicitly supports that characterization.
- Sections with nothing meaningful to say are omitted (`present: false`),
  never padded.
- Conclusion (`bottomLine`) introduces zero new facts and zero new
  `citedEvidenceIds` beyond what earlier sections already cited.
- `whatCouldBreakHandicap` is mandatory, 2–3 entries, and must reference
  the model's own `risks` from `NflAnalysisV1` — cannot be fabricated at
  write time.
- Density over length: no fixed minimum word count; a QA-passing 700-word
  article beats a padded 1,600-word one.

---

## 15. Editorial QA system

**Automated checks** (mechanical, pre-model-score):
- Banned-phrase grep (§14).
- Section-purpose check: every paragraph maps to at least one purpose
  category (can be a lightweight heuristic classifier, not full NLP).
- Citation check: every `citedEvidenceIds` entry exists in that model's
  `evidence.json` and has `verified: true`, `pregameSafe: true`.
- JKB-number check: every numeric claim matching a known context-packet
  field (spread/total/EPA/etc.) matches the `NflGameContextPacket` value
  exactly (this is the same check as fact validation, §"Fact validation",
  reused here so QA and validation don't drift).
- Repetition check: sentence-embedding or n-gram similarity across
  sections flags duplicated arguments.
- Length/sentence-complexity heuristics (avg sentence length, adjective
  density) as soft signals, not hard fails.

**Scoring rubric** (0–10 each, from the spec): Factual grounding, Football
insight, Betting relevance, Conciseness, Organization, Natural human prose,
Evidence quality, Counterargument quality, Market analysis, Actionability.
Football-insight/prose-quality scores are LLM-judged (a third, cheap
model call — reuse whichever adapter is cheaper); factual/citation/
banned-phrase scores are 100% mechanical.

**Failure threshold**: proposed default — publish threshold requires (a)
zero mechanical-check failures (citation/JKB-number/banned-phrase are hard
gates, not scored) and (b) rubric average ≥ 7.0/10 with no single category
below 5. Confirm exact threshold with user before automating gating.

**Rewrite behavior**: on failure, route back to the editorial pass (§ pass
4/5 in §11) with the specific failed checks attached as constraints — never
silently auto-publish a failing draft. After N rewrite attempts (proposed
2), mark `status: "failed"` and surface for manual review rather than
looping indefinitely.

---

## 16. UI/UX architecture

Reuse-first, per §1.6/§2.

### 16.1 Desktop layout

```
┌─────────────┬───────────────────────────────────────────┐
│  STICKY GAME │  GAME HEADER (MatchupIdentityHeader-based)│
│  NAV RAIL    │  logos, records, kickoff, spread/total,   │
│  (new —      │  JKB fair line, Grok pick, ChatGPT pick   │
│  modeled on  ├───────────────────────────────────────────┤
│  NflSection  │  CONSENSUS / DISAGREEMENT SNAPSHOT (new)  │
│  Sidebar's   ├───────────────────────────────────────────┤
│  sticky+     │  [ Grok ] [ ChatGPT ] [ Compare ]          │
│  active-     │  (MatchupTabStrip — reused as-is)          │
│  tracking    ├───────────────────────────────────────────┤
│  mechanics,  │  Tab content: article sections OR          │
│  logos per   │  comparison view                           │
│  row like    ├───────────────────────────────────────────┤
│  the spec's  │  PICK SUMMARY CARD (new, composed from     │
│  WEEK 2      │  NflResultBadge + NflPerformanceKpiStrip   │
│  mockup)     │  primitives)                                │
└─────────────┴───────────────────────────────────────────┘
```

- Game nav rail: new component, but directly modeled on
  `NflSectionSidebar`'s sticky/scroll mechanics — swap its sitemap content
  for a per-week game list (`WeeklyDashboardGame[]`-shaped data, already
  available from `WeeklyCommandCenter.tsx`'s consumption pattern).
- Tabs: `MatchupTabStrip` reused unmodified, three tabs instead of three
  stat categories.
- Header: `MatchupIdentityHeader` extended with two new rows (Grok
  pick / ChatGPT pick) using the same `matchup-identity__*` CSS class
  conventions, not a new styling system.

### 16.2 Mobile layout

- Replace the sticky sidebar with `MatchupJumpNav`'s pattern (sticky-below-
  header, horizontal-scroll, no wrap) repurposed as a horizontal game
  switcher rather than an in-page anchor nav.
- Tabs collapse to the same `MatchupTabStrip` (already responsive per the
  UI fork's findings).
- Pick summary card stacks above the tabs, not beside them.

### 16.3 Pick summary card

New component, composed entirely from existing primitives:
`NflTeamCrest` (logos) + `NflResultBadge`-style pill (repurposed pre-grading
as a pick pill, not just post-grading result) + `NflPerformanceKpiStrip`
(confidence, pass/no-pass). No new visual language needed.

### 16.4 Failure-isolation UI

`NflHealthStatusBadge`'s existing enum (`HEALTHY / DEGRADED / STALE /
NOT_AVAILABLE / NOT_IMPLEMENTED`) maps directly onto per-model pipeline
states — reuse the component, map `grokStatus`/`chatgptStatus` (§9) onto
its existing visual states rather than designing new ones.

### 16.5 Sticky desktop game navigation

Modeled on `NflSectionSidebar` (§1.6) — sticky, scrollable, active-item
tracking. Row content changes from sitemap links to `[away logo] @ [home
logo]` per the spec's mockup, using `NflTeamCrest`.

### 16.6 Weekly summary

`WeeklyCommandCenter.tsx` is the direct template — add columns for Grok
side/total, ChatGPT side/total, confidence, agreement/disagreement
indicator, and post-grading result (using the existing
`NflPerformanceSidesTab/TotalsTab` table patterns, doubled per model).

### 16.7 Grading presentation

Reuse `NflPerformanceKpiStrip` + `NflResultBadge` + the existing
Sides/Totals/Props tab split pattern, applied per-model (Grok tab, ChatGPT
tab) rather than inventing a new grading UI.

---

## 17. Weekly snapshot design (lifecycle only — no scheduling implemented)

| Phase | Trigger (future) | Refresh scope |
|---|---|---|
| Early week | Manual / future Tue-Wed cadence, matching `nfl-team-ratings.yml`'s Tuesday pattern | Baseline `NflGameContextPacket`, initial JKB vs. market read, preliminary situational context |
| Friday | Manual / future Fri cadence | Injury reports, practice participation, depth-chart changes, current news, market movement re-check, updated JKB inputs if the underlying models refreshed |
| Game day | Manual / future same-day cadence | Inactives, weather (once a provider exists, or last AI-researched read), late market movement, breaking news, finalized/locked picks |

Each phase produces a **new** `contextVersion` (never mutates the prior
one — "what changed since the previous analysis?" is answerable by diffing
two versioned `NflGameContextPacket` files, same content-hash-provenance
idea already used in `feature_snapshot.source_manifest_hashes`). No
GitHub Actions cron is added in this phase; this table exists purely to
inform the schema's versioning fields (`contextVersion`, `evidenceVersion`,
`snapshot_key`/`snapshot_label` already present on `PredictionSnapshotV1`).

---

## 18. Private review design

- **Route**: unlisted `/internal/nfl-dual-handicap-<random-slug>` — same
  convention as the existing `NflV03Review` (`/internal/jkb-nfl-v03-review-7f3c9a`)
  and `WalterResearch` (`/walter`) routes: no auth, not linked from nav,
  slug obscurity is the access control. Consistent with this repo's
  existing pattern, not a new one.
- **Data**: all Phase 1 artifacts (context, evidence, analysis, article,
  comparison) live under `data/nfl/...` (not `public/data/nfl/...`), so
  they are never browser-served or committed to a publicly fetchable path
  by default — the private review page would need its own
  server-side/build-time data-loading path (exact mechanism TBD at
  implementation time depending on the resolved deployment target, §23).
- **No auto-publish**: nothing in this design writes to any existing public
  NFL page or public JSON artifact. The private page is additive and
  isolated.
- **Manual gate to "public"**: explicitly out of scope for Phase 1;
  requires a separate future decision plus likely a `docs/DECISIONS.md`
  entry once accuracy/editorial quality are validated on real games.

---

## 19. Cost model

Per game, five LLM passes total across both models (2 research + 2
analysis + 2 writing + 2 editorial, symmetric per model — 8 calls/game
minimum, plus 1 shared QA-judge call if that's LLM-based):

- **Research pass**: likely the most token-heavy (tool/search results can
  be large) — cache nothing across models (independence forbids it), but
  *within* one model's own pipeline, cache the context packet fetch itself
  (it's static JKB data, safe to reuse across the model's own passes).
- **Analysis + writing passes**: bounded by context-packet + evidence size,
  moderate token cost.
- **Editorial pass**: can use a cheaper/faster model variant than the
  research/writing passes if the provider offers one (Grok already has
  `grok-4-1-fast-non-reasoning` in use elsewhere in the repo for exactly
  this kind of cost-conscious choice).
- **Caching opportunities**: `NflGameContextPacket` is generated once per
  snapshot phase (§17) and reused by both models' analysis passes — it is
  JKB data, not AI output, so sharing it violates nothing.
- **Avoidable duplication to avoid**: don't re-run the research pass on
  every snapshot refresh if no meaningfully new information exists since
  the last version — a lightweight diff-based skip (compare new context
  packet's content hash to the last one the model's evidence was built
  against) is a natural extension of the `feature_payload_hash` pattern
  already in the prediction archive.
- **Existing cost constraint to respect**: the Odds API quota (~90
  credits/month against a 500/month cap, §1.7) — the AI pipelines must
  read from the existing `betting-lines-current.json`/`-history` artifacts,
  never trigger their own odds refresh.
- Dollar estimates intentionally omitted — current Grok/OpenAI pricing
  should be confirmed via the model's own current pricing docs at
  implementation time rather than guessed here.

---

## 20. Security / reliability risks

| Risk | Mitigation |
|---|---|
| API keys exposed client-side | All AI calls happen in Node scripts/GitHub Actions (matching every existing NFL workflow's pattern) — never in browser code. `OPENAI_API_KEY` added to `.env.example` (placeholder only) and GitHub Actions secrets, following the existing `GROK_API_KEY` convention. |
| Secrets in public artifacts | Store analysis/evidence/article/prediction JSON under `data/nfl/...`, not `public/data/nfl/...`, until explicitly promoted — matches `AGENTS.md`'s "generated data" and "private review" conventions already in force. |
| API timeout / partial failure | Per-model try/catch at each pass boundary; a failed pass marks that model `failed` for the game and halts only that model's downstream passes (§13 failure isolation). |
| Malformed structured output | Reuse `callGrokWithRetry`'s `validate` callback pattern (shape-check before accept) for both adapters; invalid JSON triggers the existing retry/backoff, not a silent partial-accept. |
| Stale line/current-line contamination in grading | Grading reads only from the archived `market_snapshot_refs[]` on the locked prediction row, never live data (§10). |
| Duplicate/contradictory evidence within one model's own research | Evidence normalization assigns sequential `evidenceId`s and the fact validator can flag near-duplicate claims; not a hard block in Phase 1, flagged for editorial review. |
| Postgame info leaking into pregame artifacts | `cutoff_policy` + `pregameSafe` flags (reused from the existing prediction-archive contract) enforced at evidence-ingestion and article-lock time. |
| One model's failure blocking the other | Structural isolation, §13 — `Promise.allSettled`, separate storage directories, comparison gated on both being `complete`. |
| Deployment-target ambiguity affecting where AI orchestration runs | Flagged as a go/no-go item, §23 — resolve before choosing GitHub Actions vs. a Vercel serverless function as the execution environment. |
| Idempotency / accidental re-grading or re-picking | Port the MLB `persist-top-hr-picks.mjs` "never overwrite an already-graded/locked record" pattern verbatim (§8, §10). |

---

## 21. Implementation plan (work units)

Each WU lists files likely touched, tests, dependencies, validation
criteria, and what must NOT change. Sequencing follows the pipeline order
(context → adapters → validation → analysis → writing → comparison → UI →
archive → grading → summary → snapshots), deferring production automation
to last, matching the user's explicit "no scheduled workflows yet"
constraint.

**WU1 — Game Context Packet builder (extends existing code)**
- Files: new `scripts/lib/nfl-full-game-context.ts` (wraps/extends
  `buildPregameGameContext`), reads from `betting-lines-current.json`,
  `games.json`, `yardage-projections.json`, `touchdown-preview.json`,
  `matchup-injuries.json`, DFS `week-<NN>.json` for provenance pattern.
- Tests: unit tests per section builder (mirrors existing
  `buildEpaContext`/`buildYppContext`/`buildTrenchesContext` test style),
  provenance-status correctness (available/unavailable/stale), leakage
  guards preserved.
- Dependencies: none beyond existing artifacts.
- Validation: output matches §4 schema; every `provenance_status` field is
  honestly derived, never defaulted to `"available"`.
- Must NOT change: `scripts/lib/nfl-game-context.ts` itself (extend via
  composition, don't rewrite its leakage-safe logic), any existing model
  formula, any existing public artifact.

**WU2 — One-game private fixture / artifact flow (no AI calls yet)**
- Files: fixture script building a `NflGameContextPacket` for one real
  current game, written to `data/nfl/game-context/...`.
- Tests: schema validation against §4 types.
- Dependencies: WU1.
- Validation: manually inspect one real game's packet for correctness.
- Must NOT change: no UI, no AI adapters yet.

**WU3 — Grok adapter interface**
- Files: `scripts/nfl/grok-nfl-adapter.ts` (or `.mjs`, matching repo
  convention), modeled on `callGrokWithRetry` from
  `scripts/generate-pga-best-bets.mjs`.
- Tests: `DRY_RUN`/fixture-replay tests (reuse the existing `DRY_RUN_PROMPTS`
  pattern) so CI never makes a real network call.
- Dependencies: WU1/WU2 (context packet as input shape).
- Validation: adapter produces schema-valid `EvidenceRecord[]` /
  `NflAnalysisV1` / `NflArticleV1` against fixtures.
- Must NOT change: any other sport's Grok scripts.

**WU4 — ChatGPT adapter interface**
- Files: `scripts/nfl/chatgpt-nfl-adapter.ts`, new — no existing pattern to
  extend (§12).
- Tests: same `DRY_RUN` discipline as WU3.
- Dependencies: WU1/WU2; requires `OPENAI_API_KEY` provisioning decision.
- Validation: same schema-conformance bar as WU3.
- Must NOT change: nothing else in the repo touches this key yet.

**WU5 — Evidence schema + validation**
- Files: `scripts/lib/nfl-evidence-schema.ts` (types from §5),
  `scripts/lib/nfl-fact-validator.ts` (mechanical checks from §15).
- Tests: validator unit tests against known-good/known-bad evidence fixtures.
- Dependencies: WU1 (context packet is the ground truth to validate against).
- Validation: validator correctly rejects a fabricated JKB number and an
  uncited claim.
- Must NOT change: nothing production-facing yet.

**WU6 — Independent analysis pipeline**
- Files: orchestration wiring (`scripts/nfl/run-dual-handicap.ts`) calling
  WU3/WU4 adapters via `Promise.allSettled`, writing to per-model
  directories (§4/§11/§12/§13).
- Tests: independence-guard test (grep-for-forbidden-tokens check from §13
  item 4), failure-isolation test (one adapter throws, the other still
  completes).
- Dependencies: WU3, WU4, WU5.
- Validation: two independent, non-cross-contaminated outputs for one
  fixture game.
- Must NOT change: no comparison logic yet (that's WU8).

**WU7 — Article writer/editor pipeline**
- Files: writer-pass and editor-pass prompt templates + orchestration step
  per model; editorial QA scorer (`scripts/lib/nfl-editorial-qa.ts`, §15).
- Tests: banned-phrase detector unit tests, QA-threshold gating tests.
- Dependencies: WU6.
- Validation: a fixture draft with an injected banned phrase fails QA; a
  clean draft passes.
- Must NOT change: analysis schema fields (editor cannot alter picks/numbers,
  enforced by only allowing the editor pass to touch `bodyMarkdown`).

**WU8 — Comparison engine**
- Files: `scripts/lib/nfl-comparison.ts` (§9).
- Tests: gating test (no comparison written unless both models `locked`).
- Dependencies: WU6, WU7.
- Validation: consensus/disagreement/unique-angle extraction correct on a
  fixture pair.
- Must NOT change: per-model article/analysis files (comparison is
  read-only against them).

**WU9 — Private UI**
- Files: new page component (`src/pages/nfl/internal/...`), route in
  `src/App.tsx` at an unlisted slug (§18), components per §16 (game nav
  rail, tab strip reuse, pick summary card, header extension).
- Tests: component render tests; Playwright smoke test of the tab
  switching (per `docs/TESTING.md`'s analytics-blocking fixture
  requirement).
- Dependencies: WU8 (needs real artifacts to render, even if just the
  fixture game).
- Validation: manual browser check of one fixture game end-to-end.
- Must NOT change: any existing public NFL route/page.

**WU10 — Pick archive**
- Files: extend `scripts/lib/nfl-production-prediction-archive.ts` per §8
  (new `model_source` field, new `ai_side`/`ai_total` projection variants).
- Tests: schema-extension backward-compatibility test (existing JKB rows
  still validate with `model_source` defaulting appropriately).
- Dependencies: WU6 (needs `SideOpinion`/`TotalOpinion` to archive).
- Validation: archive write is idempotent and refuses to overwrite a locked
  row.
- Must NOT change: existing JKB prediction rows' schema/meaning.

**WU11 — Grading**
- Files: extend `scripts/resolve-nfl-prediction-outcomes.ts` per §10.
- Tests: push/pass handling unit tests; "grades against archived line, not
  current line" regression test.
- Dependencies: WU10.
- Validation: a fixture graded game produces the correct result against
  its archived line, not a live one.
- Must NOT change: existing JKB grading behavior for non-AI predictions.

**WU12 — Weekly summary / performance**
- Files: extend `WeeklyCommandCenter.tsx` consumption + new aggregation
  script for W-L-P/units per model (§10, §16.6).
- Tests: aggregation correctness against fixture graded picks.
- Dependencies: WU11.
- Validation: manual review of one fixture week's summary.
- Must NOT change: existing weekly dashboard behavior for JKB-only content.

**WU13 — Snapshot refresh (design only, no scheduling)**
- Files: none in Phase 1 beyond the versioning fields already in the
  schemas (§17) — this WU is documentation/schema-readiness only.
- Validation: confirm `contextVersion`/`evidenceVersion`/`snapshot_key`
  fields are sufficient to answer "what changed" without new fields.

**WU14 — Production automation (explicitly deferred)**
- Not scheduled in Phase 1. Requires: resolved deployment-target decision
  (§23), explicit user authorization to add a new GitHub Actions workflow,
  and validated accuracy/editorial-quality results from the manual
  end-to-end test (§22) first.

---

## 22. Recommended first test game

**Candidate: an active, data-rich Week 1 (2026 season) divisional or
marquee matchup already flowing through the existing pipelines** — pick
whichever current-week game has the fullest artifact coverage at
implementation time (verify via the DFS `week-<NN>.json`'s own `sources[]`
completeness, since it already aggregates most of what's needed and
self-reports which upstream sources are fresh vs. stale). Do not hardcode
a specific matchup in this document since "current" shifts weekly; the
selection rule is:

- `public/data/nfl/<season>/games.json` has the game with `status` not yet
  final.
- `public/data/market/betting-lines-current.json` has a live line for it.
- `matchup-epa.json`/`matchup-metrics.json`/`matchup-trench-metrics.json`
  all resolve both teams (no `provenance_status: "unavailable"`).
- `rating-snapshots/<season>/<week>.json` has both coaches rated
  (`coaching_context_status: "OK"`).
- `yardage-projections.json` and `touchdown-preview.json` both cover
  several skill-position players on both teams.
- Ideally at least one team has an active, non-stale injury designation to
  exercise the injury-impact section meaningfully (acknowledging the known
  injury-feed staleness gap, §1.3 — this may force choosing a game where
  the AI's own research fills the gap, which is itself a useful test of
  the external-research pathway).

For that game, exactly which artifacts populate the context packet:
`games.json` (schedule/venue), `betting-lines-current.json` +
`betting-lines-history/nfl/<gameId>.json` (market), `power-ratings.json`
+ matchup-spread projection (JKB models), `matchup-epa.json` +
`matchup-metrics.json` (team metrics), `matchup-trench-metrics.json`
(trenches), `rating-snapshots/<season>/<week>.json` (coaching),
`yardage-projections.json` + `touchdown-preview.json` (players),
`matchup-injuries.json` + DFS `week-<NN>.json` (availability, with known
staleness caveat), `nfl-yardage-alt-market.json` (Kalshi, if sportsbook
props unfilled). **Gap for this game**: weather (Category C, always
`not_available` until a provider exists) and true opening line (structural
caveat, §1.1).

Manual test sequence (matches §21's WU1→WU9 order): build context → lock
`contextVersion` → run Grok independently (WU3/WU6) → run ChatGPT
independently (WU4/WU6) → validate evidence (WU5) → validate JKB numbers
(WU5) → run editorial QA (WU7) → store both outputs (WU6/WU7 storage) →
compare only after both locked (WU8) → inspect the rendered private page
manually (WU9).

---

## 23. Go / No-Go risks

1. **Deployment-target ambiguity.** `docs/ARCHITECTURE.md` documents both a
   Vercel configuration and a GitHub Pages deployment workflow with no
   resolved authority (per `AGENTS.md`: "do not assume the authoritative
   production path"). AI orchestration needs a real server-side execution
   environment with secret access — GitHub Actions is the safe default
   (every existing NFL data workflow already runs there), but this must be
   explicitly confirmed before WU14, since a static-site-only deployment
   target would make in-app AI calls impossible and push everything to
   pre-generated JSON (which is actually the natural fit here anyway —
   this repo is JSON-artifact-first everywhere).
2. **Cost/reliability of true independence at scale.** Running two full
   five-pass LLM pipelines per game, for ~16 games/week, is a real
   token/dollar cost multiplied by two providers with different pricing
   and reliability characteristics — validate actual per-game cost on the
   single test game (§22) before committing to a full-week rollout.
3. **ChatGPT's research-tooling parity is unverified.** Grok's live-search
   capability is proven in this repo (PGA/MLB scripts already work); an
   equivalent OpenAI capability/tier has not been confirmed — if ChatGPT's
   accessible API tier lacks reliable live web research, the "independent
   research" requirement for that model may need a different tool-use
   design (e.g., a separate search API called by the orchestrator and fed
   in as raw material, still gated by the independence rules) rather than
   relying on native model browsing.
4. **Injury-feed staleness is a real accuracy risk.** The only internal
   injury source is confirmed stale (§1.3); until either a fresher internal
   feed exists or the AI's own research reliably fills the gap with
   verified, pregame-safe evidence, injury-impact sections risk being
   thin or wrong. The first test game should be chosen partly to stress
   this path (§22).
5. **Weather absence.** Not a blocker (weather is one factor among many and
   the spec allows omitting sections with nothing meaningful to say), but
   articles for outdoor/cold-weather late-season games will be weaker
   without it — track as a known limitation, not a go/no-go blocker for
   Phase 1's single-game test.
6. **Grading-line integrity depends on disciplined archive writes.** If the
   pick-archive extension (WU10) is implemented loosely (e.g., allowing a
   re-write of `market_snapshot_refs` after lock), the entire "grade
   against the exact selection-time line" guarantee breaks silently. This
   is a design discipline risk, not a data risk — mitigated by strictly
   reusing the existing immutable-write pattern (§8, §10) rather than a
   fresh implementation.
7. **Public-publishing pressure before validation.** The spec is explicit
   that Phase 1 must stay private-first; the main organizational risk is
   skipping straight to public picks before the manual one-game test (§22)
   validates both accuracy and editorial quality. This document's WU
   sequencing (§21) and the explicit WU14 deferral are the guardrail.

---

## Appendix: schema/file quick reference

| Concept | New or existing | Path |
|---|---|---|
| Game Context Packet | Extends existing | `scripts/lib/nfl-full-game-context.ts` (new) wrapping `scripts/lib/nfl-game-context.ts` (existing) |
| Evidence | New | `scripts/lib/nfl-evidence-schema.ts` (new) |
| Analysis | New | schema in this doc §6 |
| Article | New | schema in this doc §7 |
| Pick archive | Extends existing | `scripts/lib/nfl-production-prediction-archive.ts` (existing, `jkb-football-prediction-v1`) |
| Comparison | New | `scripts/lib/nfl-comparison.ts` (new) |
| Grading | Extends existing | `scripts/resolve-nfl-prediction-outcomes.ts` (existing) |
| Grok adapter | Extends existing pattern | modeled on `scripts/generate-pga-best-bets.mjs` |
| ChatGPT adapter | New | no existing pattern |
| Private UI route | Extends existing pattern | modeled on `/internal/jkb-nfl-v03-review-7f3c9a` in `src/App.tsx` |
