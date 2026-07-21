# NFL offseason evidence contract

This contract normalizes source-backed 2026 NFL offseason evidence for all 32 teams. It is intentionally factual: it records personnel and coaching evidence, source provenance, coverage gaps, warnings, and confidence. It does not produce an improvement score, decline score, win projection, betting edge, or team-quality grade.

## Current sources

- `public/data/nfl/teams.json` — canonical team IDs, slugs, abbreviations, and display names.
- `src/data/nflWarrenSharpTeams2026.ts` — primary structured coaching, key additions, key departures, draft additions, and positional context from the Warren Sharp 2026 Football Preview.
- `src/data/nflOffseason2026.ts` — repository-maintained manual snapshot of head-coach status and notable player movement, verified through `2026-06-23`.
- `src/data/nflWarrenSharpAdvanced2026.ts` — projected 2026 starting quarterback table and team health-by-unit context from Warren Sharp advanced tables.
- `src/data/nflVsinGuide2026.json` and `src/data/nflWarrenSharpSchedule2026.json` — audited for provenance and coverage context, but not used as player/coaching evidence because they do not contain structured offseason personnel facts.

## Known completeness limitations

- No complete roster transaction log is currently checked in.
- Player-level returning-production and player-level injury-return lists are not available.
- Warren Sharp source dates are not encoded in the repository data; source pages are preserved, but freshness is recorded as unknown.
- VSiN and schedule data provide useful team context, not personnel evidence items.
- Quarterback continuity is derived only from the checked-in projected-QB table plus bundled addition/departure evidence.

## Confidence

Confidence measures evidence completeness and provenance only. It is not a football-quality grade.

- Missing quarterback continuity, coaching coverage, additions coverage, or departures coverage lowers confidence.
- Missing source dates lower confidence.
- Missing returning-player and injury-return coverage is recorded explicitly rather than counted as neutral.
- Unresolved conflicts lower confidence.

## Evidence and provenance

Every personnel and coaching item preserves:

- source ID and name
- source type
- source path
- source date when available
- source page when available
- verification status

When multiple sources support the same fact, the contract merges the item and preserves all supporting sources.

## Conflict handling

The validation layer does not silently resolve contradictions. It reports:

- player listed as both addition and departure for the same team
- player listed as returning and departing
- duplicate addition/departure kinds for the same player
- coach listed as both returning and new for the same role
- multiple head coaches without an explicit transition
- duplicate team records or duplicate evidence IDs

## Adding future sources

Future sources should be added through pure adapters in `src/lib/nfl/offseasonEvidence.ts` or a sibling module. New adapters should:

- join by canonical team ID or abbreviation only
- preserve source path, date, page, and verification status
- avoid fuzzy team matching
- avoid inferred player positions or starter status unless the source explicitly supports it
- keep rookies unproven by default
- keep new coaches neutral by default
- update tests for source coverage, conflicts, and confidence behavior
