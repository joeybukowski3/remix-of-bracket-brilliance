import { describe, expect, it } from "vitest";
import { FANTASY_RANKINGS } from "@/lib/fantasy/rankings";

describe("2026 ROS ADP authority audit", () => {
  it("does not reinterpret the workbook mock-draft slots as consensus ADP", () => {
    expect(FANTASY_RANKINGS.rows.some((row) => row.draftRound != null && row.roundPick != null)).toBe(true);
    expect(FANTASY_RANKINGS.rows.every((row) => row.adp == null)).toBe(true);
  });
});

