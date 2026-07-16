# JoeKnowsBall 2026 NFL Guide — Development Branch

This branch is the dedicated visual-development environment for the standalone JoeKnowsBall 2026 NFL season guide.

## Branch policy

- Branch: `chatgpt/nfl-team-dashboards-final`
- This branch is **not intended to be merged into `main`**.
- Experimental guide presentation, report layout, and data integrations may be developed here without changing the production NFL experience.
- The branch preview deployment is the primary review surface.

## Review routes

- `/nfl` — branch-only NFL Guide development home.
- `/nfl/guide` — live interactive guide and team-analysis experience.
- `/nfl-guide/` — printable report preview with a **Print / Save as PDF** action.

The printable route embeds the live guide. When guide pages or their supporting branch data are updated and the branch redeploys, the preview reflects those updates automatically.

## Preserved first copy

- `2026-nfl-guide-review-copy-01.html` — the original self-contained browser-reviewable first copy.

The first copy established the intended publication structure:

- league and futures overview
- all eight divisions
- all 32 teams
- model rank, 2025 record, market win total, and early stance
- team-improvement framing
- initial best-bets board

## Planned integrations

1. Official team logos stored locally.
2. Full two-page team previews.
3. JoeKnowsBall NFL v0.3 full-season and final-eight ratings.
4. VSiN-derived offensive and defensive statistical panels already present on this branch.
5. Warren Sharp schedule strength, net rest, opponent-preparation, and weekly rest-edge data already present on this branch.
6. Futures tables for win totals, divisions, conferences, Super Bowl, and Coach of the Year.
7. Schedule heat maps, team-comparison charts, and roster-movement graphics.
8. A repeatable export process after the editorial and data contracts are finalized.

## Important

Market prices, roster transactions, and projections are preseason snapshots and must be refreshed before any public release.
