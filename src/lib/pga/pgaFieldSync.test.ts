import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { selectLocalTarget } from "../../../scripts/lib/pga-field-selection.mjs";
import { checkFieldSync } from "../../../scripts/check-pga-field-sync.mjs";

const ROOT = resolve(__dirname, "../../..");
const REAL_SCHEDULE = JSON.parse(readFileSync(join(ROOT, "public/data/pga/schedule.json"), "utf-8"));
const REAL_FIELD = JSON.parse(readFileSync(join(ROOT, "public/data/pga/current-field.json"), "utf-8"));

const FIXTURE_SCHEDULE = [
  { id: "john-deere-classic-2026", name: "John Deere Classic", startDate: "2026-07-02", endDate: "2026-07-05", eventType: "regular" },
  { id: "genesis-scottish-open-2026", name: "Genesis Scottish Open", startDate: "2026-07-09", endDate: "2026-07-12", eventType: "regular" },
  { id: "alt-event-2026", name: "Alternate Event", startDate: "2026-07-09", endDate: "2026-07-12", eventType: "Alternate Field" },
];

describe("selectLocalTarget (tournament rollover)", () => {
  it("selects the active tournament during its date range", () => {
    expect(selectLocalTarget(FIXTURE_SCHEDULE, "2026-07-03").id).toBe("john-deere-classic-2026");
    expect(selectLocalTarget(FIXTURE_SCHEDULE, "2026-07-05").id).toBe("john-deere-classic-2026");
  });

  it("rolls over to the next tournament the day after the previous one ends", () => {
    expect(selectLocalTarget(FIXTURE_SCHEDULE, "2026-07-06").id).toBe("genesis-scottish-open-2026");
    expect(selectLocalTarget(FIXTURE_SCHEDULE, "2026-07-07").id).toBe("genesis-scottish-open-2026");
  });

  it("skips alternate-field events", () => {
    const altOnly = FIXTURE_SCHEDULE.filter((e) => e.id !== "genesis-scottish-open-2026");
    expect(() => selectLocalTarget(altOnly, "2026-07-08")).toThrow(/No current or future/);
  });

  it("fails loudly when the season is over or inputs are malformed", () => {
    expect(() => selectLocalTarget(FIXTURE_SCHEDULE, "2027-01-01")).toThrow(/No current or future/);
    expect(() => selectLocalTarget(FIXTURE_SCHEDULE, "yesterday")).toThrow(/ISO date/);
    expect(() => selectLocalTarget({} as never, "2026-07-07")).toThrow(/array/);
  });

  it("selects Genesis Scottish Open from the real schedule for 2026-07-07", () => {
    expect(selectLocalTarget(REAL_SCHEDULE, "2026-07-07").id).toBe("genesis-scottish-open-2026");
  });
});

describe("checkFieldSync guard", () => {
  it("fails loudly when the saved field is last week's tournament", () => {
    const staleField = { tournament: "John Deere Classic", localScheduleId: "john-deere-classic-2026" };
    expect(() => checkFieldSync(FIXTURE_SCHEDULE, staleField, "2026-07-07")).toThrow(/mismatch.*did not roll over/is);
  });

  it("passes when the field matches by schedule id", () => {
    const fresh = { tournament: "Genesis Scottish Open", localScheduleId: "genesis-scottish-open-2026" };
    expect(checkFieldSync(FIXTURE_SCHEDULE, fresh, "2026-07-07").idMatch).toBe(true);
  });

  it("passes on name aliases (The-prefix, punctuation, status suffixes)", () => {
    const aliased = { tournament: "The Genesis Scottish-Open", localScheduleId: null };
    expect(checkFieldSync(FIXTURE_SCHEDULE, aliased, "2026-07-07").nameMatch).toBe(true);
  });

  it("the committed current-field.json matches today's scheduled tournament", () => {
    // Guards this repo's actual data: the regression this PR fixes.
    const result = checkFieldSync(REAL_SCHEDULE, REAL_FIELD, new Date().toISOString().slice(0, 10));
    expect(result.idMatch || result.nameMatch).toBe(true);
  });

  it("the committed field carries freshness metadata", () => {
    expect(Number.isNaN(Date.parse(REAL_FIELD.fetchedAt))).toBe(false);
    expect(REAL_FIELD.validated).toBe(true);
    expect(REAL_FIELD.fieldCount).toBeGreaterThan(100);
    expect(REAL_FIELD.source).toBe("pga-tour-official-field");
  });
});

describe("sync-pga-data workflow guarantees", () => {
  const workflow = readFileSync(join(ROOT, ".github/workflows/sync-pga-data.yml"), "utf-8");

  it("has no runtime hour gate that can silently skip scheduled work", () => {
    // The old gate compared the ET hour to exactly "08"; delayed GitHub cron
    // runs then skipped every step while reporting success.
    expect(workflow).not.toContain("should_run");
    expect(workflow).not.toMatch(/date \+%H/);
  });

  it("schedules multiple weekly runs to cover tournament rollover", () => {
    const cron = workflow.match(/cron:\s*"([^"]+)"/)?.[1] ?? "";
    const daysField = cron.split(" ")[4] ?? "";
    expect(daysField.split(",").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps manual dispatch, runs the sync guard, and uses the shared data-writer lock", () => {
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("check-pga-field-sync.mjs");
    expect(workflow).toContain("main-data-writers");
  });
});
