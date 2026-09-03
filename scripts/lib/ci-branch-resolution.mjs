/**
 * Single source of truth for which branch a data-writing GitHub Actions
 * workflow should check out AND push generated commits back to.
 *
 * Root cause this exists to prevent: a workflow that hard-codes
 * `ref: main` on checkout (or `git push origin HEAD:main` on commit)
 * silently ignores whichever branch a `workflow_dispatch` run was
 * actually launched against, so a manual test run on a feature branch
 * ends up reading AND writing `main` instead. Every dispatch caller must
 * resolve the branch through this module instead of hard-coding a ref.
 *
 * Fails closed: an unrecognized event name throws rather than silently
 * defaulting to a branch.
 */

export const PRODUCTION_BRANCH = "main";

/**
 * @param {{ eventName: string, refName: string }} input
 *   eventName: github.event_name
 *   refName: github.ref_name (the branch/tag short name GitHub resolved for this run --
 *     for workflow_dispatch this is exactly the branch selected in the UI)
 * @returns {string} the branch this run must check out and push back to
 */
export function resolveTargetBranch({ eventName, refName }) {
  if (eventName === "workflow_dispatch") {
    if (!refName) {
      throw new Error("resolveTargetBranch: workflow_dispatch run has no github.ref_name");
    }
    return refName;
  }
  if (eventName === "schedule") {
    // Scheduled runs always operate on the production branch, explicitly --
    // never derived from whatever ref happens to be default at trigger time.
    return PRODUCTION_BRANCH;
  }
  throw new Error(`resolveTargetBranch: unsupported event_name "${eventName}" -- refusing to guess a branch`);
}

/**
 * CLI entrypoint used from workflow bash via:
 *   node scripts/lib/ci-branch-resolution.mjs <event_name> <ref_name>
 * Prints a single `branch=<value>` line suitable for appending to
 * $GITHUB_OUTPUT. Exits 1 (no output) on an unrecognized event.
 */
function main() {
  const [, , eventName, refName] = process.argv;
  try {
    const branch = resolveTargetBranch({ eventName, refName });
    console.log(`branch=${branch}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && process.argv[1].endsWith("ci-branch-resolution.mjs")) {
  main();
}
