# Hosted private NBA props (`/nba/props` on joeknowsball.com)

Status 2026-10-29: **built, tested, not deployed, not configured.** The full existing dashboard (projections, season and per-minute stats, L5/L10 and box scores, opponent L10, five-position DvP, logos and colors, minutes adjustments, Vegas Line and per-book detail, JKB - Line and adjusted comparisons) loads automatically for the signed-in owner at `/nba/props`, from a snapshot published from the local research pipeline. Nothing is public: the board is served only by an authenticated function.

## 1. Rights basis (as recorded, no more)

| Source | Recorded uses | Basis |
|---|---|---|
| hoopR/ESPN (`hoopr-espn`, origin `espn`) | `private-research`, **`private-hosted`** | **Owner-provided authorization, 2026-10-29:** the owner states they have permission to use the existing hoopR/ESPN-derived NBA statistics for their JoeKnowsBall hosted dashboard. No ESPN or SportsDataverse license, written permission or other document is on file and none is claimed. `model-development`, `public-display` and `raw-redistribution` stay unrecorded. |
| The Odds API | `private-research`, `private-hosted`, `model-development`, `public-display` | Owner decisions 2026-10-20 and 2026-10-29 on the provider's current terms (re-read 2026-10-29); no reselling or redistribution as a standalone product, feed or API, so `raw-redistribution` stays absent. |

`private-hosted` means: stored on the owner's Supabase project and served by the owner's Vercel deployment to the authenticated owner alone. It is not publication. Both hoopR/ESPN records carry it because the effective right is capped by the origin record. Attribution to hoopR (CC BY 4.0) and ESPN as the upstream source stays on the board.

The hosting gate (`hosted/hostingGate.ts`) reads these records at publish time and fails closed: it needs `private-hosted` on the line source and on the effective statistics source, otherwise it publishes lines only, or nothing. Tests pin the records, so any widening shows up in review.

## 2. Design

```
local:   data/nba/...  ->  existing builders  ->  private-preview-board.json
           -> scripts/nba-private-snapshot-publish.ts   (dry run by default)
                decideHosting()   license records -> tier (full | lines-only | none)
                buildEnvelope()   allowlist projection to the tier
           -> ONE upsert into Supabase table nba_private_snapshots (service role), then a read-back check

browser: /nba/props  (public app shell, contains no data)
           GET /api/nba/props-board  --session cookie-->  401 -> sign-in form
                                                          200 -> { tier, publishedAtUtc, board }
```

- **Unchanged:** baseline-v0 and the V1 builders, weights, positions and DvP logic, and the dashboard components. The hosted board is the builder's own artifact, passed through.
- **Tiers.** `full` keeps the whole private board (every entry, season stat with recent games, opponent tables, DvP rows, lines and per-book detail); only unknown top-level fields are dropped, and the builder's local notice ("do not publish, share or deploy") is replaced by the hosted notice. `lines-only` is the fallback if a statistics grant is ever withdrawn. Applied at publish and again on every read, so a tampered row cannot serve more than its tier.
- **Auth.** One owner passphrase (16+ characters) stored only as an scrypt hash. Sign-in sets `__Host-jkb-nba`: HMAC-signed, `HttpOnly; Secure; SameSite=Strict`, host-only, 7 days. Missing or weak configuration answers 503 to everyone. Sign-in and sign-out require a same-origin request. Failed sign-ins: 5 per 15 minutes per client IP per function instance (instances do not share memory; add the Firewall rule below). To end every session, rotate `NBA_PRIVATE_SESSION_SECRET` and redeploy.
- **Storage.** `supabase/migrations/20261029_nba_private_snapshots.sql`: RLS on, no policy, `anon` and `authenticated` revoked. The anon key in the browser bundle can neither read nor write.
- **Caching.** Every API response is `private, no-store, max-age=0`, `Vary: Cookie, Origin`, noindex, nosniff, no-referrer. The client fetches with `cache: "no-store"` and stores nothing. `vercel.json` is untouched.
- **Stale-data indicator.** The page shows three source timestamps (published, statistics retrieved, newest sportsbook line) and a prominent `STALE SNAPSHOT` banner when the snapshot was published more than 12 hours ago or the newest line was captured more than 3 hours ago. It is computed when the page loads, not when the board was built, so it cannot go out of date (`hostedClient.ts`: `SNAPSHOT_STALE_AFTER_HOURS`, `LINES_STALE_AFTER_HOURS`). The existing per-line freshness chips are unchanged. The publish script prints the same warnings before it uploads.
- **Odds API protections retained.** The hosted code makes no provider request and touches no quota account or credential (a test fails if any hosted module mentions the provider URL, an API key name, a quota account or a probe). Captured lines keep bookmaker, capture time and the provider's own update time byte for byte (tests). Quota management, probe gates and the capture ledger are untouched.
- **Single function.** `api/nba/props-board.ts` (GET, POST, DELETE). Helpers and tests live in `api/_lib/nbaPrivate/` because Vercel deploys every other file under `api/`. The function imports only `hosted/redact.ts` from `src/lib/nba`; `isolation.test.ts` fails otherwise.
- **Not in static assets.** No data, key or token is in `dist/` or `public/`; the postbuild scan (`check-nba-data-containment.mjs --deployable=dist`) and the git-scope scan pass.

## 3. Tests and verification (2026-10-29)

| What | Where | Result |
|---|---|---|
| 978-entry board through plan, store, authorization and serialization: entries, DvP, opponent tables, sources identical; 401 leaks nothing; no-store headers | `api/_lib/nbaPrivate/fullBoard.test.ts` | pass |
| Same pathway on the real private board (rebuilt with the current builder, local only): 978/978 identical, 978 projections and season stats with recent games, 11 lines with 11 per-book details, 621 positions, 900 DvP rows, 120 opponent sequences, 24 opponent box-score groups; response 1.54 MB (Vercel limit 4.5 MB) | local run, not committed | pass |
| Unauthorized: no cookie, garbage, wrong secret, tampered payload, wrong name, expired, missing or weak configuration (503), cross-origin, oversize, rate limit | `handlers.test.ts` | pass |
| Gate and tiers against the real records; notices; Odds conditions | `hosted/hosted.test.ts` | pass |
| Stale and fresh indicator | `hostedClient.test.ts`, `SnapshotStatus.test.tsx`, `tests/nba-private-hosted.spec.ts` | pass |
| Browser: sign-in gate, full board with Vegas Line, JKB - Line, L5/L10, opponent L10, DvP tab, minutes override with adjusted comparison (no request, nothing stored) | `tests/nba-private-hosted.spec.ts` | pass |
| Real full board in a browser (logos, colors, stats, DvP, lines, override, charts) | local run | no page errors |
| Build, containment, no private data in `dist/` | `npm run build`, `check-nba-data-containment.mjs` | pass |

## 4. Configure Supabase and Vercel, and publish the first snapshot

Each step is yours to approve and run; none has been done. Do not commit any value below.

### Supabase (existing project, the one behind `SUPABASE_URL`)
1. **SQL editor:** paste the contents of `supabase/migrations/20261029_nba_private_snapshots.sql` and run it. (Do not run `supabase db push` unless you have checked it will apply only this file.)
2. **Check:** Table editor shows `nba_private_snapshots` with RLS **enabled** and no policies. Optionally confirm the anon key is refused: `curl -s -H "apikey: <anon key>" "<SUPABASE_URL>/rest/v1/nba_private_snapshots?select=id"` returns `[]` or a permission error, never a row.
3. **Credentials for publishing:** the project URL and the `service_role` key (Project Settings, API). They are the same values the bracket functions already use in Vercel.

### Vercel (Project Settings, Environment Variables, **Production** scope only)
4. Generate the session secret: `node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))"` and add it as `NBA_PRIVATE_SESSION_SECRET`.
5. Choose a passphrase of 16+ characters and hash it without putting it in history: in Git Bash, `read -rs P; printf %s "$P" | npx tsx scripts/nba-private-hash-passphrase.ts`. Add the printed `scrypt$...$...` value as `NBA_PRIVATE_PASSWORD_HASH`. It contains `$`: paste it into the dashboard as is, and single-quote it anywhere a shell reads it. Keep the passphrase in your password manager.
6. Confirm `SUPABASE_URL` (or `VITE_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` exist for Production.
7. **Firewall:** add a rate-limit rule for path `/api/nba/props-board` (for example 10 requests per minute per IP).
8. **Function count:** the new function is the 12th under `api/` (the historical Hobby plan cap); check the deployment log if you are on Hobby.
9. Review the PR, then merge and deploy when you decide. Preview deployments have no private variables on purpose and answer 503; add the two variables to the Preview scope temporarily if you want to test before merging.

### Publish the first snapshot (local)
10. **Build the board** with the existing pipeline in the checkout that holds `data/nba/` (today `C:\tmp\jkb-nba-vegas-line`, whose code predates per-book line detail; use a checkout of this branch, copying `data/nba/` into it, since it is gitignored). Refresh the slate and inputs per `docs/nba-props-v1.md`, then `npx tsx scripts/nba-props-v1-build.ts --private-preview`. Lines come from stored Odds API captures only; **new captures need a separately authorized live request, and none was made.** Without a current capture the board has no Vegas Line and the page says "none on this board".
11. **Dry run:** `npm run nba:publish-snapshot` (or add `-- --board=<path>`). Expect `CLEARED` for both sources, `Tier full`, and the entry and DvP counts. Heed the staleness warnings.
12. **Credentials file** `.env.nba-publish.local` in the repo root (ignored by Git through the `*.local` rule): `SUPABASE_URL=...`, `SUPABASE_SERVICE_ROLE_KEY=...`, `JKB_NBA_HOSTED_PUBLISH_APPROVED=1`.
13. **Publish:** `npx tsx --env-file=.env.nba-publish.local scripts/nba-private-snapshot-publish.ts --write`. It uploads one row, reads it back and prints `Uploaded and verified 1 snapshot row (full, N entries, ...)`.
14. **Open** `https://www.joeknowsball.com/nba/props`, sign in, and check the timestamps strip. Sign out ends the session; a page without the cookie shows only the sign-in form.

A smoke test that needs no new data: publish the existing board first. It will show the `STALE SNAPSHOT` banner (its lines are from 2026-10-28), which proves the whole path and the indicator before the first fresh publish.

Refreshing later is the same steps 10 to 13; automatic refresh is not built and needs its own authorization.

## 5. Not covered
Public access to any of this (not enabled), new provider requests (none made), and the unrelated pre-existing `tsc -p tsconfig.app.json` failures in `src/lib/mlb/mlbPitcherRegression.ts` and `pipeline/contracts.ts`.
