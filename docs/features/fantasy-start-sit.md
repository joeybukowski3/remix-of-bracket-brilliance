# Fantasy Start/Sit

`/fantasy-football/start-sit` has two views: a browser-local, read-only Sleeper roster view and a general Compare Players tool. Compare Players needs no Sleeper connection. Neither view changes a Sleeper lineup or any JKB model output.

## Sources and boundaries

- Sleeper public API supplies the username/user ID, current-season league list, league rosters, league users, roster slots, scoring settings, player IDs, and player metadata. No API key or backend account is used.
- JKB `weekly-fantasy-projection-production-artifact-v2` supplies QB/RB/WR/TE projected **full PPR** points, positional ranks, opponent, and game context for the selected week. The page uses the same hook and week selector authority as Weekly Fantasy Rankings.
- JKB `weekly-fantasy-research-artifact-v1`, joined by the existing player ID utility, supplies season and last-five PPG, opponent FPA, usage evidence, and matchup edges. Existing presentation functions supply matchup grade and heatmap tones. Missing research displays N/A.
- Sleeper `gsis_id` is joined exactly to the projection artifact's `gsis:` ID. A fallback requires unique normalized name, position, and team, using the existing fantasy alias table and canonical NFL team-code aliases. Other players remain unmatched and visible in an audit list. Starter, reserve, and taxi IDs are retained in the owned-player pool even if Sleeper omits them from `players`.
- K, DEF, IDP, and other positions without published JKB weekly projections remain visible in the current roster. Their existing starters are retained in the optimal roster and excluded from projected totals. A published projection is required before optimization can score those slots.

## Lineup calculation

The optimizer uses the league's `roster_positions` and the user's owned players. It excludes Sleeper reserve and taxi IDs from new starting choices and maximizes the sum of published JKB projected points over supported slots with each player used at most once. Equal-score assignments prefer keeping current players in their Sleeper slots. FLEX accepts RB/WR/TE; SUPER_FLEX accepts QB/RB/WR/TE; REC_FLEX and WRRB_FLEX are also handled. Unsupported slots retain the Sleeper starter. If projected players cannot fill every supported slot, an eligible unprojected current starter or owned player fills the remaining slot without adding projected points. The summary counts players added to the lineup. Current and optimal roster headers repeat the respective projected totals.

Swap indicators compare the set of players leaving and entering the lineup, so moving a retained player between RB and FLEX does not create a false comparison. Entrants are paired with eligible departures, preferring the same natural position. A green upward arrow on an optimal entrant and red downward arrow on the displaced current starter appear only when the entrant projects **more than 10% higher**, with the lower projection as denominator. A lower-projected entrant is never marked as an upgrade.

Sleeper scoring settings are read for disclosure; projections are **not** recalculated for league scoring. Current and optimal totals omit unprojected players. Compare Players searches the full published QB/RB/WR/TE weekly projection pool and shows the numerical projection gap as its lean, with matchup and usage evidence alongside it.

## Research detail and Last 10

Start/Sit reuses `WeeklyFantasyPlayerDetail`, the existing weekly fantasy research detail with sample evidence, matchup and edge context, and projection components. EPA and Success Rate advantage read the published research artifact's `rankDifference` for every supported position and use the same favorable edge tone from `researchPresentation.ts`. The earlier Start/Sit UI suppressed both columns outside QB even though the artifact had values.

The detail also reuses `FantasyQbLast10` and its shared `NflLast10TablesSection` / `yardage-history.json` selectors. QB reads passing history, RB rushing history, and WR/TE receiving history. The shared passing slice supplies QB fantasy PPR points; rushing and receiving slices do not currently carry a complete fantasy PPR history column. The comparison view exposes one selected player's detail at a time. On mobile the existing fantasy detail accordions keep Player Last 10 and Opponent Last 10 usable without expanding four histories together.
