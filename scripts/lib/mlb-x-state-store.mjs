/**
 * Git-backed authoritative state store for MLB X publication receipts.
 *
 * Receipts cannot live in Actions cache or workflow artifacts: neither is
 * strongly consistent, and a queued duplicate job could read a stale "not
 * posted" after the first job had already published. A dedicated state branch
 * gives read-after-write through a normal fetch, and a push that loses a race
 * fails loudly rather than silently overwriting.
 *
 * Layout, one receipt file per slate/market/edition:
 *   mlb-x/2026-07-21/k-morning.json
 *   mlb-x/2026-07-21/hr-morning.json
 *   mlb-x/2026-07-21/k-confirmed.json
 *   mlb-x/2026-07-21/hr-confirmed.json
 *
 * Plus one ROLLING diagnostic file per edition, at a structurally separate
 * path so it can never be mistaken for a receipt:
 *   mlb-x/2026-07-21/diagnostics/k-morning.json
 *   mlb-x/2026-07-21/diagnostics/hr-morning.json
 *   ...
 * A diagnostic is the latest non-post outcome for an edition (NOT_DUE,
 * IMAGE_FAILED, etc.) -- see mlb-x-edition-diagnostics.mjs. It is overwritten
 * in place, never appended, and a write whose meaningful fields match what is
 * already committed is skipped entirely (no git operation at all), so a
 * pregame poll repeating the same NOT_DUE for hours produces zero commits --
 * only a genuine state transition does.
 *
 * Never force-pushes and never rewrites history. On a non-fast-forward push it
 * rebases onto the newly fetched tip and retries, so two runners writing
 * different editions both land. If a competing runner already wrote THIS
 * edition, the rebase surfaces it and the caller re-reads rather than
 * clobbering a real publication.
 */
import path from "node:path";

export const STATE_BRANCH = "automation/mlb-x-state";
export const STATE_ROOT = "mlb-x";

/** `mlb-x/YYYY-MM-DD/{market}-{edition}.json` */
export function receiptPathFor({ slateDate, market, edition }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(slateDate ?? ""))) {
    throw new Error(`Malformed slate date "${slateDate}" (expected YYYY-MM-DD).`);
  }
  if (!["k", "hr"].includes(market)) throw new Error(`Unknown market "${market}".`);
  if (!["morning", "confirmed"].includes(edition)) throw new Error(`Unknown edition "${edition}".`);
  return `${STATE_ROOT}/${slateDate}/${market}-${edition}.json`;
}

/**
 * [skip ci] keeps a state-only commit from triggering a production build.
 * The branch is not a deploy branch, but hosts that build every ref would
 * otherwise redeploy on every receipt.
 */
export function receiptCommitMessage({ slateDate, market, edition, postId }) {
  return `chore(mlb-x): record ${market} ${edition} receipt for ${slateDate} [skip ci]\n\npostId=${postId}`;
}

/** `mlb-x/YYYY-MM-DD/diagnostics/{market}-{edition}.json` -- structurally distinct from receiptPathFor. */
export function diagnosticPathFor({ slateDate, market, edition }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(slateDate ?? ""))) {
    throw new Error(`Malformed slate date "${slateDate}" (expected YYYY-MM-DD).`);
  }
  if (!["k", "hr"].includes(market)) throw new Error(`Unknown market "${market}".`);
  if (!["morning", "confirmed"].includes(edition)) throw new Error(`Unknown edition "${edition}".`);
  return `${STATE_ROOT}/${slateDate}/diagnostics/${market}-${edition}.json`;
}

export function diagnosticCommitMessage({ slateDate, market, edition, latestOutcome }) {
  return `chore(mlb-x): record ${market} ${edition} diagnostic for ${slateDate} [skip ci]\n\nlatestOutcome=${latestOutcome}`;
}

/**
 * Fields that determine whether a diagnostic write is a real transition.
 * updatedAt and windowClosesAt are deliberately excluded: both drift on every
 * routine poll even when nothing meaningful changed, and including them would
 * turn "do not commit on every routine poll" back into "commit on every poll".
 */
const DIAGNOSTIC_MEANINGFUL_FIELDS = ["receiptKey", "latestOutcome", "reason", "technicalFailure"];

function diagnosticMeaningfullyEqual(a, b) {
  if (!a || !b) return false;
  return DIAGNOSTIC_MEANINGFUL_FIELDS.every((field) => a[field] === b[field]);
}

const MAX_PUSH_ATTEMPTS = 5;

/**
 * @param {object} params
 * @param {(args: string[], options?: object) => {status:number, stdout:string, stderr:string}} params.git
 *        Runs one git command in the state working tree. Injected for testing.
 */
export function createGitStateStore({
  git,
  workDir,
  branch = STATE_BRANCH,
  remote = "origin",
  readFile,
  writeFile,
  ensureDir,
  fileExists,
  maxPushAttempts = MAX_PUSH_ATTEMPTS,
}) {
  const run = (args, { allowFailure = false } = {}) => {
    const result = git(args, { cwd: workDir });
    if (!allowFailure && result.status !== 0) {
      throw new Error(`git ${args.join(" ")} failed (${result.status}): ${result.stderr || result.stdout}`);
    }
    return result;
  };

  /**
   * A CI runner (unlike a developer machine) carries no global git identity,
   * and this working directory is a scratch clone dedicated to state, never
   * the checked-out repo -- so every commit here needs its own local
   * identity or `git commit` fails with "empty ident name". Set once, before
   * the first fetch/checkout, so every caller's first sync() covers it.
   */
  function ensureCommitIdentity() {
    run(["config", "user.email", "mlb-x-automation@joeknowsball.com"]);
    run(["config", "user.name", "mlb-x-automation"]);
  }

  /** Fetches and hard-syncs the local state branch to the remote tip. */
  function sync() {
    ensureCommitIdentity();
    run(["fetch", remote, branch, "--quiet"], { allowFailure: true });
    const remoteRef = `${remote}/${branch}`;
    const hasRemote = run(["rev-parse", "--verify", "--quiet", remoteRef], { allowFailure: true }).status === 0;
    if (hasRemote) {
      run(["checkout", "-B", branch, remoteRef, "--quiet"]);
    } else {
      // First ever run: an orphan branch carrying only state.
      run(["checkout", "--orphan", branch], { allowFailure: true });
      run(["rm", "-rf", "--cached", "."], { allowFailure: true });
    }
    return { branch, syncedRemote: hasRemote };
  }

  function readJsonFile(relative) {
    const absolute = path.join(workDir, relative);
    if (!fileExists(absolute)) return null;
    try {
      return JSON.parse(readFile(absolute));
    } catch {
      return null;
    }
  }

  function readReceipt({ slateDate, market, edition }) {
    return readJsonFile(receiptPathFor({ slateDate, market, edition }));
  }

  /**
   * Shared write-commit-push-retry loop for both receipts and diagnostics.
   * `onConflict` lets the caller decide, per file kind, whether a competing
   * runner's version should stop the retry (a real receipt must never be
   * silently overwritten) or simply be treated as the new base to re-apply
   * onto (a diagnostic has no such property -- the latest write should win).
   */
  function writeJsonWithRetry({ relative, value, commitMessage, onConflict }) {
    const absolute = path.join(workDir, relative);

    for (let attempt = 1; attempt <= maxPushAttempts; attempt += 1) {
      ensureDir(path.dirname(absolute));
      writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`);
      run(["add", relative]);

      const staged = run(["diff", "--cached", "--quiet"], { allowFailure: true });
      if (staged.status === 0) return { pushed: false, unchanged: true, path: relative, attempts: attempt };

      run(["commit", "-m", commitMessage, "--quiet"]);

      // Never --force: losing a race must be visible, not silently destructive.
      const push = run(["push", remote, `${branch}:${branch}`, "--quiet"], { allowFailure: true });
      if (push.status === 0) return { pushed: true, unchanged: false, path: relative, attempts: attempt };

      // Another runner advanced the branch. Reset onto their tip and re-apply
      // this write on the next loop pass.
      //
      // Deliberately not a rebase: on the very first slate both runners create
      // orphan branches, so their histories are unrelated and no rebase can
      // reconcile them. Resetting to the fetched tip and rewriting the file is
      // correct in both cases and never rewrites published history -- the
      // discarded commit was only ever local.
      run(["fetch", remote, branch, "--quiet"], { allowFailure: true });
      run(["reset", "--hard", `${remote}/${branch}`], { allowFailure: true });

      const stop = onConflict ? onConflict(readJsonFile(relative)) : null;
      if (stop) return { ...stop, path: relative, attempts: attempt };
    }
    return { pushed: false, exhausted: true, path: relative, attempts: maxPushAttempts };
  }

  /**
   * Writes one receipt and pushes it. Called immediately after X confirms the
   * primary post, so the authoritative record exists before anything else can
   * observe "not posted".
   */
  function writeReceipt({ slateDate, market, edition, receipt }) {
    const ourId = receipt?.primaryPostId ?? receipt?.postId ?? null;
    return writeJsonWithRetry({
      relative: receiptPathFor({ slateDate, market, edition }),
      value: receipt,
      commitMessage: receiptCommitMessage({ slateDate, market, edition, postId: ourId ?? "unknown" }),
      // If the competing runner published THIS edition, stop and surface
      // their receipt. Overwriting it would hide a real publication.
      onConflict: (theirs) => {
        const theirId = theirs?.primaryPostId ?? theirs?.postId ?? null;
        if (theirs && theirId && ourId && theirId !== ourId) {
          return { pushed: false, conflicted: true, existingReceipt: theirs };
        }
        return null;
      },
    });
  }

  function readDiagnostic({ slateDate, market, edition }) {
    return readJsonFile(diagnosticPathFor({ slateDate, market, edition }));
  }

  /**
   * Overwrites the one rolling diagnostic for this edition. Skips the git
   * operation entirely -- no add, no commit, no push -- when the meaningful
   * fields already match what is committed, which is what keeps a routine
   * pregame poll from producing a new commit every 20 minutes; only an actual
   * state transition (or the very first diagnostic of the day) commits.
   *
   * No conflict handling beyond "last write wins": unlike a receipt, a
   * diagnostic is not evidence of publication and there is nothing to protect
   * by refusing to overwrite a competing runner's diagnostic.
   */
  function writeDiagnostic({ slateDate, market, edition, diagnostic }) {
    const relative = diagnosticPathFor({ slateDate, market, edition });
    const current = readJsonFile(relative);
    if (diagnosticMeaningfullyEqual(current, diagnostic)) {
      return { pushed: false, unchanged: true, path: relative, attempts: 0 };
    }
    return writeJsonWithRetry({
      relative,
      value: diagnostic,
      commitMessage: diagnosticCommitMessage({ slateDate, market, edition, latestOutcome: diagnostic?.latestOutcome ?? "unknown" }),
      onConflict: () => null, // always re-apply and retry; last write wins
    });
  }

  return {
    sync, readReceipt, writeReceipt, readDiagnostic, writeDiagnostic,
    branch, workDir, receiptPathFor, diagnosticPathFor,
  };
}
