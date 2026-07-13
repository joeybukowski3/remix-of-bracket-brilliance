import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow: string = readFileSync(".github/workflows/refresh-pga-player-history.yml", "utf8");

describe("PGA scoped player-history workflow", () => {
  it("supports manual dispatch and one weekly later-Monday schedule", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain('cron: "30 10 * * 1"');
  });

  it("uses the shared main-data-writer concurrency strategy", () => {
    expect(workflow).toContain("group: main-data-writers-${{ github.repository }}");
    expect(workflow).toContain("cancel-in-progress: false");
  });

  it("invokes scoped refresh and offline validation", () => {
    expect(workflow).toContain("npm run pga:refresh-history-scoped --");
    expect(workflow).toContain("npm run pga:validate-history-refresh --");
    expect(workflow).toContain("public/data/pga/next-tournament.json");
    expect(workflow).toContain("--participant-file public/data/pga/current-field.json");
  });

  it("stages only the explicit player-history allowlist and safely no-ops", () => {
    expect(workflow).toContain("git add public/data/pga/player-history.json");
    expect(workflow).not.toMatch(/^\s*git add public\/data\/pga\/?\s*$/m);
    expect(workflow).not.toContain("major-history.json");
    expect(workflow).toContain("git diff --quiet -- public/data/pga/player-history.json");
  });

  it("does not invoke unrelated PGA or non-PGA generators", () => {
    for (const forbidden of ["pga:best-bets", "pga:rankings", "pga:fetch-liv", "pga:fetch-dpwt", "mlb:", "nfl:", "GROK_API_KEY", "ODDS_API_KEY"]) {
      expect(workflow).not.toContain(forbidden);
    }
  });
});
