# AGENTS.md
Read this file first before making changes in this repository.

## Session Startup
Before doing anything else:
1. Read `SOUL.md` — this is who you are
2. Read `USER.md` — this is who you're helping
3. Read `memory/YYYY-MM-DD.md` (today + yesterday) for recent context

Don't ask permission. Just do it.

## Memory
You wake up fresh each session. These files are your continuity.
- **Daily notes:** `memory/YYYY-MM-DD.md` — log decisions, context, changes made
- **No mental notes** — if it matters, write it to a file. Files survive restarts. Memory doesn't.
- When you learn a lesson or make a mistake, document it so future-you doesn't repeat it.

## Purpose
This is joeknowsball.com — a React/TypeScript sports betting analysis app covering MLB, PGA, and other sports. It uses Vite for bundling, Tailwind + Shadcn/ui for styling, Supabase for data, and Vercel for deployment.

## Stack
- **Framework:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS + Shadcn/ui components
- **Data:** Supabase (`@supabase/supabase-js`)
- **Routing:** React Router v6
- **State/fetching:** TanStack React Query
- **Testing:** Vitest + Playwright
- **Local dev:** `npm run dev` or `bun run dev`
- **Build:** `npm run build`

## Source Structure
- `src/pages/` — route-level page components
- `src/components/` — reusable UI components
- `src/hooks/` — custom React hooks
- `src/integrations/` — external service connectors (Supabase etc.)
- `src/lib/` — shared utilities
- `src/data/` — static/local data files
- `api/` — Vercel serverless handlers
- `scripts/` — data generation pipeline (PGA, MLB HR props, SEO)
- `public/` — static assets and generated data files
- `supabase/` — Supabase config and migrations

## Working Rules
- This is a component-based React app. Do not flatten it into plain HTML/JS.
- Match existing Shadcn/ui component patterns. Do not introduce new UI libraries.
- Match existing TypeScript conventions. Do not weaken types with `any` unless explicitly asked.
- Prefer editing source files in `src/` over anything in `dist/` — dist is build output.
- Do not hand-edit generated files in `public/data/` unless explicitly asked for artifact-level changes.
- Make minimal, scoped edits. Avoid opportunistic cleanup unless requested.

## Ask Before Changing
Stop and confirm before touching any of the following:
- `vercel.json` — deployment and routing config
- `vite.config.ts` — build configuration
- `tailwind.config.ts` — design token configuration
- `supabase/` — database migrations or config
- `.github/workflows/` — CI/CD automation
- Environment variable contracts (`.env`, `.env.example`)
- Routing structure in `src/App.tsx`

## Scripts — Data Pipeline
These scripts generate content and data files. Run from repo root:
- `npm run mlb:hr-props` — generates MLB HR props data
- `npm run pga:generate` — generates PGA tournament package
- `npm run seo:generate` — generates SEO files
- Generated outputs typically land in `public/data/` — do not treat them as source files.

## Risk Areas
These files are central and changes can break unrelated behavior:
- `src/App.tsx` — routing and top-level layout
- `src/main.tsx` — app entry point
- `src/integrations/` — Supabase client setup
- Any file in `src/hooks/` used across multiple pages

Inspect surrounding usage before editing any of these.

## Red Lines
- Don't exfiltrate private data. Ever.
- Don't run destructive commands without asking.
- `trash` > `rm` — recoverable beats gone forever.
- When in doubt, ask.

## External vs Internal
**Do freely:** read files, explore, organize, run dev server, run scripts locally.
**Ask first:** deploying to Vercel, pushing to main, sending anything externally, touching Supabase migrations.

---

## Code Update Rules
These apply before and during every code change.

**Before every change:**
- State what you believe the goal is before writing any code.
- If the goal is ambiguous, stop and surface it. Do not guess.
- Read the relevant file, component, and immediate callers before touching anything.
- If you don't know why something is structured a certain way, ask before changing it.

**Making changes:**
- Write the minimum code that solves the problem. Nothing more.
- Touch only what is necessary. Do not clean up or reformat adjacent code.
- Match the existing style, naming, and TypeScript conventions of the file exactly.
- If two patterns conflict, pick the more recent one and flag it. Do not blend them.
- Push back when a simpler approach exists.

**Verifying changes:**
- Define what success looks like before finishing.
- Verify output matches actual intent, not just the literal instruction.
- After each significant step, summarize: what changed, what was verified, what remains.
- If anything was skipped or unverified, say so before marking done.

**Reporting changes:**
When you finish work, report exactly which files changed and label each as:
- source file
- generated file
- config file
- documentation file

If you intentionally changed a generated artifact, say why.

**Fail loud:**
- "Done" is wrong if anything was skipped silently.
- "It works" is wrong if it was not tested or verified.
- If you lose track of the goal, stop and restate before continuing.
- Surface uncertainty. Never hide it.

**Token efficiency:**
- Be concise. Omit filler and redundant explanation.
- If a task is growing complex, break it into steps and checkpoint between them.
- If context is getting long, flag it and offer to summarize before continuing.
