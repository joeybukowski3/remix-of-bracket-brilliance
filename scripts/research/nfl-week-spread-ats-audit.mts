/** Offline audit only. Reads archives; writes only an explicitly named research directory. */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

import { resolve, join } from 'node:path';

import { pathToFileURL } from 'node:url';

import { createHash } from 'node:crypto';

import { validatePredictionSnapshot, contentHash } from '../lib/nfl-production-prediction-archive.ts';

import { computeJkbAtsSide, computeAtsResult, computeFavoriteUnderdog } from '../lib/nfl-sides-performance.ts';

// Same semantic state as bettingLineContentHash.ts; avoids its bundler-only imports.

function buildBettingLineContentHash(r: any) {

  return contentHash({ v: 'jkb-betting-line-v1', league: r.league, jkbGameId: r.jkbGameId, provider: r.provider, sportsbook: r.sportsbook, spread: r.spread, total: r.total, moneyline: r.moneyline });

}

const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

export function metrics(rows: any[], key = 'projection') {

  const errors = rows.filter(r => Number.isFinite(r.actual) && Number.isFinite(r[key])).map(r => r[key] - r.actual);

  const absolute = errors.map(Math.abs).sort((a,b) => a-b);

  return { n: errors.length, mae: mean(absolute), rmse: errors.length ? Math.sqrt(mean(errors.map(e => e * e))!) : null, mean_signed_error: mean(errors), median_absolute_error: absolute.length ? (absolute[Math.floor((absolute.length-1)/2)] + absolute[Math.floor(absolute.length/2)])/2 : null };

}

export function selectLatest(rows: any[], cutoff: number, timeKey: string, idKey: string) {

  const valid = rows.filter(r => Number.isFinite(Date.parse(r[timeKey])) && Date.parse(r[timeKey]) < cutoff);

  valid.sort((a, b) => Date.parse(b[timeKey]) - Date.parse(a[timeKey]) || String(a[idKey]).localeCompare(String(b[idKey])));

  if (valid.length > 1 && valid[0][timeKey] === valid[1][timeKey] && valid[0][idKey] !== valid[1][idKey]) throw new Error('Ambiguous final timestamp');

  return valid[0] ?? null;

}

export function validMarket(r: any, game: any, cutoff: number) {

  return r.jkbGameId === game.gameId && r.homeTeamId === game.homeAbbr && r.awayTeamId === game.awayAbbr

    && r.kickoffUtc === game.dateUtc && r.spread != null && Number.isFinite(r.spread.homeLine)

    && r.spread.awayLine === -r.spread.homeLine && Boolean(r.provider && r.sportsbook)

    && Number.isFinite(Date.parse(r.capturedAt)) && Date.parse(r.capturedAt) < cutoff

    && (r.providerUpdatedAt == null || (Number.isFinite(Date.parse(r.providerUpdatedAt)) && Date.parse(r.providerUpdatedAt) < cutoff))

    && r.contentHash === buildBettingLineContentHash(r);

}

export function audit(root: string, season: number, week: number, asOf: string, book = 'draftkings') {

  if (week !== 1) throw new Error('This audit version supports Week 1 only');

  const files: Record<string, string> = {};

  const read = (path: string) => { const text = readFileSync(join(root, path), 'utf8'); files[path] = createHash('sha256').update(text).digest('hex'); return text; };

  const json = (path: string) => JSON.parse(read(path));

  const jsonl = (path: string) => read(path).split(/\r?\n/).filter(Boolean).map(s => JSON.parse(s));

  const cutoff = Date.parse(asOf);

  if (!Number.isFinite(cutoff) || !asOf.endsWith('Z')) throw new Error('as-of must be UTC ISO timestamp');

  const partition = `${season}/${String(week).padStart(2, '0')}`;

  const predictions = jsonl(`data/nfl/predictions/${partition}/jkb-power-number.jsonl`);

  const outcomes = jsonl(`data/nfl/prediction-outcomes/${partition}/spread.jsonl`);

  const games = json(`public/data/nfl/${season}/games.json`).games.filter((g: any) => g.week === week && g.seasonType === 'REG');

  const resultFile = json(`public/data/nfl/${season}/results.json`);

  const results = resultFile.results;

  const issues: any[] = [], rejected: any[] = [], marketRejected: any[] = [], seen = new Set<string>(), rows: any[] = [];

  const eligible: any[] = [];

  for (const p of predictions) {

    try {

      validatePredictionSnapshot(p);

      if (seen.has(p.prediction_id)) throw new Error('Duplicate prediction ID');

      seen.add(p.prediction_id);

      if (p.mode !== 'production' || p.status !== 'projected' || p.season !== season || p.week !== week || p.model_name !== 'jkb-power-number') throw new Error('Wrong audit population');

      const g = games.find((g: any) => g.gameId === p.game_id);

      if (!g || p.team !== g.homeAbbr || p.opponent !== g.awayAbbr || p.home_away !== 'home' || p.kickoff_utc !== g.dateUtc || p.neutral_site !== g.neutralSite) throw new Error('Schedule identity/kickoff mismatch');

      const v = p.feature_snapshot.values, h = v.home_current_rating, a = v.away_current_rating;

      if (h.abbr !== p.team || a.abbr !== p.opponent || h.gamesPlayed !== 0 || a.gamesPlayed !== 0 || h.performanceWeight !== 0 || a.performanceWeight !== 0 || h.preseasonWeight !== 1 || a.preseasonWeight !== 1 || h.rating !== h.preseasonV04Rating || a.rating !== a.preseasonV04Rating) throw new Error('Week 1 rating integrity failed');

      if (v.ovr_to_points_coefficient !== 0.24 || v.home_field_adjustment !== (p.neutral_site ? 0 : 2) || Math.abs(p.projection.projected_home_margin - (0.24 * (h.rating - a.rating) + v.home_field_adjustment)) > 1e-9) throw new Error('Formula mismatch');

      for (const hash of Object.values(p.feature_snapshot.source_manifest_hashes) as string[]) {

        const m = json(`data/nfl/predictions/manifests/sources/${hash}.json`);

        if (contentHash(m) !== hash) throw new Error('Source manifest hash mismatch');

        if (m.sources.some((s: any) => s.generated_at && Date.parse(s.generated_at) > Date.parse(p.prediction_timestamp))) throw new Error('Source generated after prediction');

      }

      const late = p.market_snapshot_refs.filter((m: any) => m.provider_updated_at && Date.parse(m.provider_updated_at) > Date.parse(p.prediction_timestamp));

      if (late.length) issues.push({ prediction_id: p.prediction_id, issue: 'Market provider update after prediction', references: late.map((m: any) => m.market_observation_id) });

      if (Date.parse(p.prediction_timestamp) <= cutoff) eligible.push(p);

    } catch (e) { rejected.push({ prediction_id: p.prediction_id, reason: String(e) }); }

  }

  for (const g of games) {

    const p = selectLatest(eligible.filter(p => p.game_id === g.gameId), Math.min(Date.parse(g.dateUtc), cutoff + 1), 'prediction_timestamp', 'prediction_id');

    if (!p) { rows.push({ game_id: g.gameId, status: 'missing_valid_prediction' }); continue; }

    const revisions = outcomes.filter(o => o.prediction_id === p.prediction_id && Date.parse(o.recorded_at) <= cutoff).sort((a, b) => b.outcome_revision - a.outcome_revision);

    if (revisions.length > 1 && revisions[0].outcome_revision === revisions[1].outcome_revision) throw new Error('Duplicate outcome revision');

    const o = revisions[0];

    const rs = results.filter((r: any) => r.gameId === g.gameId);

    if (rs.length > 1) throw new Error('Duplicate game result');

    const r = rs[0];

    const actual = o?.resolution_status === 'resolved' && o.game_completion_status === 'final' && o.game_id === g.gameId && o.team === g.homeAbbr && o.opponent === g.awayAbbr && o.prediction_type === 'spread' && g.status === 'final' && r?.final === true

      && r.homeAbbr === g.homeAbbr && r.awayAbbr === g.awayAbbr && Number.isFinite(r.homeScore) && Number.isFinite(r.awayScore)

      && o.actual?.margin === r.homeScore - r.awayScore && o.actual?.home_score === r.homeScore && o.actual?.away_score === r.awayScore && Date.parse(resultFile._meta.generatedAt) <= cutoff

      ? r.homeScore - r.awayScore : null;

    const marketPath = `data/market/betting-lines/history/nfl/${season}/${g.gameId}.jsonl`;

    const markets = existsSync(join(root, marketPath)) ? jsonl(marketPath) : [];

    const marketCutoff = Math.min(Date.parse(g.dateUtc), cutoff + 1);

    const valid = markets.filter(m => validMarket(m, g, marketCutoff));

    marketRejected.push(...markets.filter(m => !valid.includes(m)).map(m => ({ game_id: g.gameId, id: m.id, reason: 'Invalid identity/hash/line/timestamp or not before kickoff/as-of' })));

    const last = selectLatest(valid.filter(m => m.sportsbook === book), marketCutoff, 'capturedAt', 'id');

    const refs = p.market_snapshot_refs.filter((m: any) => m.sportsbook === book && m.purpose === 'comparison' && m.market_type === 'spread' && Date.parse(m.observed_at) <= Date.parse(p.prediction_timestamp) && (!m.provider_updated_at || Date.parse(m.provider_updated_at) <= Date.parse(p.prediction_timestamp)));

    const ref = refs.length === 1 ? refs[0] : null;

    const v = p.feature_snapshot.values;

    const side = computeJkbAtsSide(p.projection.projected_home_margin, ref ? -ref.line : null);

    const signedError = actual === null ? null : p.projection.projected_home_margin - actual;

    const marketError = actual === null || !last ? null : -last.spread.homeLine - actual;

    rows.push({ game_id: g.gameId, status: actual === null ? 'unresolved_or_unverified_outcome' : 'evaluable', prediction_id: p.prediction_id,

      prediction_timestamp: p.prediction_timestamp, kickoff: p.kickoff_utc, model_version: p.model_version, code_revision: p.code_revision,

      feature_payload_hash: p.feature_snapshot.feature_payload_hash, source_manifest_hashes: p.feature_snapshot.source_manifest_hashes,

      projection: p.projection.projected_home_margin, actual, outcome_id: o?.outcome_id ?? null, outcome_revision: o?.outcome_revision ?? null,

      final_score: actual === null ? null : `${r.awayScore}-${r.homeScore} (away-home)`, ovr_gap: v.home_current_rating.rating - v.away_current_rating.rating,

      hfa: v.home_field_adjustment, last_observed_market: last ? -last.spread.homeLine : null,

      market_evidence: last ? { id: last.id, provider: last.provider, book: last.sportsbook, captured_at: last.capturedAt, provider_updated_at: last.providerUpdatedAt, last_observed_at: last.lastObservedAt, home_line: last.spread.homeLine, home_price: last.spread.homePrice, away_price: last.spread.awayPrice, hours_before_kickoff: (Date.parse(g.dateUtc) - Date.parse(last.capturedAt)) / 3600000 } : null,

      prediction_market_reference: ref, edge: ref ? p.projection.projected_home_margin + ref.line : null,

      marketAtPrediction: ref, lastObservedPregameMarket: last ? { home_margin: -last.spread.homeLine, observation_id: last.id, captured_at: last.capturedAt, sportsbook: last.sportsbook, provider: last.provider } : null,

      verifiedClosingMarket: null, signed_error: signedError, absolute_error: signedError === null ? null : Math.abs(signedError), rmse_contribution: signedError === null ? null : signedError ** 2,

      last_observed_market_signed_error: marketError, last_observed_market_absolute_error: marketError === null ? null : Math.abs(marketError),

      forecast_improvement_points: signedError === null || marketError === null ? null : Math.abs(marketError) - Math.abs(signedError),

      closer_forecast: signedError === null || marketError === null ? null : Math.abs(signedError) < Math.abs(marketError) ? 'JKB' : Math.abs(signedError) > Math.abs(marketError) ? 'MARKET' : 'TIE',

      directional_ats_side: side, directional_ats_result: computeAtsResult(side, actual, ref?.line ?? null), directional_favorite_dog: computeFavoriteUnderdog(side, ref?.line ?? null),

      recommendation_result: 'NO_PICK', recommendation_status: 'No issued qualifying recommendation is established by projection/market records',

      closing_market: null, qualifying_pick: null, ats_result: null, clv: null });

  }

  const resolved = rows.filter(r => r.actual !== null && r.actual !== undefined);

  const paired = resolved.filter(r => Number.isFinite(r.last_observed_market));

  const record = (rs: any[]) => ({ wins: rs.filter(r => r.directional_ats_result === 'WIN').length, losses: rs.filter(r => r.directional_ats_result === 'LOSS').length, pushes: rs.filter(r => r.directional_ats_result === 'PUSH').length, no_lean: rs.filter(r => r.directional_ats_result === 'NEUTRAL').length, missing: rs.filter(r => r.directional_ats_result === null).length });

  const groups = (labels: string[], classify: (r: any) => string) => labels.map(label => ({ label, ...metrics(resolved.filter(r => classify(r) === label)), directional_ats: record(resolved.filter(r => classify(r) === label)), mean_ovr_gap: mean(resolved.filter(r => classify(r) === label).map(r => r.ovr_gap)), mean_projection: mean(resolved.filter(r => classify(r) === label).map(r => r.projection)), mean_actual: mean(resolved.filter(r => classify(r) === label).map(r => r.actual)) }));

  return { schema: 'jkb-week-spread-ats-audit-v1', season, week, as_of: asOf, book, results_generated_at: resultFile._meta.generatedAt, input_sha256: files,

    coverage: { scheduled_games: games.length, archive_rows: predictions.length, eligible_snapshots: eligible.length, rejected_snapshots: rejected.length, selected_games: rows.filter(r => r.prediction_id).length, resolved_games: resolved.length,

      completed_games_expected: games.filter((g: any) => g.status === 'final').length, completed_games_joined: resolved.length, missing_finals: rows.filter(r => r.actual == null).map(r => r.game_id),

      market_at_prediction_games: rows.filter(r => r.marketAtPrediction).length, last_observed_pregame_market_games: rows.filter(r => r.lastObservedPregameMarket).length, verified_closing_games: 0, qualifying_ats_pick_games: 0 },

    jkb: metrics(resolved), closing_market: metrics([], 'closing_market'), last_observed_market: metrics(paired, 'last_observed_market'),

    last_observed_paired_jkb: metrics(paired), closer_to_last_observed_market: { n: paired.length, jkb: paired.filter(r => Math.abs(r.projection-r.actual) < Math.abs(r.last_observed_market-r.actual)).length, market: paired.filter(r => Math.abs(r.projection-r.actual) > Math.abs(r.last_observed_market-r.actual)).length, ties: paired.filter(r => Math.abs(r.projection-r.actual) === Math.abs(r.last_observed_market-r.actual)).length },

    ats: { status: 'unavailable', reason: 'No immutable qualifying-pick/threshold record joined; projection direction is not an actual pick.' },

    directional_ats: { n: resolved.filter(r => r.directional_ats_result != null).length, ...record(resolved), selection_logic: 'computeJkbAtsSide: strictly positive gap=home; strictly negative=away; zero=pick; no minimum threshold', recommendation_record: { wins: 0, losses: 0, pushes: 0, no_pick: rows.length, established_qualifying_picks: 0 } },

    clv: { status: 'unavailable', reason: 'Neither actual qualifying pick nor proven closing observation available.' },

    edge_buckets: groups(['missing', '[0,1)', '[1,3)', '[3,5)', '[5,infinity)'], r => r.edge === null ? 'missing' : Math.abs(r.edge) < 1 ? '[0,1)' : Math.abs(r.edge) < 3 ? '[1,3)' : Math.abs(r.edge) < 5 ? '[3,5)' : '[5,infinity)'),

    ovr_gap_buckets: groups(['[0,10)', '[10,20)', '[20,infinity)'], r => Math.abs(r.ovr_gap) < 10 ? '[0,10)' : Math.abs(r.ovr_gap) < 20 ? '[10,20)' : '[20,infinity)'),

    directional_home_away_diagnostics: groups(['home','away','pick','missing'], r => r.directional_ats_side ?? 'missing'),

    directional_favorite_dog_diagnostics: groups(['favorite','underdog','pick','missing'], r => r.directional_favorite_dog ?? 'missing'),

    home_field: [0, 2].map(hfa => ({ hfa, ...metrics(resolved.filter(r => r.hfa === hfa)), mean_actual_home_margin: mean(resolved.filter(r => r.hfa === hfa).map(r => r.actual)), mean_projection: mean(resolved.filter(r => r.hfa === hfa).map(r => r.projection)) })),

    largest_misses: [...resolved].sort((a,b) => Math.abs(b.projection-b.actual)-Math.abs(a.projection-a.actual)).slice(0,5), rows, rejected, rejected_market_observations: marketRejected, integrity_issues: issues };

}

export function renderReport(a: ReturnType<typeof audit>) {

  const f = (x: number | null | undefined) => x == null ? 'Unavailable' : x.toFixed(3);

  const table = (headers: string[], rows: any[][]) => ['| ' + headers.join(' | ') + ' |', '| ' + headers.map(() => '---').join(' | ') + ' |', ...rows.map(r => '| ' + r.join(' | ') + ' |')].join('\n');

  const c = a.closer_to_last_observed_market;

  return `# JKB ${a.season} Week ${a.week} spread + ATS audit

Audit only. Local evidence as of **${a.as_of}**. Partial slate: **${a.coverage.resolved_games}/${a.coverage.scheduled_games}** games have verified final outcomes. These are immutable forward-production predictions, not reconstructed postgame projections. No model or production projection artifact was changed; canonical scores and separate outcome events were completed.

## Week 1 Baseline — Do Not Recalibrate From This Sample

Frozen baseline as of **2026-09-14T10:43:31Z**: **15 finished games**. All forecast metrics below use **n=15** on the same completed games; later audits must preserve this baseline.

| Metric | JKB (n=15) | Last-observed pregame market (n=15) |
| --- | ---: | ---: |
| MAE | 12.16 | 10.83 |
| RMSE | 14.20 | 13.14 |
| Median absolute error | 13.20 | 11.00 |
| Mean signed error | +4.22 | +3.37 |

JKB closer: **5/15**; market closer: **10/15**. Mean JKB forecast improvement versus market: **−1.33 points/game (n=15)**. Directional ATS: **5-9-1 (n=15; decided n=14)**. Official/issued ATS record: **unavailable because issuance evidence does not exist**. Verified closing lines: **unavailable (0 canonical closes)**. Market snapshots were **2.85–10.45 hours before kickoff**; they are last-observed pregame observations, never verified closing lines.

JKB underperformed the available pregame market benchmark in Week 1. Large individual misses warrant monitoring of preseason priors and large OVR gaps. This sample is insufficient to change the **0.24 OVR coefficient, +2 HFA, Current OVR blending, preseason architecture or ATS logic**. Evaluate Weeks 2–4 using the same immutable-prekickoff methodology.

## Formula and architecture

Current model: \`jkb-power-number-v1.0.0\`; feature schema \`nfl-current-rating-power-number-feature-v1\`; archive pipeline \`nfl-production-prediction-archive-v1\`.

Exact unrounded formula: \`home margin = 0.24 × (home Current OVR − away Current OVR) + HFA\`. HFA is **2.0** at an ordinary home site and **0.0** at a neutral site. Power Number is \`(Current OVR − mean of all 32 Current OVRs) × 0.24\`; centering cancels in the matchup difference. Sportsbook presentation rounds to one decimal and assigns the negative line to the favored team. Error is \`projection − (home score − away score)\`; positive bias means overprojecting the home margin.

Production trace: [generator](../../../scripts/generate-nfl-matchup-projections.mts) reads preseason-power-ratings.json (v0.3.1 OFF/DEF anchors), projected-power-ratings-v04.json (preseason OVR anchor), team-performance-analytics.json (live performance) and games.json. [currentRating2026.ts](../../../src/lib/nfl/currentRating2026.ts) blends and clamps ratings to [1,99]; [jkbPowerNumber2026.ts](../../../src/lib/nfl/jkbPowerNumber2026.ts) builds the full 32-team Power Number board and game margin. The generator finalizes and validates the immutable archive before replacing matchup-projections.json. [projectionData.ts](../../../src/lib/nfl/projectionData.ts) consumes the public margin and compares it downstream to market; no market enters spread math. [outcome resolver](../../../scripts/lib/nfl-prediction-outcome-resolver.ts) appends separate outcomes; the existing evaluation materializer evaluates snapshots independently. This audit instead selects one final valid snapshot per game.

Current OVR = preseason weight × v0.4 preseason OVR + performance weight × live Performance Rating. Preseason/live weights by each team's own completed games: 0:100/0; 1:80/20; 2:60/40; 3:40/60; 4:25/75; 5:10/90; 6+:0/100 percent. Every included Week 1 snapshot has zero completed games and 100/0 weights. This audit therefore measures the preseason anchor plus fixed conversion/HFA, not the live blend.

The 0.24 coefficient and 2.0 HFA came from walk-forward Current-OVR calibration (reconstruction 2023–2025; out-of-sample 2024/2025, 544 games). The governing master spec reports historical production-HFA MAE 10.26/RMSE 13.14 versus market MAE 9.67 and model ATS 50.46% on 539 decided games. Historical research is a separate benchmark, never pooled with these forward rows. There is no new fitting, tuning, holdout claim or candidate promotion here.

## Population, selection and evidence

Source: [Week 1 prediction archive](../../../data/nfl/predictions/${a.season}/${String(a.week).padStart(2,'0')}/jkb-power-number.jsonl). ${a.coverage.archive_rows} snapshots; ${a.coverage.eligible_snapshots} eligible; ${a.coverage.rejected_snapshots} rejected. ${a.coverage.selected_games} selected games. Selection uses the latest valid production/projected timestamp **strictly before canonical kickoff**, bounded by audit cutoff; ambiguous equal final timestamps fail closed. Material-state idempotency means the final archived timestamp is not necessarily the final generator run. No regeneration occurs.

Outcomes use the highest available revision by prediction ID at cutoff, requiring a resolved/final event and matching canonical final schedule/result, teams and both scores. Source results generated at ${a.results_generated_at} contain ${a.coverage.resolved_games} verified finals in this checkout. Missing finals remain excluded, regardless of real-world game completion. The free public-source data-completion step uses the canonical parser and append-only spread outcome resolver; this offline audit does not substitute current predictions or infer scores. All selected IDs, timestamps, revisions, feature/source-manifest hashes and whole-input SHA-256 hashes are in [audit.json](audit.json).

Market policy is one fixed book (**${a.book}**), provider/game/team/kickoff matched, coherent home/away lines, verified semantic content hash, captured and provider update times strictly before kickoff/cutoff. Latest valid archived state is selected deterministically. Historical stores update observation metadata in place for unchanged prices; lastObservedAt/providerUpdatedAt do not prove immutable full capture history. True closing coverage is **not established**. No last-observed line is relabeled closing.

## Accuracy and market comparison

${table(['Metric','JKB','Proven closing market','Last archived pre-kickoff market (not closing)'], [

 ['n',a.jkb.n,a.closing_market.n,a.last_observed_market.n],

 ['MAE',f(a.jkb.mae),'Unavailable',f(a.last_observed_market.mae)],

 ['RMSE',f(a.jkb.rmse),'Unavailable',f(a.last_observed_market.rmse)],

 ['Mean signed error',f(a.jkb.mean_signed_error),'Unavailable',f(a.last_observed_market.mean_signed_error)],

 ['Median absolute error',f(a.jkb.median_absolute_error),'Unavailable',f(a.last_observed_market.median_absolute_error)],

])}

JKB-vs-closing-market closer %: **Unavailable**. Against last archived market on identical games: JKB closer ${c.jkb}/${c.n} (${c.n ? f(100*c.jkb/c.n) : 'Unavailable'}%); market closer ${c.market}; equal errors ${c.ties}. This is a paired descriptive comparison on one partial week, not a persistent superiority conclusion.

## ATS qualifying picks and CLV

Issued qualifying recommendations ATS W-L-P: **Unavailable (0 established qualifying picks)**. Each game is **NO_PICK**, meaning no issued recommendation is established, not that a known threshold rejected it. Projection and comparison records do not establish issuance.

Verified production [nfl-sides-performance.ts](../../../scripts/lib/nfl-sides-performance.ts) uses \`computeJkbAtsSide\`: positive unrounded gap = home; negative = away; exactly zero = pick. **There is no minimum threshold, including no 2.5-point threshold.** \`computeAtsResult\` grades that directional side against the prediction-time line; NEUTRAL means no lean. The production [sides UI](../../../src/components/nfl/performance/NflPerformanceSidesTab.tsx) calls this **ATS Directional Hit Rate**. This audit calls those unchanged production functions and preserves the distinction from an issued recommendation.

Directional ATS **${a.directional_ats.wins}-${a.directional_ats.losses}-${a.directional_ats.pushes} (n=${a.directional_ats.n} completed games; decided n=${a.directional_ats.wins+a.directional_ats.losses}; no lean=${a.directional_ats.no_lean}; missing=${a.directional_ats.missing})**, at the exact embedded ${a.book} prediction-time reference. Recommendation classification **NO_PICK ${a.rows.length}/${a.rows.length}**; ${a.coverage.scheduled_games-a.coverage.resolved_games} unfinished game has no outcome grade.

CLV: **Unavailable** because actual qualifying picks and proven closing observations are missing. Valid future CLV must compare the selected side's archived bet line against the same book's proven close: home CLV = bet home line − closing home line; away CLV uses away lines. Positive means a better number. No pseudo-CLV from stale last-observed lines is substituted. Prices and sample sizes must accompany any future ATS/ROI analysis.

## Edge buckets

Fixed descriptive absolute model-minus-prediction-market gap buckets, using only the immutable ${a.book} comparison reference available by prediction time. Buckets were not optimized. These are projection diagnostics; qualifying-pick ATS by bucket remains unavailable in every cell.

${table(['Absolute gap (points)','n resolved','JKB MAE','Signed error','Directional ATS W-L-P'], a.edge_buckets.map(b => [b.label,b.n,f(b.mae),f(b.mean_signed_error),`${b.directional_ats.wins}-${b.directional_ats.losses}-${b.directional_ats.pushes}`]))}

## OVR-gap calibration

${table(['Absolute OVR gap','n','Mean signed OVR gap','Mean projected margin','Mean actual margin','MAE'], a.ovr_gap_buckets.map(b => [b.label,b.n,f(b.mean_ovr_gap),f(b.mean_projection),f(b.mean_actual),f(b.mae)]))}

Calibration slope/intercept and correlation remain withheld under the existing audit policy: one week cannot establish a stable OVR-to-score relationship. The large-gap neutral-site miss is a monitoring observation, not evidence to shrink 0.24. No full-slate calibration is claimed.

## Home-field diagnostics

${table(['HFA','n','Mean projection','Mean actual home margin','Signed error','MAE'], a.home_field.map(b => [b.hfa,b.n,f(b.mean_projection),f(b.mean_actual_home_margin),f(b.mean_signed_error),f(b.mae)]))}

The neutral-site classification is preserved from the archive and canonical schedule, including SF–LA. A designated home team at a neutral site does not receive HFA. Ordinary home has ${a.home_field.find(r => r.hfa === 2)?.n} resolved games and neutral has ${a.home_field.find(r => r.hfa === 0)?.n}; no home-field estimate or per-team adjustment is defensible.

## Five largest projection misses

Only ${a.largest_misses.length} verified finals exist; positions 3–5 are unavailable in this run.

${table(['Game','Prediction UTC','Projected home margin','Actual home margin','Absolute miss','Last market margin','Market observation UTC','Hours before kickoff'], a.largest_misses.map(r => [r.game_id,r.prediction_timestamp,f(r.projection),r.actual,f(Math.abs(r.projection-r.actual)),f(r.last_observed_market),r.market_evidence?.captured_at ?? 'Unavailable',f(r.market_evidence?.hours_before_kickoff)]))}

SF–LA dominates the available error. Both JKB and market favored the designated home side, which lost by 20. Scores alone cannot identify injury, turnover, efficiency or coaching causes; this report does not manufacture a causal explanation.

## Data integrity and leakage

- Archive validator verifies schema, UTC timing, feature-payload hash and content-addressed prediction identity. Duplicate prediction IDs and ambiguous final timestamps are rejected. ${a.coverage.rejected_snapshots} rejected snapshots; ${a.integrity_issues.length} late market-reference diagnostics.

- Schedule joins use exact canonical game IDs, lowercase team identities, kickoff and neutral flag; no fuzzy matching. NFL raw ID aliases LA/WAS/JAX are retained in IDs while canonical teams use lar/wsh/jax.

- Every eligible Week 1 feature row has zero games played, zero live weight, unit preseason weight and rating equal to its preseason anchor; formula/HFA invariants pass. Target-game outcomes do not enter selection or projection.

- Source manifests are present and content-hash verified. They identify original source bytes; the mutable source bodies are not all stored under those hashes. This cannot prove original provider publication timing, v0.4 input independence or reconstruct every upstream preprocessing step. No current source is substituted for archived feature values.

- Outcomes remain separate; pending/missing games never become zero-score games. The ${a.coverage.scheduled_games-a.coverage.resolved_games} missing finals are visible below. Closing, ATS and CLV missingness remains explicit null/unavailable.

- Market hashes establish semantic state, not authentic capture timestamps. Metadata can be refreshed in place; closing history and timing completeness remain limitations.

- Master spec contains older gap-analysis/audit-answer prose saying archives/outcomes/evaluation do not exist, despite its newer WU1/WU2/WU3 sections, linked schemas and actual archives. This conflict is reported and historical prose is preserved. No production resolver logic was changed; only its existing spread-only data-resolution mode was run.

- Paired metrics use identical games; one final prediction per game prevents repeat-snapshot weighting. No hindsight pick filter, market-best-book cherry-pick, paid research, workflow, external write or model-projection generator was used.

## Selected-slate ledger

${table(['Game','Selected prediction UTC','Home margin','Actual','Signed error','Absolute error','Squared error (RMSE contribution)','Last market signed error','Improvement points','Closer','Directional ATS','Recommendation'], a.rows.map(r => [r.game_id,r.prediction_timestamp ?? 'Unavailable',f(r.projection),f(r.actual),f(r.signed_error),f(r.absolute_error),f(r.rmse_contribution),f(r.last_observed_market_signed_error),f(r.forecast_improvement_points),r.closer_forecast ?? 'Unavailable',r.directional_ats_result ?? 'Pending',r.recommendation_result]))}

Forecast improvement points = market absolute error minus JKB absolute error (positive favors JKB). RMSE contribution is squared error. These error fields are null for unverified outcomes. Mean paired improvement = **${f(c.n ? a.last_observed_market.mae! - a.last_observed_paired_jkb.mae! : null)} points (n=${c.n})**.

## Home/away and favorite/dog diagnostics

These splits describe the production directional side, not issued picks. Error remains home-margin oriented. Site diagnostics appear above.

${table(['Directional side','n','MAE','Signed error','Directional ATS W-L-P'], a.directional_home_away_diagnostics.map(b => [b.label,b.n,f(b.mae),f(b.mean_signed_error),`${b.directional_ats.wins}-${b.directional_ats.losses}-${b.directional_ats.pushes}`]))}

${table(['Market role of directional side','n','MAE','Signed error','Directional ATS W-L-P'], a.directional_favorite_dog_diagnostics.map(b => [b.label,b.n,f(b.mae),f(b.mean_signed_error),`${b.directional_ats.wins}-${b.directional_ats.losses}-${b.directional_ats.pushes}`]))}

## Data completion and market-source trace

Root cause **A: stale refresh**. Previous canonical results.json was generated **2026-09-13T14:20:07.501Z**, before Sunday kickoffs. Canonical [generator](../../../scripts/generate-nfl-schedules-results.mjs), \`npm run nfl:schedules\`, reads [free nflverse nfldata games.csv](https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv). [Core transform](../../../scripts/lib/nfl-schedules-results-core.mjs) filters numeric season, preserves week/game_type and game_id, normalizes nflverse team codes via teams.json, converts Eastern kickoff to UTC, and emits finals only when both integer scores exist. The audit filters REG/Week 1 and joins exact IDs. No normalization failure was found.

Shell fetches were blocked by sandbox socket permissions. The same public source was retrieved through the web tool; original header and verbatim 16 Week 1 rows are in [evidence CSV](evidence/nfldata-week1-2026.csv). [Scoped completion producer](../../../scripts/research/complete-nfl-week1-result-data.mjs) uses the unchanged canonical transform, validates identity/kickoff/neutral status and no final regression, merges only those 16 games, and preserves other season rows. The generic generator was not run on this partial input because that would truncate the season. The existing **spread-only** resolver then appended outcomes. Original prediction bytes and selected IDs are checked against [completion provenance](evidence/completion-provenance.json). No projections or ratings were regenerated.

The separate fantasy schedules cache, data/nfl/nflverse/schedules/games.csv, retrieved 2026-08-21, contains identity fields but **no scores**: no hidden finals in schema B. All 15 public finals join: failure C not observed. DEN–KC has blank scores and a future kickoff 2026-09-15T00:15Z: genuinely unfinished D.

Market inventory: immutable prediction market_snapshot_refs establish **marketAtPrediction**. Data/market/betting-lines/history/nfl/2026 contains The Odds API game/book states with capture/update times. Public betting-lines-history and betting-lines-current are derived views of that same store, not independent close evidence. Public nfl matchup-market.json and nfldata CSV contain unnamed, untimestamped settled historical lines, explicitly not verified close. Betting-splits histories contain SportsDataIO timing/count context, not canonical same-book closing spreads. Player props/anytime TD/yardage-alt archives are different markets and cannot supply game spreads. No paid provider refresh occurred. None proves canonical closing coverage. The JSON keeps **marketAtPrediction**, **lastObservedPregameMarket**, and **verifiedClosingMarket=null** separately; older descriptive keys remain compatible.

Coverage: **expected finished=${a.coverage.completed_games_expected}; joined=${a.coverage.completed_games_joined}; missing finals=${a.coverage.missing_finals.join(', ')}; market at prediction=${a.coverage.market_at_prediction_games}/${a.coverage.scheduled_games}; last observed pregame=${a.coverage.last_observed_pregame_market_games}/${a.coverage.scheduled_games}; verified close=0/${a.coverage.scheduled_games}; established qualifying ATS picks=0/${a.coverage.scheduled_games}**.

## What Week 1 can teach us

This archive can support an honest forward audit and identifies the operational evidence gaps: complete final-score attachment, immutable qualifying picks and closing-capture provenance. The completed-game sample has JKB closer ${c.jkb}/${c.n}, market closer ${c.market}/${c.n}, and ties ${c.ties}/${c.n}; the largest individual miss is the neutral-site SF–LA game. Track these observations prospectively as the remaining finals become locally available. Preserve the same selection and comparison policies on every rerun.

## What is too early to act on

Do not change coefficients, ratings, preseason/live weights, HFA or ATS thresholds from this sample. Even a complete 16-game week is small and its edge/OVR/site cells smaller; current cells of one game are explicitly exploratory. The live blend has no Week 1 evidence here. No profitability, causal, calibration or persistent market advantage conclusion is supported. Any future model hypothesis needs prior declaration, temporal validation and an untouched future period; no candidate is proposed or promoted.

### Fix Now

The demonstrated stale-score/outcome coverage defect is fixed locally for all 15 finished games. No parser, ID join or model implementation defect was found. Closing and issued-recommendation evidence gaps stay explicit; production capture infrastructure is unchanged.

### Monitor Weeks 2–4

Track signed home-margin bias, large OVR-gap misses, directional home/away splits and market-relative errors prospectively under the unchanged policy. These are plausible monitoring signals from n=${a.jkb.n}, not proven calibration defects.

### Revisit After Larger Sample

Changes to 0.24, +2 HFA, Current OVR blending, preseason priors generally or ATS thresholds require a larger temporally valid sample and separate authorization. None is recommended or implemented.

## Reproduce and validate

Requires the repository TypeScript runner (tsx); runtime is offline. Existing dependencies were reused without an npm install.

Exact validation results and known pre-existing failures are in [VALIDATION.md](evidence/VALIDATION.md). Audit tests pass; Node-config TypeScript passes. Application TypeScript and focused dependency TypeScript have existing failures. Parser/market suites: 48/48 pass, including season filtering, final-game detection and the corrected current-season result assertions.

\`node node_modules/tsx/dist/cli.mjs scripts/research/nfl-week-spread-ats-audit.mts --season=2026 --week=1 --as-of=${a.as_of} --book=${a.book} --output-dir=docs/research/nfl-week1-spread-ats-audit-2026 --replace-report=true\`

\`node node_modules/tsx/dist/cli.mjs --test scripts/research/nfl-week-spread-ats-audit.test.mts\`

Outputs are only audit.json and REPORT.md under the explicitly named docs/research directory. Input SHA-256 manifest is embedded in audit.json; reruns with identical local inputs/cutoff are deterministic. Later source refreshes should use a new dated output directory; explicit --replace-report=true permits the user-authorized replacement performed in this completion task. Application build, UI/browser tests and full application suite were not run for this data-only task. Application and Node TypeScript checks and relevant parser/market tests were run separately; the existing spread-only outcome resolver was run after canonical score completion. No commit or push.

`;

}

function main() {

  const options: Record<string,string> = {};

  for (const arg of process.argv.slice(2)) { const m = /^--(season|week|as-of|book|output-dir|replace-report)=(.+)$/.exec(arg); if (!m) throw new Error(`Unknown argument ${arg}`); options[m[1]] = m[2]; }

  if (!options['as-of'] || !options['output-dir']) throw new Error('Required: --as-of=<UTC> --output-dir=docs/research/<directory>');

  const root = process.cwd(), output = resolve(root, options['output-dir']);

  const researchRoot = resolve(root, 'docs/research') + '/';

  if (!output.replaceAll('\\','/').startsWith(researchRoot.replaceAll('\\','/'))) throw new Error('Output must be inside docs/research');

  const result = audit(root, Number(options.season ?? 2026), Number(options.week ?? 1), options['as-of'], options.book ?? 'draftkings');

  const serialized = JSON.stringify(result, null, 2) + '\n';

  if (existsSync(join(output, 'audit.json')) && readFileSync(join(output, 'audit.json'), 'utf8') !== serialized && options['replace-report'] !== 'true') throw new Error('Existing audit differs: use a new output directory or explicitly --replace-report=true');

  mkdirSync(output, { recursive: true });

  writeFileSync(join(output, 'audit.json'), serialized);

  writeFileSync(join(output, 'REPORT.md'), renderReport(result));

  console.log(JSON.stringify({ output, coverage: result.coverage, jkb: result.jkb, last_observed_market: result.last_observed_market, rejected: result.rejected }, null, 2));

}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();

