/**
 * Focused readability/contrast regression coverage for the MLB ML Edges
 * social-media table (SocialTableML). Confirms the muted grays that
 * previously failed WCAG AA against this table's near-black backgrounds
 * (#475569, #64748b) are gone, and that their higher-contrast replacements
 * (#94a3b8 for secondary/muted text, #cbd5e1 for column headers) meet the
 * 4.5:1 AA threshold for normal text against every background this table
 * actually uses. Does not touch model calculations, row selection,
 * ranking, or social-table data -- SocialTableML's own row-building logic
 * is untouched; only inline style colors changed.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SocialTableML } from "./MlbGameDetail";
import { DEV_MLB_MATCHUP_FIXTURE } from "@/data/mlb/devMatchupFixture";

// WCAG 2.x relative luminance / contrast ratio, computed directly from sRGB
// hex so this test doesn't depend on jsdom's style/getComputedStyle parsing.
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(hexToRgb(fgHex));
  const l2 = relativeLuminance(hexToRgb(bgHex));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// Every background SocialTableML actually paints behind text.
const TABLE_BACKGROUNDS = ["#060d1a", "#091629", "#0d1e38", "#0a1628"];

// The two previously-failing grays this table used for header labels,
// muted/N-A text, and the footer legend.
const OLD_LOW_CONTRAST_COLORS = ["#475569", "#64748b"];

// Their replacements: #cbd5e1 for column headers (matches the convention
// already used by the sibling HR Props social table), #94a3b8 for
// secondary/muted text (N/A states, footer legend, minor labels).
const NEW_TEXT_COLORS = ["#94a3b8", "#cbd5e1"];

describe("SocialTableML color contrast (WCAG AA, 4.5:1 normal text)", () => {
  it("the old low-contrast grays fail AA against every background this table uses (documents the bug that was fixed)", () => {
    for (const fg of OLD_LOW_CONTRAST_COLORS) {
      for (const bg of TABLE_BACKGROUNDS) {
        expect(contrastRatio(fg, bg)).toBeLessThan(4.5);
      }
    }
  });

  it("the new text colors meet AA (>= 4.5:1) against every background this table uses", () => {
    for (const fg of NEW_TEXT_COLORS) {
      for (const bg of TABLE_BACKGROUNDS) {
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("SocialTableML rendering", () => {
  function renderTable() {
    const { schedule, detail } = DEV_MLB_MATCHUP_FIXTURE;
    return render(
      <SocialTableML
        games={schedule}
        detailPreviews={{ [schedule[0].gamePk]: detail }}
        pitcherRegressionData={[]}
        mlbOdds={null}
      />,
    );
  }

  // React/jsdom normalizes inline hex color styles to rgb(...) in the
  // serialized DOM, so assertions on rendered output compare against that
  // form rather than the hex literals used in source.
  const hexToRgbString = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  };

  it("never renders the old low-contrast gray colors", () => {
    const { container } = renderTable();
    const html = container.innerHTML;
    for (const color of OLD_LOW_CONTRAST_COLORS) {
      expect(html).not.toContain(hexToRgbString(color));
    }
  });

  it("renders column headers and the footer legend using the higher-contrast colors", () => {
    const { container } = renderTable();
    const html = container.innerHTML;
    expect(html).toContain(hexToRgbString("#cbd5e1"));
    expect(html).toContain(hexToRgbString("#94a3b8"));
  });

  it("renders the ML Edges header and at least one matchup row from the fixture (row-selection/data untouched)", () => {
    const { getByText, getAllByText } = renderTable();
    expect(getByText("🏆 MLB ML EDGES")).toBeInTheDocument();
    expect(getAllByText("NYY").length).toBeGreaterThan(0);
    expect(getAllByText("BOS").length).toBeGreaterThan(0);
  });
});
