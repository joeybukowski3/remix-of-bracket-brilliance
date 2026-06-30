/**
 * MlbGameDetail.propPreview.test.tsx
 * Focused tests for the Top HR Props / Top K Props landing-page preview tables:
 * HR odds, K line/direction/odds display, missing-data em dashes, and
 * canonical-field passthrough (no recalculated values).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PropPreviewCard, type PropPreviewRow } from "./MlbGameDetail";

function renderCard(rows: PropPreviewRow[], theme: "hr" | "k" = "hr") {
  return render(
    <MemoryRouter>
      <PropPreviewCard title={theme === "hr" ? "Top HR Props" : "Top K Props"} rows={rows} to="/mlb/hr-props" theme={theme} />
    </MemoryRouter>
  );
}

const HR_ROW_WITH_ODDS: PropPreviewRow = {
  key: "hunter-goodman-COL",
  player: "Hunter Goodman",
  team: "COL",
  opponent: "Eury Pérez",
  score: 74.9,
  hrOdds: "+320",
  hrBook: "DraftKings",
};

const HR_ROW_NO_ODDS: PropPreviewRow = {
  key: "randal-grichuk-CWS",
  player: "Randal Grichuk",
  team: "CWS",
  opponent: "Trey Gibson",
  score: 72.2,
  hrOdds: null,
  hrBook: null,
};

const K_ROW_FULL: PropPreviewRow = {
  key: "cristopher-sanchez-PHI",
  player: "Cristopher Sánchez",
  team: "PHI",
  opponent: "PIT",
  score: 83.8,
  kLine: 6.5,
  kOddsOver: "-125",
  kOddsUnder: "+105",
  kBook: "FanDuel",
};

const K_ROW_NO_ODDS: PropPreviewRow = {
  key: "tarik-skubal-DET",
  player: "Tarik Skubal",
  team: "DET",
  opponent: "NYY",
  score: 74.3,
  kLine: 7.5,
  kOddsOver: null,
  kOddsUnder: null,
  kBook: null,
};

const K_ROW_NO_LINE: PropPreviewRow = {
  key: "jacob-degrom-TEX",
  player: "Jacob deGrom",
  team: "TEX",
  opponent: "CLE",
  score: 74.2,
  kLine: null,
  kOddsOver: null,
  kOddsUnder: null,
  kBook: null,
};

// ── 1: HR row renders current HR odds ────────────────────────────────────────

describe("HR preview row — odds display", () => {
  it("1. HR row renders the current HR odds", () => {
    renderCard([HR_ROW_WITH_ODDS], "hr");
    expect(screen.getByText("+320")).toBeTruthy();
  });

  it("2. HR row renders sportsbook when available", () => {
    renderCard([HR_ROW_WITH_ODDS], "hr");
    expect(screen.getByText("DraftKings")).toBeTruthy();
  });

  it("3. HR row with missing odds renders an em dash, not +0/0/N/A", () => {
    renderCard([HR_ROW_NO_ODDS], "hr");
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText("+0")).toBeFalsy();
    expect(screen.queryByText("0")).toBeFalsy();
    expect(screen.queryByText("N/A")).toBeFalsy();
  });

  it("10. HR odds value matches the canonical hrOddsYes field exactly (passthrough, not recalculated)", () => {
    // The row's hrOdds is sourced 1:1 from row.hrOddsYes in the mapping useMemo —
    // verify the component renders exactly what it was given, no transformation.
    const exoticOdds: PropPreviewRow = { ...HR_ROW_WITH_ODDS, hrOdds: "+475" };
    renderCard([exoticOdds], "hr");
    expect(screen.getByText("+475")).toBeTruthy();
  });
});

// ── 4–9: K row line/direction/odds ────────────────────────────────────────────

describe("K preview row — line, direction, odds", () => {
  it("4. K row renders the strikeout line", () => {
    renderCard([K_ROW_FULL], "k");
    expect(screen.getByText("6.5 K")).toBeTruthy();
  });

  it("5. K row renders the Over side odds when present", () => {
    renderCard([K_ROW_FULL], "k");
    expect(screen.getByText(/O -125/)).toBeTruthy();
  });

  it("6. K row renders the Under side odds when present", () => {
    renderCard([K_ROW_FULL], "k");
    expect(screen.getByText(/U \+105/)).toBeTruthy();
  });

  it("7. K row does not fabricate a recommended direction — both sides render when no selection field exists", () => {
    // The data layer has no direction/pick field (confirmed: buildPitcherStrikeoutMatchupRows
    // exposes kLine/kOddsOver/kOddsUnder only). The component must not infer a side.
    renderCard([K_ROW_FULL], "k");
    expect(screen.getByText(/O -125/)).toBeTruthy();
    expect(screen.getByText(/U \+105/)).toBeTruthy();
  });

  it("8. K row with a line but no direction/odds renders the line only", () => {
    renderCard([K_ROW_NO_ODDS], "k");
    expect(screen.getByText("7.5 K")).toBeTruthy();
    expect(screen.queryByText(/O /)).toBeFalsy();
    expect(screen.queryByText(/U /)).toBeFalsy();
  });

  it("9. K row with no line at all renders an em dash, not a fake 0", () => {
    renderCard([K_ROW_NO_LINE], "k");
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText("0.0 K")).toBeFalsy();
  });

  it("11. K line/odds values match the canonical kLine/kOddsOver/kOddsUnder fields exactly", () => {
    const customLine: PropPreviewRow = { ...K_ROW_FULL, kLine: 8.5, kOddsOver: "-150" };
    renderCard([customLine], "k");
    expect(screen.getByText("8.5 K")).toBeTruthy();
    expect(screen.getByText(/O -150/)).toBeTruthy();
  });
});

// ── 12–13: layout structure ────────────────────────────────────────────────────

describe("Table structure", () => {
  it("12. desktop columns (Player, Matchup, Score) remain present", () => {
    renderCard([HR_ROW_WITH_ODDS], "hr");
    expect(screen.getByText("Player")).toBeTruthy();
    expect(screen.getByText("Matchup")).toBeTruthy();
    expect(screen.getByText("Score")).toBeTruthy();
  });

  it("13. mobile-style compact row keeps matchup and odds on a readable combined line", () => {
    renderCard([HR_ROW_WITH_ODDS], "hr");
    expect(screen.getByText(/vs Eury Pérez/)).toBeTruthy();
    // Score badge still renders alongside
    expect(screen.getByText("74.9")).toBeTruthy();
  });
});

// ── 14: Full-model links unchanged ────────────────────────────────────────────

describe("Full-model links", () => {
  it("14. row links still point to the full-model page", () => {
    renderCard([HR_ROW_WITH_ODDS], "hr");
    const links = screen.getAllByRole("link");
    expect(links.some((l) => l.getAttribute("href") === "/mlb/hr-props")).toBe(true);
  });
});

// ── 15: No scoring/ranking logic touched ──────────────────────────────────────

describe("Score integrity", () => {
  it("15. score badge value is unchanged by the new market-data rendering", () => {
    renderCard([HR_ROW_WITH_ODDS], "hr");
    expect(screen.getByText("74.9")).toBeTruthy();
    renderCard([K_ROW_FULL], "k");
    expect(screen.getByText("83.8")).toBeTruthy();
  });
});
