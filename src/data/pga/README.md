# PGA Tournament System

Weekly PGA rollout is now file-driven.

## Current Architecture

- Shared routes:
  - `/pga/:tournamentSlug`
  - `/pga/:tournamentSlug/model`
  - `/pga/:tournamentSlug/model/table`
- Shared pages and model UI:
  - [PgaTournamentPicksPage.tsx](/C:/Users/jbloo/remix-of-bracket-brilliance/src/components/pga/PgaTournamentPicksPage.tsx:1)
  - [PGAModel.tsx](/C:/Users/jbloo/remix-of-bracket-brilliance/src/pages/PGAModel.tsx:1)
  - [PGAModelTableView.tsx](/C:/Users/jbloo/remix-of-bracket-brilliance/src/pages/PGAModelTableView.tsx:1)
- Tournament registration:
  - [tournaments.ts](/C:/Users/jbloo/remix-of-bracket-brilliance/src/lib/pga/tournaments.ts:1)
  - [featuredTournament.ts](/C:/Users/jbloo/remix-of-bracket-brilliance/src/data/pga/featuredTournament.ts:1)
- Weekly schedule source of truth:
  - [schedule.json](/C:/Users/jbloo/remix-of-bracket-brilliance/src/data/pga/schedule.json:1)
- Manual override layer:
  - `src/data/pga/overrides/<slug>.ts`
- Generated packages:
  - `src/data/pga/generated/<slug>.ts`
  - [registry.ts](/C:/Users/jbloo/remix-of-bracket-brilliance/src/data/pga/generated/registry.ts:1)

## Weekly Monday Flow

Run:

```bash
npm run pga:generate:next
```

What it does:

1. Reads [schedule.json](/C:/Users/jbloo/remix-of-bracket-brilliance/src/data/pga/schedule.json:1)
2. Picks the next tournament by `startDate`
3. If the entry is `registration: "generated"`, it creates or refreshes:
   - `src/data/pga/generated/<slug>.ts`
   - `src/data/pga/overrides/<slug>.ts` if missing
   - [registry.ts](/C:/Users/jbloo/remix-of-bracket-brilliance/src/data/pga/generated/registry.ts:1)
4. If a workbook path is configured or passed, it runs:
   - [generate-pga-tournament-package.mjs](/C:/Users/jbloo/remix-of-bracket-brilliance/scripts/generate-pga-tournament-package.mjs:1)
   - [export_pga_workbook.py](/C:/Users/jbloo/remix-of-bracket-brilliance/scripts/export_pga_workbook.py:1)
5. Updates [featuredTournament.ts](/C:/Users/jbloo/remix-of-bracket-brilliance/src/data/pga/featuredTournament.ts:1) so:
   - `/pga`
   - featured homepage PGA module
   - featured PGA SEO helpers
   all point at the new tournament

## Manual Override Workflow

After the auto-generated package is live, edit:

- `src/data/pga/overrides/<slug>.ts`

Use it for:

- `weightOverrides`
- `manual.featuredNarrative`
- `manual.playerAdjustments`
- `manual.courseFitNotes`
- `manual.statPriorityTweaks`
- any focused `hero`, `seo`, `model`, or `picksPage` copy overrides

The override layer merges onto the baseline package. You do not need to rebuild the tournament shell.

## Add a New Tournament to the Weekly System

1. Add the tournament to [schedule.json](/C:/Users/jbloo/remix-of-bracket-brilliance/src/data/pga/schedule.json:1)
2. Set:
   - `slug`
   - dates
   - course info
   - `dataFile`
   - `registration`
3. If this is a brand-new tournament package:
   - set `registration` to `"generated"`
4. If the tournament already exists as a hand-written config:
   - set `registration` to `"legacy"`
5. If a workbook export should run automatically, add `workbook.defaultPath` and sheet names
6. Run `npm run pga:generate:next` or `npm run pga:generate -- --slug <slug> --feature`

## Where the Model Gets Its Data

- Each tournament config points at `model.dataPath`
- [usePgaTournamentPlayers.ts](/C:/Users/jbloo/remix-of-bracket-brilliance/src/hooks/usePgaTournamentPlayers.ts:1) loads that JSON
- [modelEngine.ts](/C:/Users/jbloo/remix-of-bracket-brilliance/src/lib/pga/modelEngine.ts:1) normalizes and ranks the field

## How Presets Are Defined

- Presets live in `tournament.model.presets`
- Preview themes live in `tournament.model.previewThemes`
- The picks page preview and full model page both read from the same tournament config

## Export Notes

- The checked-in exporter lives at [scripts/export_pga_workbook.py](/C:/Users/jbloo/remix-of-bracket-brilliance/scripts/export_pga_workbook.py:1).
- It merges the base DK sheet with the raw trend, history, and stat tabs.
- Stat joins use normalized player names:
  - lowercase
  - diacritics removed
  - punctuation removed
  - single-letter middle initials removed
  - explicit nickname aliases for known variants such as `Matthew` -> `Matt`
- Missing stat joins stay `null` and are emitted with completeness metadata instead of worst-rank placeholders.

## Local Scheduling

For this repo, a local scheduled task is the cleanest automation path because the workbook source currently lives on your machine rather than in the repo.

Recommended Windows Task Scheduler command:

```powershell
cd C:\Users\jbloo\remix-of-bracket-brilliance
cmd /c npm run pga:generate:next
```

Recommended trigger:

- Weekly
- Monday
- 2:00 AM

## Manual Test Before Automating

```bash
npm run pga:generate -- --slug wells-fargo-championship-2026-picks --feature --today 2026-04-18
cmd /c npm run build
cmd /c npm run test -- src/lib/pga/modelEngine.test.ts
```
