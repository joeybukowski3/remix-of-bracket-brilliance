import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  DENSE_TABLE_HEAD_ROW,
  DENSE_TABLE_ROW,
  DenseTableScroller,
  TABLE_LAYER,
  frozenDenseColumn,
  stickyDenseHeader,
} from "@/components/ui/dense-table";
import {
  NFL_TABLE_HEAD_ROW,
  NFL_TABLE_ROW,
  NflTableScroller,
} from "@/components/nfl/ui/NflTable";

describe("DenseTableScroller", () => {
  it("exposes an accessible, keyboard-reachable overflow region", () => {
    render(
      <DenseTableScroller label="Rankings table">
        <table>
          <tbody>
            <tr>
              <td>cell</td>
            </tr>
          </tbody>
        </table>
      </DenseTableScroller>,
    );

    const region = screen.getByRole("region", { name: "Rankings table" });
    expect(region.getAttribute("tabindex")).toBe("0");
  });

  it("contains overflow to the table and keeps a visible focus ring", () => {
    render(
      <DenseTableScroller label="Rankings table" className="max-h-[72vh]">
        <span>child</span>
      </DenseTableScroller>,
    );

    const region = screen.getByRole("region", { name: "Rankings table" });
    // `relative` is load-bearing: it stops visually-hidden content escaping and
    // widening the page.
    expect(region.className).toContain("relative");
    expect(region.className).toContain("overflow-x-auto");
    expect(region.className).toContain("focus-visible:ring-2");
    expect(region.className).toContain("max-h-[72vh]");
  });
});

describe("dense table density classes", () => {
  it("keeps the compact, tracked, tabular header + hairline row convention", () => {
    expect(DENSE_TABLE_HEAD_ROW).toContain("text-[10px]");
    expect(DENSE_TABLE_HEAD_ROW).toContain("uppercase");
    expect(DENSE_TABLE_HEAD_ROW).toContain("tracking-wider");
    expect(DENSE_TABLE_ROW).toContain("border-t");
    expect(DENSE_TABLE_ROW).toContain("hover:bg-slate-50");
  });
});

describe("sticky header helper", () => {
  it("pins to the scroll container at the shared sticky-header layer", () => {
    const cls = stickyDenseHeader("bg-slate-100");
    expect(cls).toContain("sticky");
    expect(cls).toContain("top-0");
    expect(cls).toContain(TABLE_LAYER.stickyHeader);
    expect(cls).toContain("bg-slate-100");
  });
});

describe("frozen first-column helper", () => {
  it("pins body cells to the left at the frozen-column layer", () => {
    const cls = frozenDenseColumn({ surface: "bg-white", className: "border-r" });
    expect(cls).toContain("sticky");
    expect(cls).toContain("left-0");
    expect(cls).toContain(TABLE_LAYER.frozenColumn);
    expect(cls).toContain("bg-white");
    expect(cls).toContain("border-r");
  });

  it("raises header/column intersection cells above both sticky layers", () => {
    const cls = frozenDenseColumn({ isHeader: true, surface: "bg-slate-200" });
    expect(cls).toContain(TABLE_LAYER.frozenHeaderCell);
    expect(cls).not.toContain(TABLE_LAYER.frozenColumn);
  });
});

describe("table z-index ladder", () => {
  it("stays below SiteHeader (z-[100]) and mobile context strips (z-40)", () => {
    const value = (cls: string) => Number(cls.replace(/\D/g, ""));
    expect(value(TABLE_LAYER.frozenColumn)).toBeLessThan(value(TABLE_LAYER.stickyHeader));
    expect(value(TABLE_LAYER.stickyHeader)).toBeLessThanOrEqual(value(TABLE_LAYER.frozenHeaderCell));
    expect(value(TABLE_LAYER.frozenHeaderCell)).toBeLessThan(40);
  });
});

describe("NflTable backward-compatibility", () => {
  it("re-exports the shared primitives under the historical NFL names", () => {
    expect(NflTableScroller).toBe(DenseTableScroller);
    expect(NFL_TABLE_HEAD_ROW).toBe(DENSE_TABLE_HEAD_ROW);
    expect(NFL_TABLE_ROW).toBe(DENSE_TABLE_ROW);
  });

  it("still renders NFL consumers as an accessible region", () => {
    render(
      <NflTableScroller label="NFL standings">
        <table>
          <tbody>
            <tr className={NFL_TABLE_ROW}>
              <td>x</td>
            </tr>
          </tbody>
        </table>
      </NflTableScroller>,
    );
    expect(screen.getByRole("region", { name: "NFL standings" })).toBeTruthy();
  });
});
