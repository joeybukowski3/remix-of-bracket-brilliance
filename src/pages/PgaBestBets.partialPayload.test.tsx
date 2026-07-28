import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PgaBestBets, { normalizeBestBetsPayload } from "./PgaBestBets";

function pick(player: string) {
  return {
    player,
    tournamentRank: 2,
    powerRank: 5,
    topStats: ["sgTotal=1.20"],
    bullets: ["Ranks 2nd in the model."],
    odds: { outright: "+2200" },
  };
}

const BASE = {
  tournament: "Genesis Scottish Open",
  course: "The Renaissance Club",
  generatedAt: "2026-07-06T12:00:00.000Z",
  preview: null,
  valueBets: [],
};

function renderPage(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })),
  );
  return render(
    <MemoryRouter initialEntries={["/pga/best-bets"]}>
      <PgaBestBets />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.setItem("pga:date-override", "2026-07-06");
});

afterEach(() => {
  window.localStorage.removeItem("pga:date-override");
  vi.unstubAllGlobals();
});

describe("normalizeBestBetsPayload", () => {
  it("coerces a missing market key to an empty array", () => {
    const normalized = normalizeBestBetsPayload({ ...BASE, outrights: [pick("A")] });
    expect(normalized?.top5).toEqual([]);
    expect(normalized?.top10).toEqual([]);
    expect(normalized?.top20).toEqual([]);
  });

  it("coerces null and non-array market values to an empty array", () => {
    const normalized = normalizeBestBetsPayload({
      ...BASE,
      outrights: [pick("A")],
      top5: null,
      top10: "not an array",
      top20: { player: "Wrong shape" },
    });
    expect(normalized?.top5).toEqual([]);
    expect(normalized?.top10).toEqual([]);
    expect(normalized?.top20).toEqual([]);
  });

  it("keeps valid markets intact when a sibling market is malformed", () => {
    const normalized = normalizeBestBetsPayload({
      ...BASE,
      outrights: [pick("Valid Golfer")],
      top5: null,
      top10: [pick("Another Valid")],
      top20: undefined,
    });
    expect(normalized?.outrights).toHaveLength(1);
    expect(normalized?.top10).toHaveLength(1);
  });

  it("drops entries with no usable player identifier", () => {
    const normalized = normalizeBestBetsPayload({
      ...BASE,
      outrights: [pick("Real Golfer"), { tournamentRank: 3 }, null, { player: "   " }],
    });
    expect(normalized?.outrights.map((p) => p.player)).toEqual(["Real Golfer"]);
  });

  it("does not rewrite valid pick values", () => {
    const original = pick("Untouched Golfer");
    const normalized = normalizeBestBetsPayload({ ...BASE, outrights: [original] });
    expect(normalized?.outrights[0]).toEqual(original);
  });

  it("returns null for a non-object payload", () => {
    expect(normalizeBestBetsPayload(null)).toBeNull();
    expect(normalizeBestBetsPayload("nope")).toBeNull();
    expect(normalizeBestBetsPayload(undefined)).toBeNull();
  });

  it("coerces a malformed valueBets to an empty array", () => {
    expect(normalizeBestBetsPayload({ ...BASE, valueBets: null })?.valueBets).toEqual([]);
  });
});

describe("partial payload rendering", () => {
  it("renders a legacy artifact that omits three market keys entirely", async () => {
    // Pre-schemaVersion-2 shape: previously threw a TypeError and blanked the
    // page because data?.[key].map short-circuits on data, not on the array.
    renderPage({ ...BASE, outrights: [pick("Legacy Golfer")] });

    await waitFor(() => expect(screen.getByText("Legacy Golfer")).toBeInTheDocument());
    expect(screen.getByText("Outright Winners")).toBeInTheDocument();
  });

  it("renders valid markets even when another market is malformed", async () => {
    renderPage({
      ...BASE,
      outrights: [pick("Good Golfer")],
      top5: null,
      top10: "broken",
      top20: [pick("Also Good")],
    });

    await waitFor(() => expect(screen.getByText("Good Golfer")).toBeInTheDocument());
    expect(screen.getByText("Also Good")).toBeInTheDocument();
  });

  it("shows a controlled message for an individually empty market", async () => {
    renderPage({ ...BASE, outrights: [pick("Only Golfer")], top5: [], top10: [], top20: [] });

    await waitFor(() => expect(screen.getByText("Only Golfer")).toBeInTheDocument());
    expect(screen.getAllByText("No qualifying picks in this market this week.")).toHaveLength(3);
  });

  it("falls back to the page-level empty state when every market is empty", async () => {
    renderPage({ ...BASE, outrights: [], top5: [], top10: [], top20: [] });

    await waitFor(() => expect(screen.getByText("No current card available")).toBeInTheDocument());
  });

  it("never titles the page with a legacy featured tournament when the artifact is missing", async () => {
    // The title fallback previously read FEATURED_PGA_TOURNAMENT, which resolves
    // to an archived event whenever the current one has no registry entry -- so
    // a failed fetch could title this page "RBC Heritage 2026".
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no artifact"))));
    render(
      <MemoryRouter initialEntries={["/pga/best-bets"]}>
        <PgaBestBets />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("No current card available")).toBeInTheDocument());
    expect(screen.queryByText(/RBC Heritage/i)).toBeNull();
    expect(screen.getAllByText(/Genesis Scottish Open/i).length).toBeGreaterThan(0);
  });
});
