# Hosted private NBA props (`/nba/props` on joeknowsball.com)

Status 2026-10-29: **built, tested, not deployed, not configured.** The mechanism is complete and fails closed. Today it can host **sportsbook lines only** (11 DEN/NOP props from the one authorized capture), under the owner's 2026-10-29 acceptance of The Odds API's terms; the projections, season statistics, last-10 tables and Defense vs. Position cannot be hosted until their source is cleared (hoopR/ESPN is not; BALLDONTLIE is being evaluated, see `nba-balldontlie-evaluation.md`). This is an engineering assessment, not legal advice.

## 1. What was inspected

| Question | Evidence | Result |
|---|---|---|
| Where does production run? | `curl -I https://www.joeknowsball.com/` on 2026-10-29 returns `Server: Vercel` and an `X-Vercel-Id`. | Vercel serves the site, which is the evidence `docs/DECISIONS.md` OPEN-001 asks for. This document does not close OPEN-001; the GitHub Pages workflow still exists and a static host could not run this feature. |
| Is there user authentication? | None. `api/_lib/auth.ts` is a shared-secret check for bracket sync (and accepts `?token=`, which this feature deliberately does not reuse). `src/integrations/supabase` is a browser client with no sign-in flow. | New owner-only gate needed. |
| Is the data already public? | `GET /data/nba-props-board.json` on production returns the HTML app shell, so nothing is published. The repository is public, so no data can be committed. | Data must be served from a server-side store, never from `public/`, `dist/` or git. |
| Existing server-side storage | `api/_lib/supabase.ts` already uses `SUPABASE_SERVICE_ROLE_KEY` server-side (bracket data). | One new table, same credential, no new vendor. |
| Existing containment | `scripts/lib/nba-data-containment.mjs`, `.vercelignore`, the postbuild `--deployable=dist` scan, `isolation.test.ts`. | Kept and extended; all still pass. |
| Merged pipelines | PR #444 (compact table) and #445 (private Vegas Line, postgame audit). The board artifact is `data/nba/props-v1/private-preview-board.json` (1.5 MB, 978 entries, gitignored). | Reused unchanged; the model and the dashboard layout are untouched. |

## 2. Rights: what may be hosted

Logging in does not change what a source permits. Hosting copies the data onto third-party servers (Supabase, Vercel), which is a different act from the owner's local `private-research` use. Each data class, by source:

| Data on the board | Source | Recorded uses | May be hosted behind the owner login? |
|---|---|---|---|
| Sportsbook line, price and per-book detail | The Odds API captures | `private-research`, `private-hosted`, `model-development`, `public-display` (owner decisions 2026-10-20 and 2026-10-29; `raw-redistribution` absent) | **Yes, as lines.** The owner accepted the provider's current terms for displaying captured lines in the dashboard, subject to their restrictions: no resale, repackaging or redistribution as a standalone data product, feed or API. The hosted board keeps each line's bookmaker and capture time and every book's provider timestamp (tests assert it), and nothing in it calls the provider or touches quota. |
| JKB projection, minutes, season stats, last-5/last-10, opponent box scores, DvP, roster position estimates | hoopR/ESPN (`hoopr-espn`, origin `espn`) | `private-research` only (owner decision 2026-10-23, "NOT ESPN's permission"; effective rights are capped by the ESPN record) | **No.** Raw per-game rows and every derived value are from this source. Disney Terms of Use 2.A allow personal, noncommercial use; 2.B.viii and 3.H bar commercial use. The registry says "local and private analysis", and it explicitly leaves `public-display` and `raw-redistribution` closed. `private-research` does not extend to a copy on a third-party host. |
| Team names, logos, tip-off times | Odds API event / existing site assets | n/a | Names and times travel with the lines. Logos are existing site assets, not data. |

A data use, `private-hosted`, exists in the license vocabulary (`sources/types.ts`). **Only the Odds API record grants it** (owner decision 2026-10-29). hoopR/ESPN stay `private-research`, and no statistics source records `private-hosted` (a test asserts it). The gate needs the explicit use for lines too; `private-research` plus `public-display` no longer stands in for it.

### Smallest way to unblock the ESPN-derived data (any one)

1. **Owner decision plus accepted risk:** record `private-hosted` on both `espn` and `hoopr-espn` in `licenses.ts` with a dated basis. It is the owner's decision to host a private copy; it is not ESPN's permission and leaves the commercial-site risk in `nba-espn-upstream-rights-review.md` open. Both records are needed because the origin cap applies.
2. **Written permission** from SportsDataverse (documenting what ESPN allowed them) or from ESPN/Disney, as already listed in the rights review. hoopR-nba-data issue 24 has no reply.
3. **Replace the source for the rows that matter.** BALLDONTLIE ALL-STAR ($9.99/month) is already assessed: its terms permit analytics, wagering products and ML use and forbid only reselling raw data. That needs a subscription, a recorded license decision, and an adapter feeding the existing `NbaPlayerGame` schema. It is the only option that removes the ESPN question instead of accepting it.

Until one happens, those fields stay on the owner's computer and the existing local `?private=1` picker keeps working in development.

## 3. Design

```
local:   private-preview-board.json
           -> scripts/nba-private-snapshot-publish.ts   (dry run by default)
                decideHosting()  reads the license records
                buildEnvelope()  allowlist projection to the cleared tier
           -> ONE upsert into Supabase table nba_private_snapshots  (service role)

browser: /nba/props  (public app shell, contains no data)
           GET /api/nba/props-board  --cookie--> 401 -> sign-in form
                                                 200 -> board (tier, publishedAtUtc, board)
```

- **Tiers.** `lines-only` keeps entries that have a line, with line and per-book detail (bookmaker, prices, capture and provider timestamps, freshness, excluded-book notes); everything else is rebuilt as null or empty, not copied. `full` keeps the whole private board and needs `private-hosted` on the statistics source (effective, including origins) and on the line source. Unknown source ids, no line source, or no statistics source fail closed (no tier, or lines-only).
- **Allowlists on both sides.** The publish script projects the board to its tier before upload. The function re-projects on every read (`serveableEnvelope`), so a tampered or stale row cannot serve more than its tier. The function imports only `hosted/redact.ts` (type-only imports otherwise); `isolation.test.ts` fails if API code imports any other NBA module, so no model, ingest or license code is in the function bundle.
- **Auth.** One owner, one passphrase (16+ characters) stored only as an scrypt hash (`NBA_PRIVATE_PASSWORD_HASH`). Sign-in sets `__Host-jkb-nba`: HMAC-SHA256 signed with `NBA_PRIVATE_SESSION_SECRET` (32+ characters), `HttpOnly; Secure; SameSite=Strict; Path=/`, host-only, 7-day expiry. Missing or weak configuration answers 503 to everyone. Sign-in and sign-out require a same-origin request. To end every session at once (lost device, shared computer), rotate `NBA_PRIVATE_SESSION_SECRET` and redeploy; to change the passphrase, replace the hash. Failed sign-ins are limited to 5 per 15 minutes per client IP per function instance; instances do not share memory, so also add a Vercel Firewall rate-limit rule on `/api/nba/props-board` (not something this PR can configure).
- **Storage.** `supabase/migrations/20261029_nba_private_snapshots.sql`: RLS enabled, no policy, `anon` and `authenticated` revoked. The anon key in the browser bundle can neither read nor write. **The migration is included but not applied.**
- **Caching.** Every API response, errors included, carries `Cache-Control: private, no-store, max-age=0`, `Vary: Cookie, Origin`, `X-Robots-Tag: noindex, nofollow`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`. `vercel.json` is untouched (production-sensitive). The client fetches with `cache: "no-store"` and keeps nothing in `localStorage`.
- **No secrets in assets.** The browser code contains no key or token. Verified on a production build: 0 source maps, and none of `NBA_PRIVATE`, `SERVICE_ROLE`, `scrypt`, `nba_private_snapshots` appear in `dist/`; the postbuild containment scan passes.
- **Single function.** One new serverless function (`api/nba/props-board.ts`, GET/POST/DELETE). Helpers and tests live under `api/_lib/` because Vercel deploys every other file under `api/`. If the Vercel plan limits the function count, confirm headroom before deploying.
- **Page behavior.** A public board, if one is ever published, is still tried first and unchanged. Otherwise the page asks the API: 401 shows the sign-in form; 200 shows the board with its notice and a Sign out link; 404/503/network or non-JSON (for example the dev server or GitHub Pages) shows the existing empty state.
- **Preserved.** PTS/REB/AST, last-10 tables, DvP, minutes override and sportsbook comparison are the same components; a `full` snapshot renders all of them, and a `lines-only` snapshot renders the lines with `N/A` projections (verified in a browser with the real 11-prop board).
- **No live requests, no schedule.** Nothing here calls The Odds API, ESPN or any provider; there is no cron or workflow. Refreshing the hosted board is a manual publish.

## 4. Tests

| Concern | Where |
|---|---|
| Unauthorized access: no cookie, garbage, wrong-secret, tampered payload, wrong cookie name, expired; store never read | `api/_lib/nbaPrivate/handlers.test.ts` |
| Fail closed when env is missing, weak or the hash is not scrypt (valid cookie still gets 503) | same |
| Data containment: tier re-applied on read, unknown fields dropped, malformed or foreign rows refused, no stack or credential text in errors, no secret in any response | same, `src/lib/nba/props/hosted/hosted.test.ts` |
| Caching and indexing headers on 200, 401, 404 and error responses | same |
| Cookie flags, same-origin enforcement, body limits, rate limit and reset | same |
| License gate against the real records (today: lines-only; ESPN blocked; no real record grants `private-hosted`; public-display is not a substitute for statistics) | `hosted.test.ts` |
| Migration has RLS, no policy, no grants | `handlers.test.ts` |
| Browser client states; sign-in form; sign-in, sign-out and lines-only render in a real browser | `hostedClient.test.ts`, `PrivateAccess.test.tsx`, `tests/nba-private-hosted.spec.ts` |
| NBA code stays out of the app and out of the function bundle | `isolation.test.ts` |

## 5. Operating it (each step needs the owner's approval; none was taken)

1. Decide the rights question in section 2 (or accept lines-only for now).
2. Apply `supabase/migrations/20261029_nba_private_snapshots.sql` to the project.
3. Create a passphrase and secrets locally, without putting them in a command line or history: `node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))"` for the session secret; `npx tsx scripts/nba-private-hash-passphrase.ts < file` for the hash (the passphrase is read from stdin).
4. Add `NBA_PRIVATE_PASSWORD_HASH` and `NBA_PRIVATE_SESSION_SECRET` to the Vercel **Production** scope only (not Preview, so preview URLs stay at 503). Confirm `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` already exist there.
5. Add a Firewall rate-limit rule for `/api/nba/props-board`.
6. Review and merge the PR; deploy.
7. `npx tsx scripts/nba-private-snapshot-publish.ts` (dry run: prints the decision and counts), then `JKB_NBA_HOSTED_PUBLISH_APPROVED=1 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/nba-private-snapshot-publish.ts --write`.

## 6. What remains for a populated hosted dashboard

1. **Rights decision for hoopR/ESPN-derived data** (section 2): without it the hosted board stays lines-only (11 props today, no projections, stats, last-10 or DvP).
2. **Statistics source:** BALLDONTLIE ALL-STAR is the candidate; see `nba-balldontlie-evaluation.md` for coverage, gaps and the next step. The hoopR/ESPN records are unchanged.
3. **Infrastructure and secrets:** the migration, the two environment variables, the Firewall rule, and deployment approval (section 5).
4. **A fresh private board** built locally with the existing builders; the hosted snapshot is only as current as the last manual publish.
5. **Optional:** an authorization to automate refreshes. Not requested and not built.

Superseded item: the earlier "confirm the lines reading" step is closed by the owner's 2026-10-29 decision, now recorded in `oddsSources.ts`.

Pre-existing, unrelated: `tsc -p tsconfig.app.json` fails on a syntax error in `src/lib/mlb/mlbPitcherRegression.ts` and reports type errors in `pipeline/contracts.ts`; neither file was touched.
