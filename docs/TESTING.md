# Testing

## Principles

- Match validation to the changed behavior and risk.
- Run focused checks first, then broader suites when the change can affect shared behavior.
- Verify actual intent, not only compilation.
- Never hide skipped checks, unrelated failures, flaky behavior, or environment limitations.
- Tests are evidence of current behavior. They do not silently override higher-authority documentation when the two conflict.

## Test layers

### Vitest and Testing Library

`npm test` runs the Vitest configuration in `vitest.config.ts`. It collects colocated `src/**/*.{test,spec}.{ts,tsx}` tests plus an explicit list of selected script and top-level test files.

Use a focused command while iterating:

```sh
npx vitest run path/to/relevant.test.ts
```

Then use the broader suite when the scope warrants it:

```sh
npm test
```

### Script tests

The repository has many `scripts/**/*.test.mjs` files. `vitest.config.ts` intentionally includes only selected script suites because many others use Node's built-in test runner. Inspect the relevant test file and producer before choosing a command. A typical targeted command is:

```sh
node --test path/to/relevant.test.mjs
```

Do not claim that `npm test` covers every pipeline test.

### Typecheck, lint, and production build

```sh
npx tsc --noEmit -p tsconfig.app.json
npx tsc --noEmit -p tsconfig.node.json
npm run lint
npm run build
```

`tsconfig.app.json` checks `src/`, while `tsconfig.node.json` checks the Vite configuration. There is currently no repository-wide npm typecheck script. A successful build should not be reported as a substitute for an explicit typecheck.

Use focused linting when unrelated worktree failures would obscure the result, but identify exactly what was checked. Run the production build for changes that affect application compilation, routing, shared runtime modules, or build-consumed assets.

### Playwright and browser verification

All automated browser testing, screenshots, visual checks, and debugging must use the repository's analytics-blocking setup:

- Playwright specs import `test` and `expect` from `playwright-fixture.ts`.
- The fixture installs `scripts/lib/playwright-analytics-blocking.mjs` automatically.
- The Playwright configuration blocks service workers.
- Directly created contexts or pages must use the shared blocking helpers before navigation.

Do not import Playwright's base `test` directly for repository browser specs. Do not use an alternate automated browser path that bypasses these protections. Google Analytics and Google Tag Manager requests must never leave automated sessions.

Verify the safety layer itself with:

```sh
npm run test:playwright-analytics
```

Run a relevant browser spec with:

```sh
npx playwright test tests/path-to-spec.spec.ts
```

Browser validation may require a local dev or preview server. State the URL, command, and blocking mechanism used.

## Validation by change type

- Documentation only: inspect rendered structure and links, run whitespace/diff checks, and verify scope. Application tests are unnecessary unless documentation claims are being validated against runtime behavior.
- Isolated pure logic: focused unit tests, then related regression tests.
- Shared hooks, components, or domain modules: focused tests plus affected consumer tests; consider lint and build.
- Routing or responsive UI: component tests, build, and analytics-safe browser verification on relevant desktop and mobile viewports.
- Data producer or model support: producer tests, schema/validation commands, deterministic-output checks, and consumer tests. Do not overwrite tracked outputs unless explicitly authorized.
- Workflow, deployment, database, or external publishing: require explicit approval and a task-specific validation plan before mutation or execution.

## Reporting

For every completed implementation, report:

- commands run and whether each passed
- what behavior each command verified
- checks not run and why
- known failures determined to be unrelated
- generated files or external effects, if any
