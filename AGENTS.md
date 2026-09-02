# JoeKnowsBall Agent Guide

This file is the routine entry point for repository work. Keep it concise; route to the smallest set of durable documents relevant to the task.

## Repository purpose

JoeKnowsBall is a React and TypeScript sports-research application for model-informed rankings, matchups, props, picks, and related analysis. It includes MLB, PGA, NFL, fantasy football, college sports, and additional research tools. Use [docs/PROJECT.md](docs/PROJECT.md) when product context is relevant and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) when system boundaries or data flow are relevant.

## Authority hierarchy

When sources conflict, use this order:

1. Current explicit user instruction
2. Approved active plan
3. `docs/DECISIONS.md`
4. Relevant current model documentation
5. Relevant current feature documentation
6. Project, architecture, data, and brand documentation
7. Current implementation and tests
8. Completed plans, audits, migrations, memory, and PR history
9. Chat history

If authoritative documentation and implementation disagree, do not silently choose one. Investigate the mismatch and report it before implementing a resolution.

## Startup and context routing

1. Read this file.
2. Restate the task, scope, and success criteria before changing files.
3. Read only the context needed for the task:
   - Product scope: `docs/PROJECT.md`
   - System structure or data flow: `docs/ARCHITECTURE.md`
   - Tests and browser verification: `docs/TESTING.md`
   - Durable decisions: `docs/DECISIONS.md`
   - Sports models or pipelines: relevant current model, feature, and data documentation; then producers, consumers, and tests
4. Inspect the relevant implementation and immediate callers before editing.
5. Check `git status` and preserve unrelated worktree changes.

Normal startup does not require reading `SOUL.md`, `USER.md`, or daily files in `memory/`. Those files remain historical provenance and may be consulted only when a task specifically requires them.

## Investigation and implementation

- For investigations, gather evidence and report findings; do not implement unless asked.
- For implementation, make the smallest scoped change that satisfies the approved goal.
- Treat ambiguity that would materially change the result as a reason to stop and ask.
- Do not change sports-model methodology, weights, formulas, thresholds, or interpretation unless explicitly authorized. Read the relevant model documentation first.
- Before changing any JKB football model, feature, projection output, prediction schema, market integration, archive, outcome resolver, or evaluation methodology, read `docs/modeling/JKB_MODELING_MASTER_SPEC.md` and its linked specifications. Update the affected modeling documentation in the same PR as any behavior, schema, or evaluation-method change.
- Do not perform unrelated cleanup or rewrite historical documentation to make it appear current.

## Git safety

- Never discard, overwrite, stage, or commit unrelated changes.
- Stage approved paths by exact filename. Never use `git add .` or `git add -A` in a dirty worktree.
- Do not push, merge, rebase, deploy, or modify `main` without explicit authorization.
- Do not use destructive Git commands unless the user explicitly requests them and the exact targets are verified.

## Generated data

- Treat `dist/`, `public/data/`, `data/generated/`, and documented pipeline artifacts as generated unless authoritative documentation identifies a specific maintained exception.
- Change the producer or source input, not a generated artifact, unless artifact-level editing is explicitly requested.
- Before running a generator, inspect its command, inputs, outputs, network requirements, and working-tree impact.
- Do not run production-writing, publishing, grading, posting, email, or synchronization modes while performing ordinary verification. Prefer documented dry-run, preview, temporary-output, or validation modes.

## Workflow and production safety

- `.github/workflows/`, `vercel.json`, deployment settings, environment-variable contracts, `supabase/`, and external publishing integrations are production-sensitive.
- Inspect them freely, but obtain explicit approval before modifying them or triggering a workflow, deployment, migration, live post, email, or external write.
- Never expose secrets or copy private environment values into commands, logs, fixtures, or documentation.
- Repository evidence currently shows both Vercel configuration and a GitHub Pages deployment workflow; see `docs/ARCHITECTURE.md` and do not assume the authoritative production path.

## Testing

- Follow `docs/TESTING.md` and choose validation proportional to the change.
- Prefer focused tests first; expand to the relevant suite, lint, and build when warranted.
- Do not claim success for checks that were not run. Report skipped checks and known unrelated failures.
- Automated browser testing, screenshots, and visual debugging must use the repository's analytics-blocking Playwright fixture or helpers. Never allow automated Google Analytics or Google Tag Manager traffic.

## Final report

Report:

- the outcome and behavior established
- every changed file, labeled as source, generated, config, or documentation
- validation commands and results
- conflicts, uncertainties, skipped checks, and remaining work
- confirmation that unrelated worktree changes were preserved
