import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PowerRatingsTable } from "@/components/nfl/powerRatings/PowerRatingsTable";
import type { PowerRatingsRow } from "@/hooks/useNflPowerRatingsBoard";
import type { PowerRatingsSort } from "@/lib/nfl/powerRatingsSort";

afterEach(cleanup);

/** Header widths in table order: Team, OVR, OFF, DEF, YPP, EPA, Success, SoS, Record. */
const WIDTHS = [200, 74, 74, 74, 74, 74, 74, 74, 64];
const SORT: PowerRatingsSort = { key: "ovr", direction: "desc" };
const CELL = { value: 50, rank: 1 } as const;

function row(abbr: string): PowerRatingsRow {
  return {
    abbr,
    name: abbr.toUpperCase(),
    slug: null,
    color: "#000000",
    conference: "AFC",
    division: "AFC East",
    rank: 1,
    ovr: CELL,
    off: CELL,
    def: CELL,
    ypp: CELL,
    epa: CELL,
    success: CELL,
    sos: CELL,
    record: "1-0",
    recordStats: null,
  };
}

const ROWS = [row("buf"), row("mia"), row("nyj"), row("ne")];

function fakeRect(partial: Partial<DOMRect>): DOMRect {
  return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {}, ...partial } as DOMRect;
}

/**
 * jsdom has no layout, so stub the boxes the sticky hook measures: header scrolled
 * above the 73px SiteHeader offset, table body still on screen, and one measured
 * `<th>` box per column. A `resize` event then drives `measureColumns` + reposition.
 */
function primeStickyGeometry(container: HTMLElement) {
  const wrap = container.querySelector(".nfl-pr-tablewrap") as HTMLElement;
  const scroller = container.querySelector(".nfl-pr-scroll") as HTMLElement;
  const table = container.querySelector(".nfl-pr-table") as HTMLElement;
  const thead = table.querySelector("thead") as HTMLElement;

  wrap.getBoundingClientRect = () => fakeRect({ top: -200, bottom: 500, height: 700 });
  thead.getBoundingClientRect = () => fakeRect({ top: -30, bottom: 0, height: 30 });
  table.getBoundingClientRect = () => fakeRect({ left: 0, x: 0 });
  scroller.getBoundingClientRect = () => fakeRect({ left: 0, width: 900, x: 0 });

  let cursor = 0;
  for (const th of [...table.querySelectorAll("thead th")] as HTMLElement[]) {
    const width = WIDTHS[[...table.querySelectorAll("thead th")].indexOf(th)];
    const left = cursor;
    th.getBoundingClientRect = () => fakeRect({ left, right: left + width, width, height: 30, x: left });
    cursor += width;
  }
  return { scroller };
}

function renderTable(onSort = vi.fn()) {
  const utils = render(
    <PowerRatingsTable
      rows={ROWS}
      mode="rankings"
      sort={SORT}
      onSort={onSort}
      heat={null}
      ariaLabel="test power ratings"
    />
  );
  return { ...utils, onSort };
}

const clone = (c: HTMLElement) => c.querySelector(".nfl-pr-stickyclone") as HTMLElement | null;
const cloneCellWidths = (c: HTMLElement) =>
  [...c.querySelectorAll(".nfl-pr-stickyclone-cell")].map((el) => (el as HTMLElement).style.width);

describe("PowerRatingsTable — sticky header clone", () => {
  it("stays inactive until the real header scrolls past the sticky threshold", async () => {
    const { container } = renderTable();
    // No geometry primed / no scroll: the clone never mounts.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(clone(container)).toBeNull();
  });

  it("derives clone geometry from the actual header cells on resize, not hard-coded widths", async () => {
    const { container } = renderTable();
    primeStickyGeometry(container);
    fireEvent(window, new Event("resize"));

    await waitFor(() => expect(clone(container)).not.toBeNull());
    const node = clone(container) as HTMLElement;

    // One hit target per real column: Team + 7 metrics + Record.
    expect(node.querySelectorAll("button")).toHaveLength(WIDTHS.length);

    // Team clone width == measured Team <th>; Record clone width == measured Record <th>.
    const team = node.querySelector(".nfl-pr-stickyclone-team") as HTMLElement;
    expect(team.style.width).toBe("200px");
    const cellWidths = cloneCellWidths(node);
    expect(cellWidths).toHaveLength(8);
    expect(cellWidths[0]).toBe("74px"); // OVR
    expect(cellWidths[7]).toBe("64px"); // Record
  });

  it("re-measures column widths when the header resizes", async () => {
    const { container } = renderTable();
    primeStickyGeometry(container);
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(clone(container)).not.toBeNull());
    expect(cloneCellWidths(clone(container) as HTMLElement)[0]).toBe("74px");

    // Shrink every <th> to a mobile-ish width, then resize again.
    const table = container.querySelector(".nfl-pr-table") as HTMLElement;
    let cursor = 0;
    for (const th of [...table.querySelectorAll("thead th")] as HTMLElement[]) {
      const left = cursor;
      th.getBoundingClientRect = () => fakeRect({ left, right: left + 42, width: 42, height: 20, x: left });
      cursor += 42;
    }
    fireEvent(window, new Event("resize"));
    await waitFor(() =>
      expect(cloneCellWidths(clone(container) as HTMLElement)[0]).toBe("42px")
    );
  });

  it("translates the clone by -scrollLeft on horizontal scroll without changing column widths", async () => {
    const { container } = renderTable();
    const { scroller } = primeStickyGeometry(container);
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(clone(container)).not.toBeNull());

    const rowEl = () => clone(container)!.querySelector(".nfl-pr-stickyclone-row") as HTMLElement;
    expect(rowEl().style.transform).toBe("translateX(0px)");
    const widthsBefore = cloneCellWidths(clone(container) as HTMLElement);

    Object.defineProperty(scroller, "scrollLeft", { value: 150, configurable: true });
    fireEvent.scroll(scroller);

    await waitFor(() => expect(rowEl().style.transform).toBe("translateX(-150px)"));
    expect(cloneCellWidths(clone(container) as HTMLElement)).toEqual(widthsBefore);
  });

  it("keeps sorting working from the clone and stays aria-hidden / out of the tab order", async () => {
    const { container, onSort } = renderTable();
    primeStickyGeometry(container);
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(clone(container)).not.toBeNull());
    const node = clone(container) as HTMLElement;

    expect(node.getAttribute("aria-hidden")).toBe("true");
    for (const button of node.querySelectorAll("button")) {
      expect(button.getAttribute("tabindex")).toBe("-1");
    }

    fireEvent.click(node.querySelector(".nfl-pr-stickyclone-team") as HTMLElement);
    const cells = node.querySelectorAll(".nfl-pr-stickyclone-cell");
    fireEvent.click(cells[0]); // OVR
    fireEvent.click(cells[7]); // Record
    expect(onSort.mock.calls.map((c) => c[0])).toEqual(["team", "ovr", "record"]);
  });
});
