# NBA points projections: postgame evaluation protocol

How to score the private board's points projections against the captured sportsbook lines and the final box score, the same way every time. It measures; it does not tune. No model weight, projection or pregame file changes as a result of running it. Everything it reads and writes lives under the gitignored `data/nba/` and is private: the box score and projections come from hoopR/ESPN and the lines from The Odds API, both private-research only (see `docs/nba-props-v1.md` and `docs/nba-first-odds-capture.md`). Never commit, publish or share a report.

Code: `src/lib/nba/props/v1/postgameAudit.ts` (rules), `postgameAuditInputs.ts` (snapshot and box loading), `postgameAuditReport.ts` (markdown), `scripts/nba-postgame-audit.ts` (runner). Synthetic tests prove each rule below.

## 1. Freeze the pregame data before tipoff

Right after the line capture and the offline board rebuild, and before the game starts, copy these into a new folder `data/nba/postgame-audit/pregame/` (or one folder per game date) and never touch them again:

| File | What it is |
|---|---|
| `private-preview-board.json` | the board exactly as it displayed, with each player's baseline-v0 projection, minutes, displayed line and per-book line detail |
| `odds-captures/<capture>.json` | the write-once capture(s) behind the lines (read-only, content-hashed) |
| `board-inputs/projections.json` (and `roster.json`, `dvp.json`, `v1-report.json`) | the projections' inputs and the data cutoff they used |
| `player-games.json`, `positions-*.json`, `slate.json` | the history the model saw |
| `quota-observation.json`, `quota-ledger.json` | the quota state at capture time |

Then write `MANIFEST.sha256` (`sha256sum` format, `<hash> *<relative path>`, every file in the folder except the manifest):

```bash
cd data/nba/postgame-audit/pregame && find . -type f ! -name MANIFEST.sha256 | sed 's#^\./##' | sort | xargs sha256sum > MANIFEST.sha256
```

Record the manifest's own hash too (`sha256sum MANIFEST.sha256`, also printed by every audit run) somewhere outside the folder. The manifest sits inside the folder it protects, so on its own it only catches accidental change; passing the recorded hash back with `--manifest-sha256=` makes a rewritten manifest fail the run.

## 2. Get the final box score (after the game, no paid service)

The box score is the only postgame input. Use the repo's hoopR fetch into a separate folder so nothing pregame is overwritten (free GitHub download, three files, owner decision of 2026-10-23, private analysis only):

```bash
python -I scripts/nba-hoopr-fetch.py --confirm-owner-decision --out-dir data/nba/postgame-audit/raw/hoopr
```

Do not run `scripts/nba-hoopr-import.ts` or `nba-props-v1-build.ts` for the audit: those rebuild the board from newer data. The audit never does.

## 3. Run

```bash
npx tsx scripts/nba-postgame-audit.ts --game-key=2026-10-28\|DEN@NOP \
  --pregame-dir=data/nba/postgame-audit/pregame \
  --box=data/nba/postgame-audit/raw/hoopr/player_box_2027.json \
  --box-manifest=data/nba/postgame-audit/raw/hoopr/manifest.json [--manifest-sha256=<recorded hash>]
```

It writes `postgame-<game>.json` (canonical) and `.md` under `data/nba/postgame-audit/analysis/`, refusing any output folder inside the pregame snapshot or outside `data/nba/postgame-audit` (links and junctions are followed, so an alias cannot get around it, and the capture ledger and the board folder are off limits). Rerunning on the same snapshot and box score gives the same numbers. Every report carries a private marker that the containment check recognizes if a copy ever leaves `data/nba`.

## 4. What stops lookahead

The run is refused (`AuditLookaheadError`, or a manifest error) when:

- any pregame file changed, is missing, is a link, or is not in the manifest, or the manifest does not match a pinned hash;
- the board was built after tipoff, the model's input cutoff is after the board build, or a displayed line was captured after the board build or after tipoff;
- the box score was retrieved before tipoff, or is not a complete game (each team's minutes must be 240 plus 25 per overtime, within 2);
- the game is not on the board or not in the box score;
- any of those times is missing or is not a UTC instant: a comparison with an unreadable time is always false, so the guards parse strictly and refuse rather than pass. A played box-score row with no points or minutes is refused, never scored as zero.

The audit also re-derives each displayed line from the stored captures taken no later than the board build (later ones are ignored and the report says how many) using the current line rules, and warns if the result differs from what the board showed (the displayed line is still the one scored, because that is what was visible before tipoff). If the build recorded no model-input cutoff, the report warns that the check was not made.

## 5. Definitions

Error = projection (or line) minus actual, so a positive number is an over-prediction. Points only (`pts`) for now.

- **JKB error / MAE / bias.** Projected points minus actual points; MAE is the mean of the absolute errors, bias (mean signed error) the mean of the signed ones.
- **Line error / MAE / bias.** The displayed line (the consensus line the board showed) minus actual points. The line is the benchmark a projection has to beat; **JKB closer** counts players where |JKB error| < |line error|.
- **Minutes error.** Projected minutes minus actual minutes (MAE and bias).
- **Scoring rate.** Projected points per minute (projection / projected minutes) against actual points per minute.
- **Minutes effect and rate effect.** The points error splits exactly: minutes effect = (projected minutes - actual minutes) x projected rate; rate effect = actual minutes x (projected rate - actual rate). They sum to the points error, so a large rate effect means the model was wrong about how fast the player scores, a large minutes effect that it was wrong about how long they played.
- **Directional accuracy.** JKB's side is Over when projection > line and Under when below; the result is Over/Under against the line. A push (actual = line) or a projection exactly on the line has no direction and is left out of the count (the report prints hits/N).
- **Projection-minus-line bands.** Performance split by |projection - line|: under 1, 1 to 3, and 3 or more points.
- **Sportsbook comparison.** The displayed line is the modal main line across books, shown from one book with that book's own prices. The report lists each voting book's own line, prices and timestamps and every book kept out of the vote, so per-book accuracy can be computed without combining prices from different books.
- **Missing players.** A projected player who did not play (a did-not-play row) or has no box-score row is never an error; they are listed with their projected points and minutes. A player who played but whom the board gave no projected minutes is listed as unscorable with a warning, never silently dropped. The model is conditional on the player appearing (no availability feed), so these show how often that assumption failed, not how wrong the rate was.
- **Identity checks.** Each player's box-score id is compared with the id the pregame history holds for that name, and the team with the board's team; a mismatch is a warning, not a silent join.
- **Everyone who played.** MAE and bias for every projected player who played, line or not, plus projected versus actual team totals for points and minutes: a model-only check that does not depend on which players books posted.

## 6. Reading the result

- A sample under 30 scored players with lines is a description, not evidence, and the report says so. One game's errors are correlated (pace, game script, a shared shooting night), so 11 players are not 11 independent trials. Accumulate several games before reading a pattern.
- Observed evidence (the numbers, the identity and lookahead checks) and hypotheses (why) stay separate in anything written up. A hypothesis becomes a candidate change only if a pre-registered offline backtest supports it (`src/lib/nba/props/v1/validation/frozenPlan.ts` is the pattern); the baseline-v0 weights are never edited from a single audit.
- Report the bias of the line alongside JKB's: a low-scoring game moves both.
- Known limits: the board's build time and the box score's retrieval time are recorded by the tools that wrote them, not by an outside clock, so the lookahead guards prove internal consistency, not custody. Players are matched to the box score by normalized name (duplicates warn) and checked by id and team. hoopR's `game_date` is read as the Eastern date in the game key; that held for an 8:10 PM ET game but has not been checked for late West Coast starts. The stale-line rule counts a stale line's vote the same as a fresh one (the shown line is flagged). Votes in the line consensus are one per book, and a book is judged by its newest capture.

## 7. Keep private

Reports contain hoopR/ESPN-derived figures and sportsbook lines. They stay under `data/nba/` (gitignored and excluded from Vercel uploads); `node scripts/check-nba-data-containment.mjs` checks that nothing derived is tracked, committable or deployable. The audit makes no Odds API request, uses no quota and adds no scheduled job.
