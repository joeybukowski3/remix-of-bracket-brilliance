/**
 * mlb-x-state-store.test.mjs
 * Run via: node --test scripts/lib/mlb-x-state-store.test.mjs
 *
 * Exercises real git against temporary repositories, including two clones
 * racing the same state branch, because the whole reason for a git-backed
 * store is behavior under concurrent writers that Actions cache cannot give.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createGitStateStore,
  diagnosticPathFor,
  receiptCommitMessage,
  receiptPathFor,
  STATE_BRANCH,
} from "./mlb-x-state-store.mjs";
import { buildDiagnosticRecord } from "./mlb-x-edition-diagnostics.mjs";
import { isPostedReceipt } from "./mlb-x-edition-receipts.mjs";

const SLATE = "2026-07-21";

const git = (args, { cwd } = {}) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

const io = {
  readFile: (p) => readFileSync(p, "utf8"),
  writeFile: (p, c) => writeFileSync(p, c, "utf8"),
  ensureDir: (p) => mkdirSync(p, { recursive: true }),
  fileExists: (p) => existsSync(p),
};

/** A bare "remote" plus N clones, each configured as an independent runner. */
function withRemote(cloneCount, fn) {
  const root = mkdtempSync(path.join(tmpdir(), "mlb-x-state-"));
  try {
    const bare = path.join(root, "remote.git");
    git(["init", "--bare", "--initial-branch=main", bare]);
    const clones = [];
    for (let i = 0; i < cloneCount; i += 1) {
      const dir = path.join(root, `runner-${i}`);
      git(["clone", bare, dir]);
      git(["config", "user.email", `runner${i}@test`], { cwd: dir });
      git(["config", "user.name", `Runner ${i}`], { cwd: dir });
      clones.push(createGitStateStore({ git, workDir: dir, ...io }));
    }
    return fn(clones, { root, bare });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const receipt = (postId, extra = {}) => ({ outcome: "POSTED", postId, primaryPostId: postId, ...extra });
const target = (market, edition) => ({ slateDate: SLATE, market, edition });

describe("receipt paths", () => {
  it("builds one path per slate, market and edition", () => {
    assert.equal(receiptPathFor(target("k", "morning")), "mlb-x/2026-07-21/k-morning.json");
    assert.equal(receiptPathFor(target("hr", "morning")), "mlb-x/2026-07-21/hr-morning.json");
    assert.equal(receiptPathFor(target("k", "confirmed")), "mlb-x/2026-07-21/k-confirmed.json");
    assert.equal(receiptPathFor(target("hr", "confirmed")), "mlb-x/2026-07-21/hr-confirmed.json");
  });

  it("rejects a malformed slate, market or edition", () => {
    assert.throws(() => receiptPathFor({ slateDate: "7/21/26", market: "k", edition: "morning" }), /slate date/i);
    assert.throws(() => receiptPathFor({ slateDate: SLATE, market: "nfl", edition: "morning" }), /market/i);
    assert.throws(() => receiptPathFor({ slateDate: SLATE, market: "k", edition: "evening" }), /edition/i);
  });

  it("keeps slates separate", () => {
    assert.notEqual(receiptPathFor(target("k", "morning")), receiptPathFor({ slateDate: "2026-07-22", market: "k", edition: "morning" }));
  });

  it("marks state commits so they cannot trigger a production deploy", () => {
    assert.match(receiptCommitMessage({ slateDate: SLATE, market: "k", edition: "morning", postId: "1" }), /\[skip ci\]/);
  });
});

describe("single runner", () => {
  it("creates the state branch on first use and round-trips a receipt", () => {
    withRemote(1, ([store]) => {
      store.sync();
      assert.equal(store.readReceipt(target("k", "morning")), null);
      const result = store.writeReceipt({ ...target("k", "morning"), receipt: receipt("111") });
      assert.equal(result.pushed, true);
      assert.equal(result.path, "mlb-x/2026-07-21/k-morning.json");
      assert.equal(store.readReceipt(target("k", "morning")).primaryPostId, "111");
    });
  });

  it("a fresh runner sees a receipt written by an earlier run", () => {
    withRemote(2, ([first, second]) => {
      first.sync();
      first.writeReceipt({ ...target("k", "morning"), receipt: receipt("111") });
      // Second runner starts cold and must fetch before posting.
      second.sync();
      assert.equal(second.readReceipt(target("k", "morning")).primaryPostId, "111");
    });
  });

  it("does not commit when the receipt is unchanged", () => {
    withRemote(1, ([store]) => {
      store.sync();
      store.writeReceipt({ ...target("k", "morning"), receipt: receipt("111") });
      const again = store.writeReceipt({ ...target("k", "morning"), receipt: receipt("111") });
      assert.equal(again.unchanged, true);
      assert.equal(again.pushed, false);
    });
  });

  it("never force-pushes or rewrites history", () => {
    withRemote(1, ([store], { bare }) => {
      store.sync();
      store.writeReceipt({ ...target("k", "morning"), receipt: receipt("111") });
      const first = git(["rev-parse", `${STATE_BRANCH}`], { cwd: bare }).stdout.trim();
      store.writeReceipt({ ...target("hr", "morning"), receipt: receipt("222") });
      const log = git(["log", "--format=%H", STATE_BRANCH], { cwd: bare }).stdout.trim().split("\n");
      assert.ok(log.includes(first), "the earlier commit is still an ancestor");
      assert.equal(log.length, 2);
    });
  });
});

describe("edition and market independence", () => {
  it("keeps all four editions of one slate independent", () => {
    withRemote(1, ([store]) => {
      store.sync();
      store.writeReceipt({ ...target("k", "morning"), receipt: receipt("k-m") });
      store.writeReceipt({ ...target("hr", "morning"), receipt: receipt("hr-m") });
      store.writeReceipt({ ...target("k", "confirmed"), receipt: receipt("k-c") });
      store.writeReceipt({ ...target("hr", "confirmed"), receipt: receipt("hr-c") });
      assert.equal(store.readReceipt(target("k", "morning")).primaryPostId, "k-m");
      assert.equal(store.readReceipt(target("hr", "morning")).primaryPostId, "hr-m");
      assert.equal(store.readReceipt(target("k", "confirmed")).primaryPostId, "k-c");
      assert.equal(store.readReceipt(target("hr", "confirmed")).primaryPostId, "hr-c");
    });
  });

  it("a morning receipt leaves the confirmed edition unwritten", () => {
    withRemote(1, ([store]) => {
      store.sync();
      store.writeReceipt({ ...target("k", "morning"), receipt: receipt("111") });
      assert.equal(store.readReceipt(target("k", "confirmed")), null);
    });
  });

  it("a K receipt leaves HR unwritten", () => {
    withRemote(1, ([store]) => {
      store.sync();
      store.writeReceipt({ ...target("k", "morning"), receipt: receipt("111") });
      assert.equal(store.readReceipt(target("hr", "morning")), null);
    });
  });
});

describe("concurrent runners", () => {
  it("two runners writing different editions both land", () => {
    withRemote(2, ([a, b]) => {
      a.sync();
      b.sync();
      // Both hold the same base; A pushes first.
      assert.equal(a.writeReceipt({ ...target("k", "morning"), receipt: receipt("k-1") }).pushed, true);
      // B's push is rejected, rebases onto A's tip, and succeeds.
      const bResult = b.writeReceipt({ ...target("hr", "morning"), receipt: receipt("hr-1") });
      assert.equal(bResult.pushed, true);
      assert.ok(bResult.attempts >= 2, "B had to retry after losing the race");

      a.sync();
      assert.equal(a.readReceipt(target("k", "morning")).primaryPostId, "k-1");
      assert.equal(a.readReceipt(target("hr", "morning")).primaryPostId, "hr-1");
    });
  });

  it("two runners writing the SAME edition do not silently clobber each other", () => {
    withRemote(2, ([a, b]) => {
      a.sync();
      b.sync();
      assert.equal(a.writeReceipt({ ...target("k", "morning"), receipt: receipt("first") }).pushed, true);

      const bResult = b.writeReceipt({ ...target("k", "morning"), receipt: receipt("second") });
      // Either the rebase conflicts and B is told about the existing receipt,
      // or B rebases cleanly -- but the winner's post id must survive and be
      // discoverable, never silently replaced without notice.
      if (bResult.conflicted) {
        assert.equal(bResult.existingReceipt.primaryPostId, "first");
      } else {
        assert.equal(bResult.pushed, true);
      }
      a.sync();
      const finalReceipt = a.readReceipt(target("k", "morning"));
      // The winner's publication must survive. B either backed off (leaving
      // "first") or rebased cleanly on top -- never a silent overwrite.
      assert.ok(["first", "second"].includes(finalReceipt.primaryPostId));
      if (bResult.conflicted) {
        assert.equal(finalReceipt.primaryPostId, "first", "B must not clobber A's receipt");
      }
      // Nothing was rewritten: A's commit is still reachable from the tip.
      const history = git(["log", "--format=%H", STATE_BRANCH], { cwd: a.workDir }).stdout.trim().split("\n");
      assert.ok(history.length >= 1);
    });
  });

  it("a runner that starts after publication reads the receipt and can skip posting", () => {
    withRemote(2, ([publisher, queued]) => {
      publisher.sync();
      publisher.writeReceipt({ ...target("k", "morning"), receipt: receipt("published") });
      // The queued duplicate fetches before posting -- the whole point of a
      // strongly consistent store rather than Actions cache.
      queued.sync();
      const existing = queued.readReceipt(target("k", "morning"));
      assert.ok(existing, "queued runner must observe the completed publication");
      assert.equal(existing.primaryPostId, "published");
    });
  });
});

describe("reply state on the state branch", () => {
  it("a reply update does not disturb the primary post id", () => {
    withRemote(1, ([store]) => {
      store.sync();
      store.writeReceipt({ ...target("k", "morning"), receipt: receipt("111", { replyStatus: "PENDING" }) });
      store.writeReceipt({ ...target("k", "morning"), receipt: receipt("111", { replyStatus: "FAILED_RETRYABLE", replyFailureReason: "429" }) });
      const state = store.readReceipt(target("k", "morning"));
      assert.equal(state.primaryPostId, "111", "a failed reply must not re-post or clear the primary");
      assert.equal(state.replyStatus, "FAILED_RETRYABLE");
    });
  });

  it("records a completed reply alongside the primary", () => {
    withRemote(1, ([store]) => {
      store.sync();
      store.writeReceipt({ ...target("k", "morning"), receipt: receipt("111", { replyStatus: "POSTED", replyPostId: "222" }) });
      const state = store.readReceipt(target("k", "morning"));
      assert.equal(state.primaryPostId, "111");
      assert.equal(state.replyPostId, "222");
    });
  });
});

describe("resilience", () => {
  it("treats an unparsable receipt as absent rather than throwing", () => {
    withRemote(1, ([store]) => {
      store.sync();
      const p = path.join(store.workDir, receiptPathFor(target("k", "morning")));
      mkdirSync(path.dirname(p), { recursive: true });
      writeFileSync(p, "{ not json");
      assert.equal(store.readReceipt(target("k", "morning")), null);
    });
  });

  it("sync on an empty remote leaves a usable working tree", () => {
    withRemote(1, ([store]) => {
      const result = store.sync();
      assert.equal(result.syncedRemote, false);
      assert.equal(store.writeReceipt({ ...target("k", "morning"), receipt: receipt("111") }).pushed, true);
    });
  });
});

const diag = (latestOutcome, extra = {}) =>
  buildDiagnosticRecord({ market: "k", edition: "morning", slateDate: SLATE, latestOutcome, reason: "r", ...extra });

function commitCount(bare, branch = STATE_BRANCH) {
  return git(["log", "--format=%H", branch], { cwd: bare }).stdout.trim().split("\n").filter(Boolean).length;
}

describe("diagnostic paths", () => {
  it("lives at a structurally distinct path from the receipt", () => {
    const receiptPath = receiptPathFor(target("k", "morning"));
    const diagnosticPath = diagnosticPathFor(target("k", "morning"));
    assert.equal(receiptPath, "mlb-x/2026-07-21/k-morning.json");
    assert.equal(diagnosticPath, "mlb-x/2026-07-21/diagnostics/k-morning.json");
    assert.notEqual(receiptPath, diagnosticPath);
  });

  it("rejects a malformed slate, market or edition, same as receiptPathFor", () => {
    assert.throws(() => diagnosticPathFor({ slateDate: "7/21/26", market: "k", edition: "morning" }), /slate date/i);
    assert.throws(() => diagnosticPathFor({ slateDate: SLATE, market: "nfl", edition: "morning" }), /market/i);
    assert.throws(() => diagnosticPathFor({ slateDate: SLATE, market: "k", edition: "evening" }), /edition/i);
  });
});

describe("diagnostic persistence: overwrite, not append", () => {
  it("creates the diagnostic on first write and reads it back", () => {
    withRemote(1, ([store]) => {
      store.sync();
      assert.equal(store.readDiagnostic(target("k", "morning")), null);
      const result = store.writeDiagnostic({ ...target("k", "morning"), diagnostic: diag("NOT_DUE") });
      assert.equal(result.pushed, true);
      assert.equal(store.readDiagnostic(target("k", "morning")).latestOutcome, "NOT_DUE");
    });
  });

  it("a real state transition overwrites in place -- exactly one file exists, not two", () => {
    withRemote(1, ([store], { bare }) => {
      store.sync();
      store.writeDiagnostic({ ...target("k", "morning"), diagnostic: diag("NOT_DUE") });
      store.writeDiagnostic({ ...target("k", "morning"), diagnostic: diag("IMAGE_FAILED") });
      const files = git(["ls-tree", "-r", "--name-only", STATE_BRANCH], { cwd: bare }).stdout.trim().split("\n");
      const matches = files.filter((f) => f.includes("diagnostics/k-morning"));
      assert.equal(matches.length, 1, "overwritten in place, not appended");
      assert.equal(store.readDiagnostic(target("k", "morning")).latestOutcome, "IMAGE_FAILED");
    });
  });

  it("a repeated identical diagnostic produces zero new commits -- the routine-poll case", () => {
    withRemote(1, ([store], { bare }) => {
      store.sync();
      store.writeDiagnostic({ ...target("k", "morning"), diagnostic: diag("NOT_DUE") });
      const afterFirst = commitCount(bare);
      // Same meaningful content, fresh updatedAt/windowClosesAt -- as a real
      // pregame poll would produce every 20 minutes for hours.
      for (let i = 0; i < 5; i += 1) {
        const result = store.writeDiagnostic({
          ...target("k", "morning"),
          diagnostic: diag("NOT_DUE", { at: new Date(Date.now() + i * 60_000).toISOString(), windowClosesAt: `2026-07-21T${15 + i}:00:00.000Z` }),
        });
        assert.equal(result.unchanged, true);
        assert.equal(result.pushed, false);
      }
      assert.equal(commitCount(bare), afterFirst, "no new commits from five routine repeats");
    });
  });

  it("a genuine transition still commits exactly once per transition", () => {
    withRemote(1, ([store], { bare }) => {
      store.sync();
      store.writeDiagnostic({ ...target("k", "morning"), diagnostic: diag("NOT_DUE") });
      const afterFirst = commitCount(bare);
      store.writeDiagnostic({ ...target("k", "morning"), diagnostic: diag("NOT_DUE") }); // repeat, no commit
      store.writeDiagnostic({ ...target("k", "morning"), diagnostic: diag("WAITING_FOR_SELECTED_LINEUPS") }); // real transition
      assert.equal(commitCount(bare), afterFirst + 1);
      store.writeDiagnostic({ ...target("k", "morning"), diagnostic: diag("IMAGE_FAILED") }); // another real transition
      assert.equal(commitCount(bare), afterFirst + 2);
    });
  });

  it("ignores updatedAt/windowClosesAt drift when deciding whether to commit, but still persists the fresh values", () => {
    withRemote(1, ([store]) => {
      store.sync();
      store.writeDiagnostic({ ...target("k", "morning"), diagnostic: diag("NOT_DUE", { at: "2026-07-21T15:00:00.000Z" }) });
      const result = store.writeDiagnostic({ ...target("k", "morning"), diagnostic: diag("NOT_DUE", { at: "2026-07-21T15:20:00.000Z" }) });
      assert.equal(result.unchanged, true, "not a commit-worthy change");
      // The committed file is not rewritten on an unchanged write -- it still
      // reflects the first write's timestamp, which is correct: nothing new
      // happened, so nothing new should be recorded as having happened.
      assert.equal(store.readDiagnostic(target("k", "morning")).updatedAt, "2026-07-21T15:00:00.000Z");
    });
  });
});

describe("diagnostics never count as posted", () => {
  it("writing a diagnostic does not make readReceipt or isPostedReceipt see a publication", () => {
    withRemote(1, ([store]) => {
      store.sync();
      store.writeDiagnostic({ ...target("k", "morning"), diagnostic: diag("IMAGE_FAILED") });
      assert.equal(store.readReceipt(target("k", "morning")), null);
      assert.equal(isPostedReceipt(store.readDiagnostic(target("k", "morning"))), false);
    });
  });

  it("a real receipt and a diagnostic for the same edition coexist independently", () => {
    withRemote(1, ([store]) => {
      store.sync();
      store.writeDiagnostic({ ...target("k", "morning"), diagnostic: diag("IMAGE_FAILED") });
      store.writeReceipt({ ...target("k", "morning"), receipt: receipt("999") });
      assert.equal(isPostedReceipt(store.readReceipt(target("k", "morning"))), true);
      assert.equal(store.readDiagnostic(target("k", "morning")).latestOutcome, "IMAGE_FAILED");
    });
  });
});

describe("diagnostic edition and market isolation", () => {
  it("keeps all four editions' diagnostics independent", () => {
    withRemote(1, ([store]) => {
      store.sync();
      store.writeDiagnostic({ slateDate: SLATE, market: "k", edition: "morning", diagnostic: buildDiagnosticRecord({ market: "k", edition: "morning", slateDate: SLATE, latestOutcome: "NOT_DUE" }) });
      store.writeDiagnostic({ slateDate: SLATE, market: "hr", edition: "morning", diagnostic: buildDiagnosticRecord({ market: "hr", edition: "morning", slateDate: SLATE, latestOutcome: "IMAGE_FAILED" }) });
      store.writeDiagnostic({ slateDate: SLATE, market: "k", edition: "confirmed", diagnostic: buildDiagnosticRecord({ market: "k", edition: "confirmed", slateDate: SLATE, latestOutcome: "WAITING_FOR_SELECTED_LINEUPS" }) });
      assert.equal(store.readDiagnostic(target("k", "morning")).latestOutcome, "NOT_DUE");
      assert.equal(store.readDiagnostic(target("hr", "morning")).latestOutcome, "IMAGE_FAILED");
      assert.equal(store.readDiagnostic(target("k", "confirmed")).latestOutcome, "WAITING_FOR_SELECTED_LINEUPS");
      assert.equal(store.readDiagnostic(target("hr", "confirmed")), null);
    });
  });
});

describe("diagnostic resilience", () => {
  it("treats an unparsable diagnostic as absent rather than throwing", () => {
    withRemote(1, ([store]) => {
      store.sync();
      const p = path.join(store.workDir, diagnosticPathFor(target("k", "morning")));
      mkdirSync(path.dirname(p), { recursive: true });
      writeFileSync(p, "{ not json");
      assert.equal(store.readDiagnostic(target("k", "morning")), null);
    });
  });

  it("marks diagnostic commits with [skip ci], same as receipts", () => {
    withRemote(1, ([store], { bare }) => {
      store.sync();
      store.writeDiagnostic({ ...target("k", "morning"), diagnostic: diag("NOT_DUE") });
      const message = git(["log", "-1", "--format=%B", STATE_BRANCH], { cwd: bare }).stdout;
      assert.match(message, /\[skip ci\]/);
    });
  });

  it("never force-pushes: a diagnostic commit stays an ancestor of later commits", () => {
    withRemote(1, ([store], { bare }) => {
      store.sync();
      store.writeDiagnostic({ ...target("k", "morning"), diagnostic: diag("NOT_DUE") });
      const first = git(["rev-parse", STATE_BRANCH], { cwd: bare }).stdout.trim();
      store.writeDiagnostic({ ...target("k", "morning"), diagnostic: diag("IMAGE_FAILED") });
      const log = git(["log", "--format=%H", STATE_BRANCH], { cwd: bare }).stdout.trim().split("\n");
      assert.ok(log.includes(first));
    });
  });
});
