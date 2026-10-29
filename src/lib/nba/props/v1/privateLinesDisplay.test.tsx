/**
 * The page on a private board whose lines came from stored odds captures: Vegas Line, JKB minus line, and the minutes-adjusted
 * difference all read the same captured line. Invented league, books and prices; nothing is fetched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import PropsBoardView from "@/components/nba/PropsBoardView";
import { boardWith, book, captureOf } from "@/lib/nba/props/__fixtures__/capturedLines";
import { fixtureName } from "@/lib/nba/props/__fixtures__/v1Fixtures";
import { COLUMN_PREFERENCE_KEY } from "@/lib/nba/props/boardColumns";

vi.setConfig({ testTimeout: 30_000 });

const PLAYER = fixtureName("BOS", 3);
const NO_LINE = fixtureName("BOS", 4);
const { artifact } = boardWith([captureOf([book("demobook", [{ player: PLAYER, point: 14.5, over: -118, under: -102 }])])]);
const projection = artifact.entries.find((e) => e.playerName === PLAYER && e.market === "pts")!.projection!;
const signed = (n: number): string => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
  localStorage.setItem(COLUMN_PREFERENCE_KEY, JSON.stringify({ version: 1, columns: ["jkbProjection", "modelEdge", "overUnder", "jkbMinutes", "userMinutes", "adjustedProjection", "adjustedDifference"] }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const rowOf = (name: string): HTMLElement => screen.getByRole("rowheader", { name: new RegExp(name) }).closest("tr") as HTMLElement;
const col = (name: string, id: string): HTMLElement => within(rowOf(name)).getByTestId(`col-${id}`);

describe("props page on a board with captured lines", () => {
  it("shows the captured line, the projection, JKB minus line and the over/under prices for the matched player", () => {
    render(<PropsBoardView board={artifact} />);
    expect(within(col(PLAYER, "line")).getByTestId("vegas-line-value").textContent).toBe("14.5");
    expect(col(PLAYER, "jkbProjection").textContent).toBe(projection.value.toFixed(1));
    expect(col(PLAYER, "modelEdge").textContent).toBe(signed(projection.value - 14.5));
    expect(col(PLAYER, "overUnder").textContent).toContain("-118");
    expect(col(PLAYER, "overUnder").textContent).toContain("-102");
  });

  it("shows N/A, never a made-up number, for a player the capture did not cover", () => {
    render(<PropsBoardView board={artifact} />);
    expect(col(NO_LINE, "line").textContent).toBe("N/A");
    expect(col(NO_LINE, "modelEdge").textContent).toBe("N/A");
  });

  it("computes the minutes-adjusted difference from the same captured line", () => {
    render(<PropsBoardView board={artifact} />);
    const input = within(col(PLAYER, "userMinutes")).getByLabelText(new RegExp(`Your projected minutes for ${PLAYER},`));
    fireEvent.change(input, { target: { value: "36" } });
    const adjustedValue = (projection.value * 36) / (projection.minutes as number);
    expect(col(PLAYER, "adjustedProjection").textContent).toContain(adjustedValue.toFixed(1));
    expect(col(PLAYER, "adjustedDifference").textContent).toBe(signed(adjustedValue - 14.5));
    // The model's own difference is untouched by the override.
    expect(col(PLAYER, "modelEdge").textContent).toBe(signed(projection.value - 14.5));
  });
});
