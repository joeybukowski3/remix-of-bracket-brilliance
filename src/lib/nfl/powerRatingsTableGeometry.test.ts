import { describe, expect, it } from "vitest";
import { readHeaderColumnGeometry } from "@/lib/nfl/powerRatingsTableGeometry";

/** Nine header widths in table order: Team, OVR, OFF, DEF, YPP, EPA, Success, SoS, Record. */
const WIDTHS = [200, 74, 74, 74, 74, 74, 74, 74, 64];

function rect(partial: Partial<DOMRect>): DOMRect {
  return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {}, ...partial } as DOMRect;
}

function buildMeasuredThead(widths: number[]): {
  thead: HTMLTableSectionElement;
  table: HTMLElement;
} {
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tr = document.createElement("tr");
  const tableLeft = 40; // arbitrary non-zero table-content left offset
  let cursor = tableLeft;
  table.getBoundingClientRect = () => rect({ left: tableLeft, x: tableLeft });
  for (const width of widths) {
    const th = document.createElement("th");
    const left = cursor;
    th.getBoundingClientRect = () => rect({ left, right: left + width, width, height: 28, x: left });
    tr.appendChild(th);
    cursor += width;
  }
  thead.getBoundingClientRect = () => rect({ left: tableLeft, right: cursor, width: cursor - tableLeft, height: 28, x: tableLeft });
  thead.appendChild(tr);
  table.appendChild(thead);
  return { thead, table };
}

describe("readHeaderColumnGeometry", () => {
  it("derives one column geometry per real <th>, sized and offset from the measured header cells", () => {
    const { thead, table } = buildMeasuredThead(WIDTHS);
    const geo = readHeaderColumnGeometry(thead, table);
    expect(geo).not.toBeNull();
    expect(geo!.columns).toHaveLength(WIDTHS.length);
    expect(geo!.columns.map((c) => c.width)).toEqual(WIDTHS);
    // Left offsets are relative to the table's own content box (first cell at 0).
    expect(geo!.columns[0].left).toBe(0);
    expect(geo!.columns[8].left).toBe(WIDTHS.slice(0, 8).reduce((a, b) => a + b, 0));
    expect(geo!.height).toBe(28);
  });

  it("reflects responsive widths on the next measurement rather than a hard-coded fallback", () => {
    const narrow = [40, 42, 42, 42, 42, 42, 42, 42, 42];
    const { thead, table } = buildMeasuredThead(narrow);
    const geo = readHeaderColumnGeometry(thead, table);
    expect(geo!.columns.map((c) => c.width)).toEqual(narrow);
  });

  it("returns null when the header has no cells", () => {
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    table.appendChild(thead);
    expect(readHeaderColumnGeometry(thead, table)).toBeNull();
  });
});
