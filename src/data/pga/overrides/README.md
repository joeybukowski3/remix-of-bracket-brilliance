# PGA Override Files

Each weekly tournament can be fine-tuned without rebuilding the full page package.

Edit:

- `src/data/pga/overrides/<slug>.ts`

Common override categories:

- `weightOverrides`
- `manual.featuredNarrative`
- `manual.modelFocusNote`
- `manual.playerAdjustments`
- `manual.courseFitNotes`
- `manual.statPriorityTweaks`
- `manual.elevatedGolfers`
- `manual.downgradedGolfers`
- targeted `hero`, `seo`, `model`, and `picksPage` copy

These overrides merge onto the baseline tournament package through:

- [tournamentOverrides.ts](/C:/Users/jbloo/remix-of-bracket-brilliance/src/lib/pga/tournamentOverrides.ts:1)
