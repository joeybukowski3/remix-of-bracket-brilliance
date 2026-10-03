# NFL AI handicap v2 (AI Picks v2, WU3)

The v2 handicap answers one question: "What do you think about this game and spread?" It replaces the 12-section article with a
250-450 word write-up plus a small structured record. It is additive: v1 snapshots, artifacts and runners are untouched and remain
readable. Both providers (Grok and ChatGPT) use the same contract.

## Pipeline

```
fresh context packet (WU1 teamForm, WU2 sanitized)  +  validated evidence  +  displayed market
        |
   STAGE A (market blind)  ->  fairSpread, projectedTotal, 3-5 keyDrivers, mainRisk, uncertainty        [validated, LOCKED]
        |
   STAGE B (sees market)   ->  verdict, preferredTeam, cover probabilities, confidence, keyNumberSensitivity,
                               counterargument, analysisMarkdown, factRefsUsed, evidenceRefsUsed        [validated]
        |
   record: + market numbers, derived fair score, key-number metadata, sources  ->  write-once JSON
```

Code: `scripts/lib/nfl-handicap-v2-{types,market,text,prompts,validator,record}.ts`, runner `scripts/run-nfl-handicap-v2.ts`,
provider transports `runGrokHandicapV2Stage` / `runChatGptHandicapV2Stage`. The prompts are ONE shared implementation; the only
provider-specific input is the `model` name in the JSON example.

## Research modes (site-only is the default)

`--research-mode=site-only|live` (one-game CLI and slate CLI; workflow input `research_mode`).

- **site-only (default)**: JKB/local deterministic data -> Stage A -> Stage B. No provider research pass, no web search, no
  `evidence.live-test.json` needed (the evidence set is empty, so every `evidenceRefs` / `evidenceRefsUsed` array is `[]`;
  `factRefs` carry the deterministic site facts). The football data, the market blindness of Stage A and the Stage B market block are
  unchanged. Two things differ in the prompt: the weather line is omitted (no local weather provider), and an `availability` block
  replaces it.
- **Availability (injuries)** comes only from the local feed `public/data/nfl/matchup-injuries.json`
  (`scripts/lib/nfl-handicap-v2-site-context.ts`). It is shown as CURRENT only when the packet does not flag it stale (not this
  season's data / historical / a lineup row flags it), it has a readable `generatedAt`, and it is at most 48 hours old; the freshness
  metadata is printed with it. Otherwise the block says UNAVAILABLE with the reason, and the model is told "If current injury data is
  unavailable or stale, do not make specific injury claims." There is no web-research fallback. Injury language in the write-up is
  then rejected by the unchanged validator rule; with a CURRENT feed it is accepted when the write-up cites an `availability.*`
  factRef (`localAvailabilityCurrent`).
- **live**: the original behavior -- a paid provider research pass collects normalized evidence that Stage A/B may cite (opt-in).
- **Provenance**: every new record stores `researchMode` ("site-only" | "live") and `promptVersion` `nfl-handicap-v2-prompts-2` (the
  information contract changed: short evidence aliases, site-only mode; the reasoning methodology did not). Both are internal --
  never published, never used for planning. Records written earlier (no `researchMode`, `promptVersion` `...-1`) stay readable and
  publishable; absence means "unknown", not either mode.
- **Planning (site-only)**: new game -> Stage A + B (no research); football-context change -> Stage A + B; market-only change ->
  Stage B alone against the locked Stage A; no change -> zero calls. Provider evidence is ignored (also in the failed-attempt input key).
  Scheduled and chained workflow runs are site-only unless the repository variable `NFL_AI_V2_RESEARCH_MODE` is `live`.

## Who decides what

The model decides the preferred side, both cover probabilities, the verdict (BET / LEAN / PASS), confidence, the counterargument
and the write-up. The engine only attaches mechanical fields: the market numbers, the fair score, the key-number metadata, the
sources, timestamps and the word count. There is no probability engine, no verdict cap and no edge threshold.

Validators reject contradictions; they never replace a judgment:
- percents in a credible range; sum <= 100; on a half-point line the two sum to 100; on a whole-number line the implied push is <= 15%;
- preferred >= other; BET/LEAN need preferred strictly > other; PASS with >= 70% for the preferred side is a contradiction;
- a preferred side that the model's OWN locked fair spread rates >= 2 points worse than the number, at >= 55% to cover, is rejected;
- the final read, the prose and the closing must name the same side and line as the structured fields (and an inverted team/line pairing is rejected);
- the fair-ish score and projected total lines must match the locked projection (fair score = round((total +/- margin) / 2), pure arithmetic on Stage A's two numbers).
A normal-model reference probability (sigma 13.5) exists only to WARN when the model's estimate is far from it; the estimate is kept.

## Write-up format (validated structurally, never on wording)

4-6 plain analytical paragraphs, then four consecutive bold final-read lines (preferred side and cover probability, other side,
fair-ish score, projected total), then a 1-2 paragraph closing recommendation. 210-520 words are accepted (250-450 is the target and
outside it only warns). Headings, lists, the retired article section names, "JKB", machine/schema language and postgame language are
rejected. A specific counterargument is required (generic boilerplate is rejected) and must be reflected in the prose.

## Key numbers

`nfl-handicap-v2-market.ts` computes arithmetic only: whether the line is on/near 3 or 7, which exact margins change between cover,
push and loss under a half-point move, and whether the book range straddles a key number. When that is MATERIAL the model must supply
`keyNumberSensitivity` explaining the betting significance; otherwise it may be null. The prompt says not to force the discussion.

## Evidence and sources

External research is fact input only. Records that are betting opinion (picks, predictions, best bets, public/sharp action, ATS
trends, consensus or model win probabilities) are excluded from Stage A and Stage B evidence sets
(`filterEvidenceRecordsForBlindStageA`, `filterEvidenceRecordsForStageBV2`). Stage A also excludes market-pricing evidence. Any
injury/availability language in the write-up requires `evidenceRefsUsed`. `factRefsUsed` are dot-paths into the football data and must
resolve on the blind packet. Sources are built mechanically from the cited evidence records (their url and name) plus two JKB-internal
entries with a null url; the model never authors a link.

## Storage and legacy compatibility

Records are write-once files under `data/nfl/analysis/<season>/<week>/<gameId>/<provider>/handicap-v2/`. They do not touch the v1
snapshot chain. NOT done in this work unit (later): writing v2 into the snapshot lifecycle, v2 update and market-only repricing modes,
the presentation exporter and UI for v2 records, and scheduling. Stage A `update` and Stage B `repricing` keep using the v1 paths.

### Game context is scratch state

The presentation exporter reads team identity and kickoff from `data/nfl/game-context/<season>/<week>/<gameId>.json`. That artifact is
reconstructable and is never committed (it is not in the persisted-state manifest), so a fresh CI checkout has none. The slate
executor therefore calls `ensureGameContextArtifact` immediately before it writes a presentation (a valid persisted artifact is used
as-is, otherwise it is rebuilt from the tracked upstream artifacts: free, no provider call, no research) and fails closed once kickoff
has passed. A failure there never reruns Stage A/B: the v2 record is already persisted, and the next run plans a free
`presentation_only` export.

## Running it

Dry run (free; builds and prints both prompts, runs the Stage A market-blindness audit, writes nothing):

    npx tsx scripts/run-nfl-handicap-v2.ts --provider=grok --game=2026_03_LAC_BUF
    npx tsx scripts/run-nfl-handicap-v2.ts --provider=chatgpt --game=2026_03_LAC_BUF

Live (two billed calls; site-only needs no evidence file; `--research-mode=live` needs the provider's real evidence at
`.../<provider>/evidence.live-test.json`; GROK_API_KEY/XAI_API_KEY or OPENAI_API_KEY):

    npx tsx scripts/run-nfl-handicap-v2.ts --provider=grok --game=2026_03_LAC_BUF --live
    npx tsx scripts/run-nfl-handicap-v2.ts --provider=chatgpt --game=2026_03_LAC_BUF --research-mode=live --live

## Publication and UI (presentation only)

`scripts/generate-nfl-ai-handicap-presentation.ts` publishes the newest valid write-once v2 record per provider as an optional
`handicapV2: { grokowski, chattyIce }` block in the existing public artifact (`nfl-ai-handicap-presentation-v1`, additive; v1 `handicappers`
are unchanged). A provider with no valid v2 record is `null` and the AI Picks tab falls back to its v1 card (legacy article or unavailable).
Public cards omit internal provenance (contextHash, promptVersion, fact/evidence refs, evidence ids, warnings). Source urls are copied from
the record only; sources without a url render as plain "JKB" text and are never linked. No handicapping logic is touched.

### What is and is not committed

- `public/data/nfl/<season>/ai-handicaps/<gameId>.json` is **committed static output**. There is no workflow or build step that generates it, and
  the repo has deployed such artifacts by committing them (`fix(nfl): deploy Week 2 AI sample artifacts`). The LAC @ BUF (2026 wk 3) artifact is the
  first that carries `handicapV2`, and ships in its own data commit, separate from the source commits.
- `data/nfl/analysis/<season>/<week>/<gameId>/**` (raw provider responses, research diagnostics, rejected findings, `evidence.live-test.json` and the
  write-once `handicap-v2/` records) is **local operational data, not committed**. The repo tracks only the foundation fixtures
  (`2026_01_BAL_IND/*/evidence.json`). The accepted LAC @ BUF output is preserved in the public artifact and in the test fixture
  `scripts/lib/__fixtures__/nfl-handicap-v2-live-lac-buf.json`; no committed test reads the local analysis or game-context directories.
- Follow-up: the scheduled refresh that runs the v2 handicap and the presentation exporter for upcoming games is not part of this change.
