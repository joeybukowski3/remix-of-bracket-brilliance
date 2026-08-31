# Project

## Purpose

JoeKnowsBall is a free sports-research application. It combines JKB analysis and model outputs with current and third-party data to help users compare teams, players, matchups, tournaments, props, rankings, and market context. It is a research product, not a sportsbook, and model outputs must not be presented as guaranteed outcomes.

## Users and product principles

The primary users are sports bettors and fantasy players preparing for a slate, matchup, tournament, season, or draft. General sports fans also use the application for data-driven research.

Durable principles:

- Make dense sports information fast to scan, understand, and compare on desktop and mobile.
- Distinguish JKB models and original analysis from third-party source data.
- Explain model meaning and limitations; do not fabricate performance, probability, or betting claims.
- Preserve responsible-gambling language on betting-related surfaces.
- Preserve existing behavior, data contracts, URLs, and model outputs unless a task explicitly changes them.
- Keep the product extensible beyond its current sports and tools.

## Current product areas

Current routes and source modules show these major areas:

- MLB: daily game research, HR and strikeout props, batter-versus-pitcher analysis, Sin City, numerology, power rankings, and pitcher vulnerability; a moneyline "edge" view with prediction archiving and closing-line tracking; and a performance/results tracker
- PGA: tournament pages, models, table views, history, custom and DFS tools, picks, rankings, and best bets
- NFL: weekly dashboard and command-center schedule surfaces, schedules, standings, power ratings, team guides, analytics, futures, and award research; a redesigned multi-section Matchup Analyzer that adds conventional stats, success rates, trench win rates, injuries, market profile, and EPA comparisons, with a Model Analysis section that shows a JKB projected spread beside the market line; a Yardage Props Review surface for passing, rushing, and receiving yard research; and a DraftKings Classic DFS Contest Analyzer
- Fantasy football: season-long draft rankings, a Draft Preview board, Weekly Rankings, a weekly projection and research system, Rest-of-Season research, weekly matchup and composite context, and points-allowed research
- College sports: NCAA basketball schedules, matchups, bracket and betting-edge tools, plus a separate college-football section for rankings (with an independent AP comparison), schedules, teams, matchups with a redesigned detail view, season-stat comparisons, and conferences
- Additional tools: World Cup analysis, public odds and betting-splits tracking, a Polymarket odds tracker, and the 16-0 draft experience

Some routes (for example an NBA landing page) are deliberate "coming soon" placeholders and are not current product areas.

Several NFL and CFB models now produce forward-looking projections and model-versus-market comparisons rather than only descriptive summaries. This does not make the application a sportsbook: projections are presented as research, framing constraints in `docs/DECISIONS.md` apply, and no surface presents a model output as a guaranteed outcome, edge, or recommendation without an explicitly documented calibration gate.

`AGENTS.md` routes task-specific context; `docs/ARCHITECTURE.md`, `docs/TESTING.md`, and `docs/DECISIONS.md` own their respective technical contracts.
