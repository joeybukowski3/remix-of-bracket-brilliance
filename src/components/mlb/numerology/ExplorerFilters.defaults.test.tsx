import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExplorerFilters } from "./ExplorerFilters";
import {
  DEFAULT_INCLUDED_FIELDS,
  DEFAULT_INCLUDED_SIGNAL_TYPES,
  NUMEROLOGY_SCORING_FIELDS,
} from "@/lib/numerology/mlbScoreAudit";
import { DEFAULT_SIN_CITY_FIELDS, SIN_CITY_FIELD_KEYS } from "@/lib/numerology/sinCityMasonic";

const noop = () => {};

function renderFilters(overrides: Partial<React.ComponentProps<typeof ExplorerFilters>> = {}) {
  return render(
    <ExplorerFilters
      query=""
      setQuery={noop}
      team="all"
      setTeam={noop}
      teams={["NYY"]}
      matchType="all"
      setMatchType={noop}
      includedFields={DEFAULT_INCLUDED_FIELDS}
      setIncludedFields={noop}
      includedTypes={DEFAULT_INCLUDED_SIGNAL_TYPES}
      setIncludedTypes={noop}
      sinCityIncluded
      setSinCityIncluded={noop}
      sinCityFields={DEFAULT_SIN_CITY_FIELDS}
      setSinCityFields={noop}
      {...overrides}
    />,
  );
}

describe("Explorer filter defaults", () => {
  it("renders every normal scoring field as Include and never offers Age", () => {
    renderFilters();
    expect(screen.getByText("Personal Day")).toBeTruthy();
    expect(screen.getByText("Jersey")).toBeTruthy();
    expect(screen.getByText("Batting Order")).toBeTruthy();
    expect(screen.getAllByText("Life Path").length).toBeGreaterThan(0);
    expect(screen.getByText("Birth Day")).toBeTruthy();
    expect(screen.getByText("Expression")).toBeTruthy();
    expect(screen.getByText("Repeated Digit")).toBeTruthy();
    expect(screen.queryByRole("group", { name: /^Age$/i })).toBeNull();
    expect(NUMEROLOGY_SCORING_FIELDS).not.toContain("age");
  });

  it("renders Sin City Masonic Symbol Filter with master and five fields defaulting to Include", () => {
    renderFilters();
    expect(screen.getByText("Sin City Masonic Symbol Filter")).toBeTruthy();
    expect(screen.getByText("Jersey #")).toBeTruthy();
    expect(screen.getByText("Lineup Spot / Batting Order")).toBeTruthy();
    expect(screen.getByText("Birthday")).toBeTruthy();
    expect(screen.getByText("Current HR Count")).toBeTruthy();
    expect(SIN_CITY_FIELD_KEYS).toHaveLength(5);
    expect(Object.values(DEFAULT_SIN_CITY_FIELDS).every(Boolean)).toBe(true);

    const masterInclude = screen.getByRole("button", { name: "Sin City master Include" });
    expect(masterInclude).toHaveAttribute("aria-pressed", "true");
  });

  it("toggling a field Include/Exclude calls the scoring setter, not a list filter", () => {
    const setIncludedFields = vi.fn();
    renderFilters({ setIncludedFields });
    fireEvent.click(screen.getByRole("button", { name: "Jersey Exclude" }));
    expect(setIncludedFields).toHaveBeenCalled();
  });
});
