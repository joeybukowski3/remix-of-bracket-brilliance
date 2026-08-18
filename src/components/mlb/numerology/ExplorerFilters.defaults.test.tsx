import type { ComponentProps } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExplorerFilters } from "./ExplorerFilters";
import {
  DEFAULT_INCLUDED_FIELDS,
  DEFAULT_INCLUDED_SIGNAL_TYPES,
  NUMEROLOGY_SCORING_FIELDS,
} from "@/lib/numerology/mlbScoreAudit";
import { DEFAULT_SIN_CITY_FIELDS, DEFAULT_SIN_CITY_SIGNAL_TYPES, SIN_CITY_FIELD_KEYS } from "@/lib/numerology/sinCityMasonic";
import type { ExplorerRankingMode } from "./ExplorerTable";

const noop = () => {};

function renderFilters(
  overrides: Partial<ComponentProps<typeof ExplorerFilters>> = {},
  rankingMode: ExplorerRankingMode = "numerology",
) {
  return render(
    <ExplorerFilters
      query=""
      setQuery={noop}
      team="all"
      setTeam={noop}
      teams={["NYY"]}
      matchType="all"
      setMatchType={noop}
      rankingMode={rankingMode}
      includedFields={DEFAULT_INCLUDED_FIELDS}
      setIncludedFields={noop}
      includedTypes={DEFAULT_INCLUDED_SIGNAL_TYPES}
      setIncludedTypes={noop}
      sinCityFields={DEFAULT_SIN_CITY_FIELDS}
      setSinCityFields={noop}
      sinCityTypes={DEFAULT_SIN_CITY_SIGNAL_TYPES}
      setSinCityTypes={noop}
      {...overrides}
    />,
  );
}

describe("Explorer filter defaults", () => {
  it("keeps Filter Settings collapsed by default in both modes", () => {
    const { rerender } = renderFilters();
    expect(screen.getByRole("button", { name: "Numerology Filter Settings" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "Personal Day" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Jersey Include" })).toBeNull();

    rerender(
      <ExplorerFilters
        query=""
        setQuery={noop}
        team="all"
        setTeam={noop}
        teams={["NYY"]}
        matchType="all"
        setMatchType={noop}
        rankingMode="sinCity"
        includedFields={DEFAULT_INCLUDED_FIELDS}
        setIncludedFields={noop}
        includedTypes={DEFAULT_INCLUDED_SIGNAL_TYPES}
        setIncludedTypes={noop}
        sinCityFields={DEFAULT_SIN_CITY_FIELDS}
        setSinCityFields={noop}
        sinCityTypes={DEFAULT_SIN_CITY_SIGNAL_TYPES}
        setSinCityTypes={noop}
      />,
    );
    expect(screen.getByRole("button", { name: "Sin City Filter Settings" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "Jersey #" })).toBeNull();
    expect(screen.queryByText("Personal Day")).toBeNull();
  });

  it("shows Numerology Include/Exclude controls after expanding Filter Settings", () => {
    renderFilters();
    fireEvent.click(screen.getByRole("button", { name: "Numerology Filter Settings" }));
    expect(screen.getByText("Personal Day")).toBeTruthy();
    expect(screen.getByText("Jersey")).toBeTruthy();
    expect(screen.getByText("Batting Order")).toBeTruthy();
    expect(screen.getByText("Life Path")).toBeTruthy();
    expect(screen.getByText("Birth Day")).toBeTruthy();
    expect(screen.getByText("Expression")).toBeTruthy();
    expect(screen.getByText("Repeated Digit")).toBeTruthy();
    expect(screen.getByText("Exact")).toBeTruthy();
    expect(screen.getByText("Root")).toBeTruthy();
    expect(screen.getByText("Family Support")).toBeTruthy();
    expect(screen.getByText("Contextual Echo")).toBeTruthy();
    expect(screen.getByText("Countercurrent")).toBeTruthy();
    expect(screen.queryByRole("group", { name: /^Age$/i })).toBeNull();
    expect(NUMEROLOGY_SCORING_FIELDS).not.toContain("age");
    expect(screen.queryByText("Current HR Count")).toBeNull();
    expect(screen.queryByText("Jersey #")).toBeNull();
  });

  it("shows only Sin City fields and Exact/Root/Family after expanding Sin City Filter Settings", () => {
    renderFilters({}, "sinCity");
    fireEvent.click(screen.getByRole("button", { name: "Sin City Filter Settings" }));
    expect(screen.getByText("Jersey #")).toBeTruthy();
    expect(screen.getByText("Lineup Spot / Batting Order")).toBeTruthy();
    expect(screen.getByText("Birthday")).toBeTruthy();
    expect(screen.getByText("Life Path")).toBeTruthy();
    expect(screen.getByText("Current HR Count")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sin City Exact Include" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Sin City Root Include" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Sin City Family Support Include" })).toHaveAttribute("aria-pressed", "true");
    expect(SIN_CITY_FIELD_KEYS).toHaveLength(5);
    expect(Object.values(DEFAULT_SIN_CITY_FIELDS).every(Boolean)).toBe(true);
    expect(screen.queryByText("Personal Day")).toBeNull();
    expect(screen.queryByText("Expression")).toBeNull();
    expect(screen.queryByText("Repeated Digit")).toBeNull();
    expect(screen.queryByText("Contextual Echo")).toBeNull();
    expect(screen.queryByText("Countercurrent")).toBeNull();
    expect(screen.queryByRole("button", { name: "All Players" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Has Sin City Match" })).toBeNull();
  });

  it("toggling a field Include/Exclude calls the scoring setter, not a list filter", () => {
    const setIncludedFields = vi.fn();
    renderFilters({ setIncludedFields });
    fireEvent.click(screen.getByRole("button", { name: "Numerology Filter Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Jersey Exclude" }));
    expect(setIncludedFields).toHaveBeenCalled();
  });

  it("keeps shared search and team filters visible while settings stay collapsed", () => {
    renderFilters({}, "sinCity");
    expect(screen.getByPlaceholderText("Search players")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Team" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Match Type" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Jersey # Exclude" })).toBeNull();
  });
});
