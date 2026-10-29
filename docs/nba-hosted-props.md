# Public NBA props (`/nba/props` on joeknowsball.com)

Status 2026-10-29: **built, tested, not deployed, not configured.** `/nba/props` is a public page with no login. It loads a published snapshot by itself and shows the complete existing dashboard (PTS/REB/AST, JKB projections, season and per-minute stats, player and opponent L10 box scores, five-position DvP, logos and colors, Vegas lines with bookmakers and Over/Under prices, manual minutes adjustments). Visitors read one cached snapshot row; no page view can reach a sportsbook or stats provider.

## 1. What is allowed to be public, and why

The public path has its own gate (`hosted/hostingGate.ts`) that reads the license records at publish time and is at least as strict as the existing public board builder (`pipeline/boardBuild.ts`, unchanged). A property test checks every combination of recorded uses: the complete board is never returned for a grant the builder would refuse.

| Source | Recorded uses | Basis |
|---|---|---|
| hoopR/ESPN (`hoopr-espn`, origin `espn`) | `private-research`, `private-hosted`, `model-development`, `public-display`, `raw-redistribution` | **Owner statement, 2026-10-29 (owner-provided, final):** the owner states they have permission to publicly display the hoopR/ESPN-derived statistics, the JKB projections built from them and the per-game tables on JoeKnowsBall. It was recorded only after the earlier authorization was checked and found to cover private hosting only, and after the owner was asked directly. **No ESPN or SportsDataverse license, written permission or other document is on file and none is claimed.** `raw-redistribution` covers showing per-game rows in the dashboard's tables; it does not cover a feed, an API or a bulk download, which the board does not offer. |
| The Odds API | `private-research`, `private-hosted`, `model-development`, `public-display` | Owner decisions 2026-10-20 and 2026-10-29 on the provider's current terms (re-read 2026-10-29), including the owner's confirmation that the dashboard is public. The terms list displaying data in a website, including commercially; they forbid reselling or redistributing it as a standalone product, feed or API, so `raw-redistribution` stays absent and the endpoint is not offered as a data feed. |

Both hoopR/ESPN records carry the uses, because the effective right is the intersection with the ESPN origin record. Attribution to hoopR (CC BY 4.0) and ESPN is shown on the page.

**Tiers.** `full` needs the statistics source's `public-display`, `model-development`, `raw-redistribution` and `private-hosted`, and the line source's `public-display`. If any use is missing from either hoopR/ESPN record, or the Odds API record loses `public-display`, the gate falls back: statistics missing gives `lines-only` (lines and per-book detail, no projection, statistic, table or DvP); lines missing publishes nothing. The page states the limitation. Tests cover each case.

**Existing gates not bypassed.** `boardBuild.ts` is untouched and still decides what the static public board (`public/data/nba-props-board.json`) may contain. One local guard changed: `assertPrivatePreviewSource` no longer refuses a source that has public rights, because the rich dashboard can only come from the private-board builder and the publish-time gate now decides what is shown. It still requires `private-research` and refuses synthetic data. The static-board page still refuses any board that carries private-only fields.

## 2. Design

```
local:   data/nba/...  ->  existing builders (baseline-v0, unchanged)  ->  private-preview-board.json
           -> npm run nba:publish-snapshot       dry run: prints the public-display decision
           -> ... --write                         decideHosting(), allowlist projection, ONE upsert, read-back check
                                                  into Supabase table nba_board_snapshots (service role only)

visitor: GET /nba/props  (static app shell, no data)
           -> GET /api/nba/props-board   -> CDN (s-maxage 300) -> function -> in-memory (30 s) -> the one snapshot row
```

- **No authentication.** The login, password hash, session cookie and their environment variables were removed. The function is GET-only, takes no request input, and sets no cookie.
- **Provider calls are separate from page views.** The function reads the snapshot row and nothing else. It cannot call a provider: it has no key and no code for it, and a test fails if any hosted module mentions a provider URL, an API key name, a quota account or a probe. Odds API quota management, probe gates and the capture ledger are untouched, and no recurring job or workflow was added.
- **Caching.** Success: `public, max-age=60, s-maxage=300, stale-while-revalidate=600`. A new snapshot is visible within about five minutes of publishing. Errors and the empty state are `no-store`. Each function instance also reuses its read of the row for 30 seconds, so a burst of page views is one database read.
- **Storage stays closed.** The page is public; the table is not. `supabase/migrations/20261029_nba_board_snapshots.sql`: RLS on, no policy, `anon` and `authenticated` revoked. The browser's anon key can neither read nor write it. Visitors get the snapshot only through the function, which re-applies the tier on every read.
- **Secrets and sources stay out.** The function reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `process.env` and never returns them; error bodies are fixed and logs carry no request data. Raw captures, the player-game import and the local board file stay under the git-ignored `data/nba/`. No data, key or token is in `dist/` or `public/` (build, postbuild scan and a content search for real-board names and timestamps).
- **Freshness.** The page shows published, statistics-retrieved and newest-sportsbook-line timestamps, computed when the page loads. **STALE ODDS** appears when the newest line is more than 3 hours old; **STALE DATA** when the snapshot was published more than 12 hours ago (`hostedClient.ts`). The existing per-line freshness chips are unchanged.
- **Manual updates only.** Publishing is a local command. Nothing schedules it.
- **Single function.** `api/nba/props-board.ts` (GET). Helpers and tests live in `api/_lib/nbaBoard/` because Vercel deploys every other file under `api/`. The function imports only `hosted/redact.ts` from `src/lib/nba`; `isolation.test.ts` fails otherwise.
- **Unchanged.** baseline-v0, the V1 builders, positions and DvP logic, the dashboard components and layout. The page keeps `noindex` as before.

## 3. Verification (2026-10-29)

| What | Result |
|---|---|
| Dashboard loads with no authentication: no form, password field, cookie, credential or non-GET request (Chromium and Firefox) | pass |
| The real 978-entry board through the publish plan, store and public GET, under the real records: tier `full`, 978/978 entries identical, 978 projections and season stats with recent games, 11 lines with 11 per-book details, 621 positions, 900 DvP rows, 120 opponent sequences, 24 opponent box-score groups, no private notice; 1.54 MB (Vercel limit 4.5 MB) | pass (local run, not committed) |
| Same pathway on a synthetic 978-entry board, and when a statistics record is narrowed (lines only) | pass (committed test) |
| Gate: every combination of recorded uses; dropping any single use; either record narrowed; Odds `public-display` missing | pass |
| Restricted fields stay out of public responses: tier re-applied on read, private notice dropped, malformed rows refused, errors leak nothing | pass |
| Caching headers, memory window, new snapshot visible after it, errors never cached | pass |
| Real board in a browser as an anonymous visitor on desktop and a 390px phone, Chromium and Firefox: board, PTS/REB/AST, detail, L5/L10, opponent L10, DvP tab, Vegas Line, minutes override with adjusted comparison, stale-odds banner | pass, no page errors |
| Synthetic layout at 320, 390, 768, 1280 and 1440px, both tiers, no sideways page scroll; fresh, stale-odds and stale-data states; empty and error states with no login | pass |
| Production build, `check-nba-data-containment` (git tracked, public, dist), source maps, secret names and real-board content in `dist/` | pass |

Not run: Safari/WebKit (not installed here).

## 4. Remaining setup, and the first complete snapshot

Each step needs your approval and none has been done. Do not commit any value below.

### Supabase (the existing project behind `SUPABASE_URL`)
1. **SQL editor:** paste the contents of `supabase/migrations/20261029_nba_board_snapshots.sql` and run it. (Do not run `supabase db push` unless you have checked it applies only this file.)
2. **Check:** Table editor shows `nba_board_snapshots` with RLS **enabled** and no policies. Optionally: `curl -s -H "apikey: <anon key>" "<SUPABASE_URL>/rest/v1/nba_board_snapshots?select=id"` returns `[]` or a permission error, never a row.

### Vercel
3. **Environment variables:** none are new. Confirm `SUPABASE_URL` (or `VITE_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` exist in the **Production** scope (the bracket functions already use them).
4. **Firewall (recommended):** a rate-limit rule for path `/api/nba/props-board` (for example 60 requests per minute per IP). The page is public and the endpoint is cached, but a limit protects the function from scraping.
5. **Function count:** this is the 12th function under `api/` (the historical Hobby plan cap); check the deployment log if you are on Hobby.
6. **Merge and deploy** when you approve. Until a snapshot is published, `/nba/props` shows "No NBA props snapshot has been published yet."

### Publish the first complete snapshot (local, after step 1)
7. **Build the board** with the existing pipeline in a checkout of this branch that holds `data/nba/` (today the data is under `C:\tmp\jkb-nba-vegas-line`, whose code predates per-book line detail; copy `data/nba/` into the checkout, since it is git-ignored). Refresh the slate and inputs per `docs/nba-props-v1.md`, then `npx tsx scripts/nba-props-v1-build.ts --private-preview`. Lines come from stored Odds API captures only. **A current Vegas Line needs a new capture, which needs its own authorization and the existing quota approvals; none was made.** Without one the board has no lines and the page says "none on this board".
8. **Dry run:** `npm run nba:publish-snapshot` (add `-- --board=<path>` for another file). Expect `CLEARED` for both sources and `Public tier full`, plus the entry and DvP counts. Heed any staleness warning.
9. **Credentials file** `.env.nba-publish.local` in the repo root (ignored through the `*.local` rule): `SUPABASE_URL=...`, `SUPABASE_SERVICE_ROLE_KEY=...`, `JKB_NBA_HOSTED_PUBLISH_APPROVED=1`.
10. **Publish:** `npx tsx --env-file=.env.nba-publish.local scripts/nba-snapshot-publish.ts --write`. It uploads one row, reads it back and prints `Uploaded and verified 1 snapshot row (full, N entries, ...)`. **Everything in it becomes public.**
11. **Check** `https://www.joeknowsball.com/nba/props` within about five minutes (the CDN window), on a phone as well.

A smoke test that needs no new data: publish the existing board first. It will carry the **STALE ODDS** banner (its lines are from 2026-10-28), which proves the whole path and the indicator before the first fresh publish. To take the page down, publish nothing further and delete the row (`delete from nba_board_snapshots;`), or narrow the records and republish.

Refreshing later is steps 7 to 10. Automatic refresh is not built and needs its own authorization.

## 5. Not covered
Safari/WebKit (not installed here) and the unrelated, pre-existing `tsc -p tsconfig.app.json` failures in `src/lib/mlb/mlbPitcherRegression.ts` and `pipeline/contracts.ts`.
