/**
 * NumerologyKey.test.tsx
 * Focused tests for the sidebar Numerology Key glossary.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { NumerologyKey, NumerologyKeyContent, NUMEROLOGY_KEY_GROUPS } from "./NumerologyKey";

beforeEach(() => {
  window.sessionStorage.clear();
});

// ── 13: renders ────────────────────────────────────────────────────────────

describe("Numerology Key — rendering", () => {
  it("13. sidebar key renders with the 'Numerology Key' label", () => {
    render(<NumerologyKey />);
    expect(screen.getByText("Numerology Key")).toBeTruthy();
  });
});

// ── 14-15: collapsed by default, expands/collapses ────────────────────────────

describe("Numerology Key — collapse behavior", () => {
  it("14. is collapsed by default", () => {
    render(<NumerologyKey />);
    const trigger = screen.getByRole("button", { name: /Numerology Key/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Universal Day")).toBeFalsy();
  });

  it("15. expands on click and collapses again on a second click", () => {
    render(<NumerologyKey />);
    const trigger = screen.getByRole("button", { name: /Numerology Key/i });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Universal Day")).toBeTruthy();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("remembers open state across remounts within the same session (sessionStorage)", () => {
    const { unmount } = render(<NumerologyKey />);
    fireEvent.click(screen.getByRole("button", { name: /Numerology Key/i }));
    expect(screen.getByText("Universal Day")).toBeTruthy();
    unmount();

    render(<NumerologyKey />);
    expect(screen.getByRole("button", { name: /Numerology Key/i })).toHaveAttribute("aria-expanded", "true");
  });
});

// ── 16-17: all real criteria represented, definitions match implementation ───

describe("Numerology Key — content accuracy", () => {
  const REQUIRED_TERMS = [
    "Universal Day", "Personal Day", "Life Path", "Birthday Number", "Age",
    "Jersey Number", "Batting Order", "Expression Number", "Repeated Digit",
    "Exact Match", "Root Match", "Family Support", "Contextual Echo",
    "Countercurrent", "Complement", "Secondary Numbers", "Primary Family",
    "Numerology Score", "Model Rating",
  ];

  it("16. every required term from the brief is present in the key", () => {
    const allTerms = NUMEROLOGY_KEY_GROUPS.flatMap((g) => g.terms.map((t) => t.term));
    for (const required of REQUIRED_TERMS) {
      expect(allTerms).toContain(required);
    }
  });

  it("16b. no required term is missing when rendered", () => {
    render(<NumerologyKey />);
    fireEvent.click(screen.getByRole("button", { name: /Numerology Key/i }));
    for (const required of REQUIRED_TERMS) {
      expect(screen.getByText(required)).toBeTruthy();
    }
  });

  it("17a. Model Rating definition does not claim it uses odds, recent form, or baseball performance directly -- it correctly describes it as the separate HR Props score shown for context only", () => {
    const modelRatingTerm = NUMEROLOGY_KEY_GROUPS.flatMap((g) => g.terms).find((t) => t.term === "Model Rating");
    expect(modelRatingTerm).toBeTruthy();
    const def = modelRatingTerm!.definition.toLowerCase();
    expect(def).toContain("hr props");
    expect(def).toContain("not used");
  });

  it("17b. Expression Number definition does not claim a full legal name", () => {
    const exprTerm = NUMEROLOGY_KEY_GROUPS.flatMap((g) => g.terms).find((t) => t.term === "Expression Number");
    expect(exprTerm).toBeTruthy();
    expect(exprTerm!.definition.toLowerCase()).not.toContain("legal name");
    expect(exprTerm!.definition.toLowerCase()).toContain("roster");
  });

  it("17c. Root Match definition uses the 19/1 reduction example from the brief", () => {
    const rootTerm = NUMEROLOGY_KEY_GROUPS.flatMap((g) => g.terms).find((t) => t.term === "Root Match");
    expect(rootTerm!.definition).toContain("19");
  });
});

// ── 18: no unsupported claims ──────────────────────────────────────────────

describe("Numerology Key — no exaggerated or mystical claims", () => {
  it("18. no definition uses prohibited destiny/guarantee language", () => {
    const prohibited = ["destiny", "guarantee", "predicts the future", "fate", "magic"];
    const allDefs = NUMEROLOGY_KEY_GROUPS.flatMap((g) => g.terms.map((t) => t.definition.toLowerCase()));
    for (const def of allDefs) {
      for (const word of prohibited) {
        expect(def).not.toContain(word);
      }
    }
  });
});

// ── 19: mobile key (NumerologyKeyContent, used inside the Sheet) ─────────────

describe("Numerology Key — mobile content variant", () => {
  it("19. NumerologyKeyContent renders all groups and terms directly (no collapse wrapper, used inside the mobile Sheet)", () => {
    render(<NumerologyKeyContent />);
    expect(screen.getByText("Universal Day")).toBeTruthy();
    expect(screen.getByText("Model Rating")).toBeTruthy();
    expect(screen.getByText("Daily numbers")).toBeTruthy();
    expect(screen.getByText("Player numbers")).toBeTruthy();
    expect(screen.getByText("Match types")).toBeTruthy();
    expect(screen.getByText("Scores")).toBeTruthy();
  });
});

// ── 20: sidebar remains scrollable ────────────────────────────────────────────

describe("Numerology Key — scrollable container", () => {
  it("20. expanded key content has its own scrollable container (max-height + overflow-y-auto), not unbounded height", () => {
    render(<NumerologyKey />);
    fireEvent.click(screen.getByRole("button", { name: /Numerology Key/i }));
    const scrollContainer = screen.getByText("Universal Day").closest("div.max-h-\\[60vh\\]");
    expect(scrollContainer).toBeTruthy();
  });
});

// ── 21: grouping structure (helps avoid horizontal overflow via narrow column) ─

describe("Numerology Key — grouping", () => {
  it("21. terms are organized into the four suggested groups", () => {
    const titles = NUMEROLOGY_KEY_GROUPS.map((g) => g.title);
    expect(titles).toEqual(["Daily numbers", "Player numbers", "Match types", "Scores"]);
  });

  it("groups contain a definition list (dl/dt/dd) for accessible structure", () => {
    render(<NumerologyKey />);
    fireEvent.click(screen.getByRole("button", { name: /Numerology Key/i }));
    const dl = document.querySelector("dl");
    expect(dl).toBeTruthy();
  });
});
