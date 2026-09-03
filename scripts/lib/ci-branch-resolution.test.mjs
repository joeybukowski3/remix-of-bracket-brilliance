import { describe, expect, it } from "vitest";
import { PRODUCTION_BRANCH, resolveTargetBranch } from "./ci-branch-resolution.mjs";

describe("resolveTargetBranch (branch-aware CI checkout/push fix)", () => {
  it("resolves a workflow_dispatch run on a feature branch to that exact branch", () => {
    expect(
      resolveTargetBranch({ eventName: "workflow_dispatch", refName: "feat/nfl-power-ratings-jkb-heat" }),
    ).toBe("feat/nfl-power-ratings-jkb-heat");
  });

  it("resolves a workflow_dispatch run on main to main", () => {
    expect(resolveTargetBranch({ eventName: "workflow_dispatch", refName: "main" })).toBe("main");
  });

  it("resolves a schedule run to the production branch regardless of ref_name", () => {
    expect(resolveTargetBranch({ eventName: "schedule", refName: "main" })).toBe(PRODUCTION_BRANCH);
    expect(resolveTargetBranch({ eventName: "schedule", refName: "" })).toBe(PRODUCTION_BRANCH);
  });

  it("fails closed on a workflow_dispatch run with no ref_name", () => {
    expect(() => resolveTargetBranch({ eventName: "workflow_dispatch", refName: "" })).toThrow();
    expect(() => resolveTargetBranch({ eventName: "workflow_dispatch", refName: undefined })).toThrow();
  });

  it("fails closed on an unrecognized event instead of guessing a branch", () => {
    expect(() => resolveTargetBranch({ eventName: "push", refName: "main" })).toThrow(/unsupported event_name/);
  });
});
