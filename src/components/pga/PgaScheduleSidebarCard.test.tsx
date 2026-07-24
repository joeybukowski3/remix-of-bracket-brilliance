import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import PgaScheduleSidebarCard from "./PgaScheduleSidebarCard";
import type { PgaScheduleFeedEntry } from "./PgaHubShared";

const REFERENCE_DATE = "2026-07-23";

function entry(overrides: Partial<PgaScheduleFeedEntry> & { id: string; startDate: string }): PgaScheduleFeedEntry {
  return {
    slug: `${overrides.id}-slug`,
    name: overrides.id,
    shortName: overrides.id,
    courseName: "Course",
    location: "Somewhere",
    endDate: overrides.startDate,
    dateLabel: `Week of ${overrides.startDate}`,
    eventType: "standard",
    category: "standard",
    status: "scheduled",
    winner: "",
    dataFile: "data.json",
    sourceTour: "pga",
    sourceCountry: "USA",
    ...overrides,
  } as PgaScheduleFeedEntry;
}

const SCHEDULE: PgaScheduleFeedEntry[] = [
  entry({ id: "3M Open", startDate: "2026-07-23", endDate: "2026-07-26" }),
  entry({ id: "Rocket Classic", startDate: "2026-07-30", endDate: "2026-08-02" }),
  entry({ id: "Wyndham Championship", startDate: "2026-08-06", endDate: "2026-08-09" }),
  entry({ id: "FedEx St. Jude", startDate: "2026-08-13", endDate: "2026-08-16" }),
];

function renderCard() {
  return render(
    <MemoryRouter>
      <PgaScheduleSidebarCard schedule={SCHEDULE} today={REFERENCE_DATE} activeEventId="3M Open" />
    </MemoryRouter>,
  );
}

describe("PgaScheduleSidebarCard", () => {
  it("shows only the current-week and following-week tournaments by default", () => {
    renderCard();

    expect(screen.getByText("3M Open")).toBeInTheDocument();
    expect(screen.getByText("Rocket Classic")).toBeInTheDocument();
    expect(screen.queryByText("Wyndham Championship")).not.toBeInTheDocument();
    expect(screen.queryByText("FedEx St. Jude")).not.toBeInTheDocument();
  });

  it("exposes an accessible collapsed control", () => {
    renderCard();

    const toggle = screen.getByRole("button", { name: "View full schedule" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls");
  });

  it("reveals the full schedule and flips aria-expanded when expanded", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "View full schedule" }));

    const toggle = screen.getByRole("button", { name: "Hide full schedule" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    SCHEDULE.forEach((scheduled) => expect(screen.getByText(scheduled.shortName)).toBeInTheDocument());
  });

  it("keeps every schedule link available when expanded", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "View full schedule" }));

    const links = screen.getAllByRole("link", { name: /View model/ });
    expect(links).toHaveLength(SCHEDULE.length);
    SCHEDULE.forEach((scheduled) => {
      expect(links.some((link) => link.getAttribute("href") === `/pga/${scheduled.slug}/model`)).toBe(true);
    });
  });

  it("collapses again via Hide full schedule", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "View full schedule" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide full schedule" }));

    expect(screen.getByRole("button", { name: "View full schedule" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Wyndham Championship")).not.toBeInTheDocument();
  });

  it("keeps the toggle keyboard operable as a native button", () => {
    renderCard();

    const toggle = screen.getByRole("button", { name: "View full schedule" });
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle).toHaveAttribute("type", "button");
    toggle.focus();
    expect(toggle).toHaveFocus();
  });

  it("emphasises the current and next weeks", () => {
    const { container } = renderCard();

    expect(container.querySelectorAll(".font-black").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps a tournament already underway as the current week", () => {
    render(
      <MemoryRouter>
        {/* Mid-tournament: 3M Open started on the 23rd and ends on the 26th. */}
        <PgaScheduleSidebarCard schedule={SCHEDULE} today="2026-07-24" />
      </MemoryRouter>,
    );

    expect(screen.getByText("3M Open")).toBeInTheDocument();
    expect(screen.getByText("Rocket Classic")).toBeInTheDocument();
    expect(screen.queryByText("Wyndham Championship")).not.toBeInTheDocument();
  });

  it("hides the control when there is nothing beyond the next two weeks", () => {
    render(
      <MemoryRouter>
        <PgaScheduleSidebarCard schedule={SCHEDULE.slice(0, 2)} today={REFERENCE_DATE} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("button", { name: /full schedule/ })).not.toBeInTheDocument();
  });

  it("does not drop future events from the underlying data when collapsed", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "View full schedule" }));
    expect(screen.getAllByRole("link", { name: /View model/ })).toHaveLength(SCHEDULE.length);
  });
});
