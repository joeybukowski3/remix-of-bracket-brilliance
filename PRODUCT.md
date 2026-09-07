# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are sports bettors and fantasy players researching picks, props, matchups, rankings, and draft decisions. General sports fans also use the product for data-driven team and player analysis without necessarily intending to bet.

Users typically arrive while preparing for a slate, matchup, tournament, season, or draft and need to compare dense information quickly across desktop and mobile.

## Product Purpose

Joe Knows Ball is a free, independently built sports analytics platform. It helps people make more informed sports-research decisions through proprietary JKB models, current data, trend analysis, rankings, matchup research, and transparent comparisons.

Success means users can find relevant analysis, understand the evidence and model context, and move from a broad slate or ranking to a specific team, player, matchup, prop, or draft decision without losing confidence in what the data represents.

## Positioning

Joe Knows Ball combines independent analysis and proprietary JKB models with current and third-party source data while keeping those inputs clearly distinguished. It favors transparent, research-oriented comparisons and credible explanation over sportsbook, casino, or promotional framing.

The product is not limited to a fixed list of sports. Its analysis model and information architecture should support expansion into additional sports and decision tools over time.

## Operating Context

- Users scan rankings, boards, schedules, props, trends, and model outputs before drilling into detailed team, player, matchup, tournament, or draft analysis.
- Betting-related research may compare JKB outputs with market prices or other external data, but model scores and comparisons must not be presented as guarantees.
- Fantasy users evaluate rankings, positional context, and draft decisions.
- The experience must support dense research workflows on both desktop and mobile.

## Capabilities and Constraints

- Preserve existing data, calculations, model outputs, and functionality unless a task explicitly changes them.
- Preserve existing URLs and navigation where practical.
- Keep JKB models and original analysis clearly distinct from third-party or source data.
- Keep public access free.
- Retain responsible-gambling language wherever betting content is presented.
- Support dense but highly readable data presentation, with hierarchy and scanability taking priority over decoration.
- Maintain strong desktop and mobile usability.
- Treat the current sports and tools as an evolving product scope rather than a permanent closed list.
- The application is a component-based React and TypeScript web product using Vite, Tailwind CSS, Shadcn/ui patterns, Supabase, React Router, and TanStack React Query. Generated data artifacts in `public/data/` are outputs of the repository's data pipelines and should not be treated as source files.

## Brand Commitments

- Preserve the Joe Knows Ball name, logo, and established branding. Current logo assets include `public/images/jkb-icon-trimmed.png`.
- The product should feel like a premium sports analytics product, not a generic SaaS dashboard, AI-generated template, sportsbook, or casino interface.
- Credibility, legibility, data hierarchy, and scanability take priority over decorative design.
- The voice should be direct, data-driven, transparent about model meaning and limitations, and careful not to imply guaranteed outcomes.

## Evidence on Hand

- The application contains working sports-analysis surfaces, models, rankings, matchup tools, props research, schedules, draft research, and supporting data pipelines under `src/`, `scripts/`, and `public/data/`.
- Site identity and public positioning are present in `index.html`, `src/lib/seo.ts`, and shared layout components under `src/components/layout/`.
- Responsible-gambling and model-limitation language exists in components and betting-related pages, including `src/components/SportsbookBar.tsx` and multiple pages under `src/pages/`.
- The repository contains automated Vitest and Playwright coverage for many product surfaces.
- Do not fabricate performance claims, betting outcomes, customers, testimonials, press, or benchmarks. Use only verified model outputs, source data, and evidence available in the project or supplied by the user.

## Product Principles

1. Make dense sports data fast to scan, understand, and compare.
2. Earn trust through transparent model context, source separation, and honest limitations.
3. Preserve analytical truth and working functionality before changing presentation.
4. Serve serious research without adopting sportsbook or casino conventions.
5. Design every core workflow for effective desktop and mobile use, with room for the product to expand into new sports.

## Accessibility & Inclusion

Accessibility and legibility are durable requirements. Interfaces should maintain readable type, sufficient contrast, clear hierarchy, usable interaction targets, keyboard-accessible controls, semantic structure, and responsive behavior that preserves the meaning of dense data on smaller screens.
