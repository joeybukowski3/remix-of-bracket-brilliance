# NFL Situational Trends

## Scope

The NFL Situational Trends product is a descriptive research layer. It exposes the locked Phase 1 and Phase 2B trend library, Phase 2 robustness conclusions where available, and deterministic current-season qualification. It does not feed projections, power ratings, props, matchup advantages, pick grading, or performance tracking.

## Data flow

1. Historical definitions and metrics remain canonical in:
   - `public/data/nfl/research/situational-trends-v1.json`
   - `public/data/nfl/research/situational-trends-phase2.json`
   - `public/data/nfl/research/situational-trends-phase2b.json`
2. `scripts/lib/nfl-situational-trend-current-core.mjs` imports the locked deterministic primitives from the Phase 1 and Phase 2B research cores. It builds one current team-game context and evaluates all 24 broad definitions.
3. `scripts/generate-nfl-situational-trend-matchups.mjs` joins canonical schedule, result, team, and market inputs with the research metadata and writes `public/data/nfl/2026/situational-trend-matchups.json`.
4. `src/lib/nfl/situationalTrends.ts` validates, types, ranks, resolves, and filters the generated data for both UI surfaces. React does not reimplement qualification rules or recalculate historical metrics.

Generate the current artifact with:

```powershell
npm run nfl:situational-trends:current
```

## Qualification states

- `CONFIRMED`: every required canonical input is available and the locked rule qualifies.
- `AWAITING_MARKET`: qualification depends on a current or prior-game spread that is not published.
- `AWAITING_PRIOR_RESULT`: qualification depends on a previous same-season game that is not final.
- `UNAVAILABLE`: the required field is absent from the current public contract. The current example is overtime, which is not inferred from scores.
- `NOT_APPLICABLE`: all required inputs are known and the locked rule does not qualify. To keep the browser artifact compact, this state is inferred when no confirmed or pending row exists for a team/trend pair.

Schedule-only trends can become confirmed before markets or results exist. Market-role angles wait for spreads; result-dependent angles wait for the prior final; prior upset/letdown variants can additionally wait for the previous market.

## Evidence presentation

Ordering is deterministic and does not use ATS percentage as a primary score. It considers, in order: presentation tier, Phase 2 robustness label, evidence classification, confidence, full-history sample size, recent/full stability, and name.

- `NOTEWORTHY`: supported by the locked robustness/evidence metadata.
- `CONTEXTUAL`: useful descriptive context that does not meet the strongest research bar.
- `CLASSIC_ANGLE`: common football or betting situations with weak, insufficient, or no broad historical ATS edge.

All qualifying trends remain visible. Positive ROI and recent strength are never labeled as a recommendation or guarantee.

## Public surfaces

- Matchup detail: `/nfl/matchups/:gameSlug#trends`, implemented as the fifth entry in the existing tab system.
- Standalone library and scanner: `/nfl/trends`, inside `NflPlatformLayout` and the centralized NFL navigation.

Both surfaces consume the same generated artifact and resolver utilities.

## Current data limitations

- The committed 2026 schedule supports kickoff, home/away, divisional chronology, rest/bye, travel, and prime-time scheduling qualifiers.
- Market-role and market-dependent schedule angles remain pending where `matchup-market.json` has no spread.
- Prior-result angles remain pending until the immediately preceding game is final.
- The public result artifact currently lacks an overtime indicator, so coming-off-overtime is reported unavailable rather than inferred.
- Historical evidence windows remain fixed at 2011–2025 and 2021–2025; the 2026 scanner does not recompute them.
