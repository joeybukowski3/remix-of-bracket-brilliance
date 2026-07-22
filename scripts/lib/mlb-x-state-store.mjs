/**
 * Git-backed authoritative state store for MLB X publication receipts.
 *
 * Receipts cannot live in Actions cache or workflow artifacts: neither is
 * strongly consistent, and a queued duplicate job could read a stale "not
 * posted" after the first job had already published. A dedicated state branch
 * gives read-after-write through a normal fetch, and a push that loses a race
 * fails loudly rather than silently overwriting.
 *
 * Layout, one file per slate/market/edition:
 *   mlb-x/2026-07-21/k-morning.json
 *   mlb-x/2026-07-21/hr-morning.json
 *   mlb-x/2026-07-21/k-confirmed.json
 *   mlb-x/2026-07-21/hr-confirmed.json
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

  /** Fetches and hard-syncs the local state branch to the remote tip. */
  function sync() {
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

  function readReceipt({ slateDate, market, edition }) {
    const relative = receiptPathFor({ slateDate, market, edition });
    const absolute = path.join(workDir, relative);
    if (!fileExists(absolute)) return null;
    try {
      return JSON.parse(readFile(absolute));
    } catch {
      return null;
    }
  }

  /**
   * Writes one receipt and pushes it. Called immediately after X confirms the
   * primary post, so the authoritative record exists before anything else can
   * observe "not posted".
   */
  function writeReceipt({ slateDate, market, edition, receipt }) {
    const relative = receiptPathFor({ slateDate, market, edition });
    const absolute = path.join(workDir, relative);

    for (let attempt = 1; attempt <= maxPushAttempts; attempt += 1) {
      ensureDir(path.dirname(absolute));
      writeFile(absolute, `${JSON.stringify(receipt, null, 2)}\n`);
      run(["add", relative]);

      const staged = run(["diff", "--cached", "--quiet"], { allowFailure: true });
      if (staged.status === 0) return { pushed: false, unchanged: true, path: relative, attempts: attempt };

      run(["commit", "-m", receiptCommitMessage({ slateDate, market, edition, postId: receipt?.primaryPostId ?? receipt?.postId ?? "unknown" }), "--quiet"]);

      // Never --force: losing a race must be visible, not silently destructive.
      const push = run(["push", remote, `${branch}:${branch}`, "--quiet"], { allowFailure: true });
      if (push.status === 0) return { pushed: true, unchanged: false, path: relative, attempts: attempt };

      // Another runner advanced the branch. Reset onto their tip and re-apply
      // this receipt on the next loop pass.
      //
      // Deliberately not a rebase: on the very first slate both runners create
      // orphan branches, so their histories are unrelated and no rebase can
      // reconcile them. Resetting to the fetched tip and rewriting the file is
      // correct in both cases and never rewrites published history -- the
      // discarded commit was only ever local.
      run(["fetch", remote, branch, "--quiet"], { allowFailure: true });
      run(["reset", "--hard", `${remote}/${branch}`], { allowFailure: true });

      // If the competing runner published THIS edition, stop and surface their
      // receipt. Overwriting it would hide a real publication.
      const theirs = readReceipt({ slateDate, market, edition });
      const ourId = receipt?.primaryPostId ?? receipt?.postId ?? null;
      const theirId = theirs?.primaryPostId ?? theirs?.postId ?? null;
      if (theirs && theirId && ourId && theirId !== ourId) {
        return { pushed: false, conflicted: true, existingReceipt: theirs, path: relative, attempts: attempt };
      }
    }
    return { pushed: false, exhausted: true, path: relative, attempts: maxPushAttempts };
  }

  return { sync, readReceipt, writeReceipt, branch, workDir, receiptPathFor };
}
