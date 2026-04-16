# PGA Tournament System

Weekly PGA rollout is now file-driven.

## Add a New Tournament

1. Copy [tournament-template.ts](/C:/Users/jbloo/remix-of-bracket-brilliance/src/data/pga/tournaments/tournament-template.ts:1) to a new file in `src/data/pga/tournaments/`.
2. Fill in the tournament config:
   - `hero`
   - `seo`
   - `model`
   - `picksPage`
3. Add the player JSON file under `public/data/pga/`.
4. Register the tournament in [tournaments.ts](/C:/Users/jbloo/remix-of-bracket-brilliance/src/lib/pga/tournaments.ts:1).
5. Open:
   - `/pga/<slug>`
   - `/pga/<slug>/model`
   - `/pga/<slug>/model/table`

## Where the Model Gets Its Data

- Each tournament config points at `model.dataPath`
- [usePgaTournamentPlayers.ts](/C:/Users/jbloo/remix-of-bracket-brilliance/src/hooks/usePgaTournamentPlayers.ts:1) loads that JSON
- [modelEngine.ts](/C:/Users/jbloo/remix-of-bracket-brilliance/src/lib/pga/modelEngine.ts:1) normalizes and ranks the field

## How Presets Are Defined

- Presets live in `tournament.model.presets`
- Preview themes live in `tournament.model.previewThemes`
- The picks page preview and full model page both read from the same tournament config

## Weekly Workflow

- Update the tournament config file
- Drop in the weekly player data JSON
- Verify the picks page and model routes
- Adjust written analysis only where needed
