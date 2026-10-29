import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SnapshotFreshness } from "@/lib/nba/props/hostedClient";
import SnapshotStatus from "./SnapshotStatus";

const base: SnapshotFreshness = { publishedAtUtc: "2026-10-29T17:30:00Z", publishedAgeHours: 0.5, statisticsRetrievedUtc: "2026-10-28T12:52:37Z", newestLineCaptureUtc: "2026-10-29T17:00:00Z", lineAgeHours: 1, staleReasons: [], isStale: false };

describe("SnapshotStatus", () => {
  it("shows the three source timestamps and no warning while fresh", () => {
    render(<SnapshotStatus freshness={base} />);
    const status = screen.getByTestId("snapshot-status");
    expect(status.getAttribute("data-stale")).toBe("false");
    expect(status.textContent).toContain("2026-10-29 17:30 UTC");
    expect(status.textContent).toContain("2026-10-28 12:52 UTC");
    expect(status.textContent).toContain("2026-10-29 17:00 UTC (1 h ago)");
    expect(status.textContent).not.toMatch(/STALE/);
  });

  it("states the stale reasons prominently", () => {
    render(<SnapshotStatus freshness={{ ...base, staleReasons: ["published more than 12 hours ago"], isStale: true, publishedAgeHours: 30 }} />);
    const status = screen.getByTestId("snapshot-status");
    expect(status.getAttribute("data-stale")).toBe("true");
    expect(status.textContent).toMatch(/STALE SNAPSHOT: published more than 12 hours ago/);
  });

  it("says plainly when a timestamp is missing", () => {
    render(<SnapshotStatus freshness={{ ...base, statisticsRetrievedUtc: null, newestLineCaptureUtc: null, lineAgeHours: null }} />);
    expect(screen.getByTestId("snapshot-status").textContent).toContain("unknown");
    expect(screen.getByTestId("snapshot-status").textContent).toContain("none on this board");
  });
});
