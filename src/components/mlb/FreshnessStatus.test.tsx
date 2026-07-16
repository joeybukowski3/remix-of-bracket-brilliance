import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MlbDataStatus } from "@/lib/mlb/mlbDataStatus";
import { FreshnessStatus } from "./FreshnessStatus";

const LOADING: MlbDataStatus = { kind: "loading" };

const CURRENT_WITH_TIMESTAMP: MlbDataStatus = {
  kind: "current",
  slateDate: "2026-07-16",
  generatedAt: "2026-07-16T09:32:34.452Z",
};

const CURRENT_NO_TIMESTAMP: MlbDataStatus = { kind: "current", slateDate: "2026-07-16" };

const CURRENT_INVALID_TIMESTAMP: MlbDataStatus = {
  kind: "current",
  slateDate: "2026-07-16",
  generatedAt: "not-a-real-timestamp",
};

const LINEUP_PENDING_MIXED: MlbDataStatus = {
  kind: "lineup-pending",
  slateDate: "2026-07-16",
  confirmedCount: 3,
  totalCount: 8,
};

const LINEUP_PENDING_ZERO: MlbDataStatus = {
  kind: "lineup-pending",
  slateDate: "2026-07-16",
  confirmedCount: 0,
  totalCount: 5,
};

const LINEUP_PENDING_ONE_TOTAL: MlbDataStatus = {
  kind: "lineup-pending",
  slateDate: "2026-07-16",
  confirmedCount: 0,
  totalCount: 1,
};

const LINEUP_PENDING_ONE_TOTAL_CONFIRMED: MlbDataStatus = {
  kind: "lineup-pending",
  slateDate: "2026-07-16",
  confirmedCount: 1,
  totalCount: 1,
};

const WAITING_FOR_SLATE: MlbDataStatus = {
  kind: "waiting-for-slate",
  slateDate: "2026-07-16",
  nextRunAt: { time: "2026-07-16T13:00:00-04:00", label: "1:00 PM ET" },
};

const NO_GAMES_VALID_DATE: MlbDataStatus = { kind: "no-games-scheduled", slateDate: "2026-07-16" };
const NO_GAMES_INVALID_DATE: MlbDataStatus = { kind: "no-games-scheduled", slateDate: "not-a-date" };

const STALE_PAST: MlbDataStatus = {
  kind: "stale",
  slateDate: "2026-07-10",
  todayEt: "2026-07-16",
  direction: "past",
};

const STALE_FUTURE: MlbDataStatus = {
  kind: "stale",
  slateDate: "2026-07-20",
  todayEt: "2026-07-16",
  direction: "future",
};

const UNAVAILABLE: MlbDataStatus = { kind: "unavailable" };

const ERROR_NO_DATA_WITH_MESSAGE: MlbDataStatus = {
  kind: "error",
  message: "HTTP 500",
  hasLastKnownData: false,
};

const ERROR_NO_DATA_EMPTY_MESSAGE: MlbDataStatus = {
  kind: "error",
  message: "",
  hasLastKnownData: false,
};

const ERROR_WITH_DATA: MlbDataStatus = {
  kind: "error",
  message: "HTTP 500",
  hasLastKnownData: true,
  slateDate: "2026-07-16",
  generatedAt: "2026-07-16T09:32:34.452Z",
};

const ERROR_WITH_DATA_NO_METADATA: MlbDataStatus = {
  kind: "error",
  message: "HTTP 500",
  hasLastKnownData: true,
};

const ALL_VARIANTS: MlbDataStatus[] = [
  LOADING,
  CURRENT_WITH_TIMESTAMP,
  LINEUP_PENDING_MIXED,
  WAITING_FOR_SLATE,
  NO_GAMES_VALID_DATE,
  STALE_PAST,
  STALE_FUTURE,
  UNAVAILABLE,
  ERROR_NO_DATA_WITH_MESSAGE,
  ERROR_WITH_DATA,
];

describe("FreshnessStatus — loading", () => {
  it("1. renders loading primary and secondary text", () => {
    render(<FreshnessStatus status={LOADING} />);
    expect(screen.getByText("Loading MLB model data")).toBeInTheDocument();
    expect(screen.getByText("Checking the latest available slate.")).toBeInTheDocument();
  });

  it('2. uses role="status"', () => {
    render(<FreshnessStatus status={LOADING} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("3. loading icon is decorative", () => {
    const { container } = render(<FreshnessStatus status={LOADING} />);
    const icon = container.querySelector("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("4. compact mode still says loading", () => {
    render(<FreshnessStatus status={LOADING} compact />);
    expect(screen.getByText("Loading MLB model data")).toBeInTheDocument();
  });
});

describe("FreshnessStatus — current", () => {
  it("5. valid generatedAt is formatted in ET", () => {
    render(<FreshnessStatus status={CURRENT_WITH_TIMESTAMP} />);
    expect(screen.getByText(/Model updated .+ ET\.$/)).toBeInTheDocument();
  });

  it("6. missing generatedAt uses fallback copy", () => {
    render(<FreshnessStatus status={CURRENT_NO_TIMESTAMP} />);
    expect(screen.getByText("Model data is available for today’s slate.")).toBeInTheDocument();
  });

  it("7. invalid generatedAt does not throw or show raw input", () => {
    expect(() => render(<FreshnessStatus status={CURRENT_INVALID_TIMESTAMP} />)).not.toThrow();
    expect(screen.getByText("Model data is available for today’s slate.")).toBeInTheDocument();
    expect(screen.queryByText(/not-a-real-timestamp/)).toBeNull();
  });

  it("8. uses positive visual treatment", () => {
    const { container } = render(<FreshnessStatus status={CURRENT_WITH_TIMESTAMP} />);
    expect(container.querySelector('[data-tone="positive"]')).toBeInTheDocument();
  });

  it('9. does not use "Live" or "real-time"', () => {
    const { container } = render(<FreshnessStatus status={CURRENT_WITH_TIMESTAMP} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\blive\b/i);
    expect(text).not.toMatch(/real[- ]time/i);
  });
});

describe("FreshnessStatus — lineup pending", () => {
  it("10. mixed confirmation count renders correctly", () => {
    render(<FreshnessStatus status={LINEUP_PENDING_MIXED} />);
    expect(screen.getByText("3 of 8 listed batters are confirmed.")).toBeInTheDocument();
  });

  it("11. zero confirmed wording is correct", () => {
    render(<FreshnessStatus status={LINEUP_PENDING_ZERO} />);
    expect(screen.getByText("None of the 5 listed batters are confirmed yet.")).toBeInTheDocument();
  });

  it("12. one total batter uses correct grammar", () => {
    render(<FreshnessStatus status={LINEUP_PENDING_ONE_TOTAL} />);
    expect(screen.getByText("The listed batter is not confirmed yet.")).toBeInTheDocument();
  });

  it("12b. one total batter, confirmed, uses correct singular grammar", () => {
    render(<FreshnessStatus status={LINEUP_PENDING_ONE_TOTAL_CONFIRMED} />);
    expect(screen.getByText("The listed batter is confirmed.")).toBeInTheDocument();
  });

  it("13. uses informational semantics, not alert", () => {
    render(<FreshnessStatus status={LINEUP_PENDING_MIXED} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("14. compact mode retains counts", () => {
    render(<FreshnessStatus status={LINEUP_PENDING_MIXED} compact />);
    expect(screen.getByText("3 of 8 listed batters are confirmed.")).toBeInTheDocument();
  });
});

describe("FreshnessStatus — waiting for slate", () => {
  it("15. displays nextRunAt.label", () => {
    render(<FreshnessStatus status={WAITING_FOR_SLATE} />);
    expect(screen.getByText("Next scheduled update: 1:00 PM ET.")).toBeInTheDocument();
  });

  it("16. does not expose raw nextRunAt.time", () => {
    const { container } = render(<FreshnessStatus status={WAITING_FOR_SLATE} />);
    expect(container.textContent).not.toContain("2026-07-16T13:00:00-04:00");
  });

  it("17. uses neutral status semantics", () => {
    const { container } = render(<FreshnessStatus status={WAITING_FOR_SLATE} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(container.querySelector('[data-tone="neutral"]')).toBeInTheDocument();
  });
});

describe("FreshnessStatus — no games scheduled", () => {
  it("18. valid slate date formats correctly", () => {
    render(<FreshnessStatus status={NO_GAMES_VALID_DATE} />);
    expect(screen.getByText("No games are available for the July 16, 2026 slate.")).toBeInTheDocument();
  });

  it('19. invalid slate date uses "selected slate"', () => {
    render(<FreshnessStatus status={NO_GAMES_INVALID_DATE} />);
    expect(screen.getByText("No games are available for the the selected slate.")).toBeInTheDocument();
  });

  it("20. does not claim definitively that MLB has no games", () => {
    render(<FreshnessStatus status={NO_GAMES_VALID_DATE} />);
    expect(screen.getByText("No MLB games currently listed")).toBeInTheDocument();
    expect(screen.queryByText(/no games today/i)).toBeNull();
  });
});

describe("FreshnessStatus — stale past", () => {
  it("21. says earlier slate", () => {
    render(<FreshnessStatus status={STALE_PAST} />);
    expect(screen.getByText("Showing an earlier MLB slate")).toBeInTheDocument();
  });

  it("22. formats date", () => {
    render(<FreshnessStatus status={STALE_PAST} />);
    expect(screen.getByText("This data is for July 10, 2026, not today’s slate.")).toBeInTheDocument();
  });

  it("23. uses caution styling", () => {
    const { container } = render(<FreshnessStatus status={STALE_PAST} />);
    expect(container.querySelector('[data-tone="caution"]')).toBeInTheDocument();
  });

  it("24. uses polite status semantics", () => {
    render(<FreshnessStatus status={STALE_PAST} />);
    const el = screen.getByRole("status");
    expect(el).toHaveAttribute("aria-live", "polite");
  });
});

describe("FreshnessStatus — stale future", () => {
  it("25. says future slate", () => {
    render(<FreshnessStatus status={STALE_FUTURE} />);
    expect(screen.getByText("Showing a future MLB slate")).toBeInTheDocument();
  });

  it("26. does not say earlier slate", () => {
    render(<FreshnessStatus status={STALE_FUTURE} />);
    expect(screen.queryByText(/earlier MLB slate/)).toBeNull();
  });

  it("27. formats date", () => {
    render(<FreshnessStatus status={STALE_FUTURE} />);
    expect(screen.getByText("This data is for July 20, 2026, not today’s slate.")).toBeInTheDocument();
  });
});

describe("FreshnessStatus — unavailable", () => {
  it('28. uses role="alert"', () => {
    render(<FreshnessStatus status={UNAVAILABLE} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("29. uses assertive live region", () => {
    render(<FreshnessStatus status={UNAVAILABLE} />);
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
  });

  it("30. displays blocking unavailable copy", () => {
    render(<FreshnessStatus status={UNAVAILABLE} />);
    expect(screen.getByText("MLB model data unavailable")).toBeInTheDocument();
    expect(screen.getByText("The current model payload could not be used.")).toBeInTheDocument();
  });

  it("31. compact mode remains meaningful", () => {
    render(<FreshnessStatus status={UNAVAILABLE} compact />);
    expect(screen.getByText("MLB model data unavailable")).toBeInTheDocument();
    expect(screen.getByText("The current model payload could not be used.")).toBeInTheDocument();
  });
});

describe("FreshnessStatus — error without retained data", () => {
  it('32. uses role="alert"', () => {
    render(<FreshnessStatus status={ERROR_NO_DATA_WITH_MESSAGE} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("33. displays the provided safe error message", () => {
    render(<FreshnessStatus status={ERROR_NO_DATA_WITH_MESSAGE} />);
    expect(screen.getByText("Unable to load MLB model data")).toBeInTheDocument();
    expect(screen.getByText("HTTP 500")).toBeInTheDocument();
  });

  it("34. empty message uses fallback", () => {
    render(<FreshnessStatus status={ERROR_NO_DATA_EMPTY_MESSAGE} />);
    expect(screen.getByText("Please try again after the next scheduled update.")).toBeInTheDocument();
  });

  it("35. does not mention retained data", () => {
    render(<FreshnessStatus status={ERROR_NO_DATA_WITH_MESSAGE} />);
    expect(screen.queryByText(/previously loaded/i)).toBeNull();
    expect(screen.queryByText(/remains visible/i)).toBeNull();
  });
});

describe("FreshnessStatus — error with retained data", () => {
  it('36. uses role="status", not alert', () => {
    render(<FreshnessStatus status={ERROR_WITH_DATA} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("37. states previously loaded data remains visible", () => {
    render(<FreshnessStatus status={ERROR_WITH_DATA} />);
    expect(screen.getByText(/Previously loaded data remains visible\./)).toBeInTheDocument();
  });

  it("38. warns it may not reflect the latest update", () => {
    render(<FreshnessStatus status={ERROR_WITH_DATA} />);
    expect(screen.getByText(/It may no longer reflect the latest update\./)).toBeInTheDocument();
  });

  it("39. includes slate/generated metadata only if helpful and safely formatted", () => {
    const withMetadata = render(<FreshnessStatus status={ERROR_WITH_DATA} />);
    expect(withMetadata.getByText(/July 16, 2026/)).toBeInTheDocument();
    expect(withMetadata.getByText(/ET\./)).toBeInTheDocument();
    withMetadata.unmount();

    const withoutMetadata = render(<FreshnessStatus status={ERROR_WITH_DATA_NO_METADATA} />);
    expect(
      withoutMetadata.getByText("Previously loaded data remains visible. It may no longer reflect the latest update."),
    ).toBeInTheDocument();
    withoutMetadata.unmount();
  });

  it("40. compact mode retains the retained-data warning", () => {
    render(<FreshnessStatus status={ERROR_WITH_DATA} compact />);
    expect(screen.getByText(/Previously loaded data remains visible\./)).toBeInTheDocument();
  });
});

describe("FreshnessStatus — general behavior", () => {
  it("41. className is merged", () => {
    const { container } = render(<FreshnessStatus status={LOADING} className="custom-marker" />);
    expect(container.querySelector(".custom-marker")).toBeInTheDocument();
  });

  it("42. no variant is icon-only", () => {
    for (const status of ALL_VARIANTS) {
      const { unmount, container } = render(<FreshnessStatus status={status} />);
      const textContent = container.textContent?.trim() ?? "";
      expect(textContent.length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("43. all icons are aria-hidden", () => {
    for (const status of ALL_VARIANTS) {
      const { unmount, container } = render(<FreshnessStatus status={status} />);
      const icon = container.querySelector("svg");
      expect(icon).toHaveAttribute("aria-hidden", "true");
      unmount();
    }
  });

  it('44. aria-atomic="true" exists', () => {
    for (const status of ALL_VARIANTS) {
      const { unmount } = render(<FreshnessStatus status={status} />);
      const el = screen.getByRole(status.kind === "unavailable" || (status.kind === "error" && !status.hasLastKnownData) ? "alert" : "status");
      expect(el).toHaveAttribute("aria-atomic", "true");
      unmount();
    }
  });

  it("45. component does not mutate a frozen status object", () => {
    const frozen = Object.freeze({ ...LINEUP_PENDING_MIXED });
    expect(() => render(<FreshnessStatus status={frozen} />)).not.toThrow();
    expect(frozen).toEqual(LINEUP_PENDING_MIXED);
  });

  it("46. every variant renders without throwing", () => {
    const every: MlbDataStatus[] = [
      LOADING,
      CURRENT_WITH_TIMESTAMP,
      CURRENT_NO_TIMESTAMP,
      CURRENT_INVALID_TIMESTAMP,
      LINEUP_PENDING_MIXED,
      LINEUP_PENDING_ZERO,
      LINEUP_PENDING_ONE_TOTAL,
      WAITING_FOR_SLATE,
      NO_GAMES_VALID_DATE,
      NO_GAMES_INVALID_DATE,
      STALE_PAST,
      STALE_FUTURE,
      UNAVAILABLE,
      ERROR_NO_DATA_WITH_MESSAGE,
      ERROR_NO_DATA_EMPTY_MESSAGE,
      ERROR_WITH_DATA,
      ERROR_WITH_DATA_NO_METADATA,
    ];
    every.forEach((status, index) => {
      expect(() => {
        const { unmount } = render(<FreshnessStatus status={status} compact={index % 2 === 0} />);
        unmount();
      }).not.toThrow();
    });
  });

  it("47. no raw invalid ISO timestamp appears", () => {
    const { container } = render(<FreshnessStatus status={CURRENT_INVALID_TIMESTAMP} />);
    expect(container.textContent).not.toContain("not-a-real-timestamp");
  });

  it("48. no raw invalid slate date appears", () => {
    const { container } = render(<FreshnessStatus status={NO_GAMES_INVALID_DATE} />);
    expect(container.textContent).not.toContain("not-a-date");
  });

  it('49. no banned "Live Slate" wording appears', () => {
    for (const status of ALL_VARIANTS) {
      const { unmount, container } = render(<FreshnessStatus status={status} />);
      expect(container.textContent).not.toMatch(/live slate/i);
      unmount();
    }
  });

  it("50. no odds, confidence, edge, EV, or betting recommendation wording appears", () => {
    for (const status of ALL_VARIANTS) {
      const { unmount, container } = render(<FreshnessStatus status={status} />);
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/\bodds\b/i);
      expect(text).not.toMatch(/\bconfidence\b/i);
      expect(text).not.toMatch(/\bedge\b/i);
      expect(text).not.toMatch(/\bEV\b/);
      expect(text).not.toMatch(/\bbet\b/i);
      unmount();
    }
  });
});
