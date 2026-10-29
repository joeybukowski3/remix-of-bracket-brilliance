import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SnapshotFreshness } from "@/lib/nba/props/hostedClient";
import SnapshotStatus from "./SnapshotStatus";

const base: SnapshotFreshness = { publishedAtUtc: "2026-10-29T17:30:00Z", publishedAgeHours: 0.5, statisticsRetrievedUtc: "2026-10-28T12:52:37Z", newestLineCaptureUtc: "2026-10-29T17:00:00Z", lineAgeHours: 1, linesStale: false, snapshotStale: false, staleReasons: [], isStale: false };

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

  it("warns about stale odds specifically, and says so before any other line", () => {
    render(<SnapshotStatus freshness={{ ...base, linesStale: true, staleReasons: ["sportsbook lines captured more than 3 hours ago"], isStale: true, lineAgeHours: 9 }} />);
    const status = screen.getByTestId("snapshot-status");
    expect(status.getAttribute("data-stale")).toBe("true");
    expect(status.getAttribute("data-odds-stale")).toBe("true");
    expect(status.textContent).toMatch(/STALE ODDS: these sportsbook lines were captured more than 3 hours ago/);
    expect(status.textContent).not.toMatch(/STALE DATA/);
  });

  it("warns about an old snapshot separately from the odds", () => {
    render(<SnapshotStatus freshness={{ ...base, snapshotStale: true, staleReasons: ["published more than 12 hours ago"], isStale: true, publishedAgeHours: 30 }} />);
    const status = screen.getByTestId("snapshot-status");
    expect(status.getAttribute("data-odds-stale")).toBe("false");
    expect(status.textContent).toMatch(/STALE DATA: this board was published more than 12 hours ago/);
    expect(status.textContent).not.toMatch(/STALE ODDS/);
  });

  it("leaves out the statistics timestamp when the board carries no statistics", () => {
    render(<SnapshotStatus freshness={base} hasStatistics={false} />);
    expect(screen.getByTestId("snapshot-status").textContent).not.toContain("Statistics retrieved");
  });

  it("says plainly when a timestamp is missing", () => {
    render(<SnapshotStatus freshness={{ ...base, statisticsRetrievedUtc: null, newestLineCaptureUtc: null, lineAgeHours: null }} />);
    expect(screen.getByTestId("snapshot-status").textContent).toContain("unknown");
    expect(screen.getByTestId("snapshot-status").textContent).toContain("none on this board");
  });
});
