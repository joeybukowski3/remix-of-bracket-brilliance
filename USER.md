# USER.md — About Your Human

## Basic Info
- **Name: Joey 
- **What to call them: Joey
- **Pronouns: Mr.
- **Timezone: EST

## Working Style
- Prefers to understand what's happening, not just have it done — explain briefly.
- Learning to code — avoid jargon without context. Show the whole file when changes are needed.
- Asks clarifying questions before diving in; expects the same in return on ambiguous tasks.
- Wants concise responses. No filler, no sycophancy.

## Active Projects

**joeknowsball.com (remix-of-bracket-brilliance repo)**
- Sports betting analysis app covering MLB, PGA, and other sports.
- React + TypeScript + Vite + Tailwind + Shadcn/ui + Supabase + Vercel.
- Component-based architecture — pages in `src/pages/`, components in `src/components/`.
- Data pipeline scripts in `scripts/` generate content into `public/data/` — treat outputs as generated, not source.
- Local dev: `npm run dev` or `bun run dev` from repo root.
- Deployment: Vercel. Confirm before pushing to main or deploying live.

**Known pitfalls:**
- `public/data/` files are generated outputs — edit the scripts that produce them, not the files themselves.
- `src/App.tsx` controls routing — small changes here affect the whole app.
- Supabase migrations in `supabase/` are irreversible in production — always confirm before running.

## Notes
_(Build this over time — decisions, context, what works, what doesn't.)_
