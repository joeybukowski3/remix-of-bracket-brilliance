# NFL DraftKings DFS Contest Analyzer

The current read-only slate analyzer for a user-supplied DraftKings NFL Classic
salary CSV. The fantasy projection and ranking authority remains
[Fantasy weekly projections](../models/fantasy-weekly-projections.md), rendered
publicly by [Fantasy Weekly Rankings](fantasy-weekly-rankings.md). This feature
document owns CSV validation, slate-local joins/ranks, compatibility, and
presentation behavior; it does not duplicate fantasy methodology.

## Route and implementation

- **Route:** `/nfl/dfs`, registered in [`src/App.tsx`](../../src/App.tsx).
- **Page:**
  [`NFLDfsContestAnalyzer.tsx`](../../src/pages/nfl/NFLDfsContestAnalyzer.tsx).
- **UI:** [`src/components/nfl/dfs/`](../../src/components/nfl/dfs/).
- **Domain/parser/adapters:**
  [`src/lib/nfl/dfs/`](../../src/lib/nfl/dfs/).

The selected regular-season week is derived from the canonical NFL schedule
and is query-addressable with `?week=`. If no regular-season schedule exists,
the page renders an unavailable state instead of inventing a slate week.

## DraftKings NFL Classic CSV contract

[`contracts.ts`](../../src/lib/nfl/dfs/contracts.ts) requires these named
columns (column order may vary): `Position`, `Name + ID`, `Name`, `ID`,
`Roster Position`, `Salary`, `Game Info`, `TeamAbbrev`, `AvgPointsPerGame`, and
`Status`. Supported positions are QB, RB, WR, TE, and DST, with the expected
NFL Classic roster-position values. The analyzer accepts NFL Classic only;
Showdown/Captain and unrelated formats are rejected.

[`draftKingsCsv.ts`](../../src/lib/nfl/dfs/draftKingsCsv.ts) parses every row
and returns a structured result containing accepted/rejected status, detected
format, normalized valid rows, raw/valid/invalid counts, a slate summary, and
row/field diagnostics. Blocking diagnostics cover empty/header-only files,
missing/duplicate headers, parse/width/value errors, invalid positions,
roster-position/salary/ID errors, duplicate DK IDs, and unsupported formats.
Unknown extra columns and unknown nonblank status values are warnings rather
than silent drops. Malformed rows never disappear without a diagnostic.

The upload UI in
[`NflDfsUploadPanel.tsx`](../../src/components/nfl/dfs/NflDfsUploadPanel.tsx)
supports browse and drag/drop, reports parser diagnostics, and only passes an
accepted slate into analysis.

## Projection authority and identity

`DFS_PROJECTION_SOURCE = "JKB Full PPR"` is locked in
[`slateAnalyzer.ts`](../../src/lib/nfl/dfs/slateAnalyzer.ts). The page consumes
the canonical production artifact
`public/data/fantasy/projections/<season>/week-<NN>.json` through
[`useWeeklyFantasyProjectionArtifact.ts`](../../src/hooks/useWeeklyFantasyProjectionArtifact.ts).
It flattens the artifact's QB/RB/WR/TE rows for lookup; it never recalculates,
rescales, or substitutes projections.

This is **not a DraftKings scoring projection**. The details panel compares the
informational DK rules in
[`nflClassicRules.ts`](../../src/lib/nfl/dfs/nflClassicRules.ts) with canonical
JKB Full PPR scoring so users can see the mismatch. The DK salary cap remains
unknown because no verified repository source establishes it.

Offensive identity resolution in
[`identity.ts`](../../src/lib/nfl/dfs/identity.ts) uses conservative normalized
name plus exact position, with team used only to disambiguate exact candidates.
It never fuzzy-matches a materially different name. Outcomes are explicit:
resolved, unresolved, ambiguous, position conflict, or team conflict. Duplicate
DK rows resolving to one canonical player are reported and lose downstream JKB
metrics rather than one row winning silently.

DST resolves only by canonical normalized team abbreviation and checks game
participation context. The weekly fantasy artifact has no DST projection, so
DST rows show DK salary/status/team context and positional salary rank only;
JKB projection, JKB ranks, Rank Diff, and points/$1K remain unavailable.

## Slate analysis outputs

[`buildDfsSlateAnalysis`](../../src/lib/nfl/dfs/slateAnalyzer.ts) operates only
on the uploaded slate. Off-slate fantasy players never enter a displayed slate
ranking.

- **DK position salary rank:** salary rank among all structurally valid uploaded
  rows at that position, including the separate DST population.
- **DK overall salary rank:** salary rank among uploaded offensive rows; DST is
  excluded so the universe is comparable to the offensive JKB overall rank.
- **JKB weekly position rank:** copied verbatim from the canonical fantasy
  artifact.
- **JKB slate position rank:** projected-points rank among resolved,
  non-conflicted uploaded offensive players at the same position.
- **JKB overall slate projection rank:** projected-points rank among all
  resolved, non-conflicted uploaded offensive players.
- **Rank Diff:** DK salary rank minus JKB slate projection rank, with positional
  and overall forms. Positive/negative display and heat are presentation, not a
  new projection or betting edge.
- **Points/$1K:** canonical JKB Full PPR projected points divided by uploaded
  salary in thousands. Because the numerator is Full PPR, this is not a
  DraftKings-scoring projection or optimized lineup claim.

The UI supplies Value Board, QB/RB/WR/TE/DST tabs, search, availability and
direction filters, sorting, status badges, compact cards/table rows, expandable
research, and a slate summary with projection/research coverage and readiness.
[`presentation.ts`](../../src/lib/nfl/dfs/presentation.ts) only filters, sorts,
formats, and colors already-computed analyzer rows. Its Rank Diff heat bands
are explicitly provisional presentation thresholds, not model thresholds.

## Research/context adapter

The optional companion artifact is
`public/data/fantasy/weekly-research/<season>/week-<NN>.json`, loaded by
[`useWeeklyFantasyResearchArtifact.ts`](../../src/hooks/useWeeklyFantasyResearchArtifact.ts).
[`research.ts`](../../src/lib/nfl/dfs/research.ts) delegates to the canonical
exact-`playerId` weekly research join and canonical matchup-grade helper. It may
attach season/last-five PPG, opponent FPA, usage evidence, matchup grade, and
trench/EPA/success context.

The adapter does **not** recompute a metric, matchup edge, or matchup grade.
Missing rows and position mismatches become unavailable. A research artifact
whose season or week differs from the selected slate is treated as unavailable
and is not joined; the projection/ranking layer remains independent.

## Compatibility and failure behavior

[`artifactCompatibility.ts`](../../src/lib/nfl/dfs/artifactCompatibility.ts)
checks the uploaded games against the canonical selected-week schedule,
projection artifact season/week, optional research season/week, projection
freshness, identity conflicts, and team mismatches.

- A missing or wrong-season/week production projection artifact is blocking.
  No other week, ROS, PAR, or superseded fantasy artifact is substituted.
- An unmatched/ambiguous DK game is blocking.
- Projection age is warning-only; existing timestamps are preserved.
- Missing or incompatible weekly research is a warning and produces unavailable
  research context, not a fallback or projection failure.
- Unresolved fringe-player identities and audited/unexplained team mismatches
  remain visible diagnostics. Identity conflicts suppress JKB metrics for the
  affected rows.

The presentation layer therefore remains downstream of the canonical fantasy
authority: DFS compares salary and slate-relative ranks to published fantasy
outputs but never becomes a second fantasy model.

## Relevant tests

- [`draftKingsCsv.test.ts`](../../src/lib/nfl/dfs/draftKingsCsv.test.ts) and
  [`NflDfsUploadPanel.test.tsx`](../../src/components/nfl/dfs/NflDfsUploadPanel.test.tsx):
  CSV contract, format rejection, diagnostics, and upload flow.
- [`identity.test.ts`](../../src/lib/nfl/dfs/identity.test.ts): exact offensive
  identity, team disambiguation, DST identity, and duplicate conflicts.
- [`slateAnalyzer.test.ts`](../../src/lib/nfl/dfs/slateAnalyzer.test.ts): salary
  ranks, JKB ranks, Rank Diff, points/$1K, uploaded-slate universes, and DST
  nullability.
- [`artifactCompatibility.test.ts`](../../src/lib/nfl/dfs/artifactCompatibility.test.ts)
  and [`research.test.ts`](../../src/lib/nfl/dfs/research.test.ts): blocking
  projection/game mismatches, warning-only freshness/research, exact research
  joins, and incompatible-artifact isolation.
- [`presentation.test.ts`](../../src/lib/nfl/dfs/presentation.test.ts),
  [`NflDfsAnalyzerTable.test.tsx`](../../src/components/nfl/dfs/NflDfsAnalyzerTable.test.tsx),
  and [`NflDfsSlateSummary.test.tsx`](../../src/components/nfl/dfs/NflDfsSlateSummary.test.tsx):
  downstream sorting/filtering, displays, rules, and Full PPR disclosure.
- [`NFLDfsContestAnalyzer.test.tsx`](../../src/pages/nfl/NFLDfsContestAnalyzer.test.tsx)
  and [`nfl-dfs-contest-analyzer.spec.ts`](../../tests/nfl-dfs-contest-analyzer.spec.ts):
  page wiring and end-to-end desktop/mobile behavior. The browser spec uses the
  repository analytics-blocking Playwright fixture.
