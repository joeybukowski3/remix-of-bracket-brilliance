/**
 * Small cross-market visual primitives for the compact mobile prop tables
 * (K Props, HR Props), styled to match the merged NFL Yardage Props Review
 * mobile table (src/components/nfl/yardage-review/NflYardageReviewMobileTable.tsx).
 * Presentation only -- no projection/model math lives here.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Sticky mobile category-header CELL class shared by the K and HR compact
 * tables (and mirrored, not imported, by the NFL Yardage mobile table -- see
 * its own file for the identical contract, kept duplicated on purpose per
 * the "no cross-sport abstraction" guidance).
 *
 * Applied to every `<th>` in the header row -- NOT the `<tr>`. `position:
 * sticky` on a `<tr>` has no visible effect in most browsers because a
 * table row isn't a positioned box with painted backgrounds independent of
 * its cells; the header appeared to "float" mid-table because only the
 * (invisible) row was actually sticking while cell content scrolled with
 * the table. Each `<th>` needs its own sticky position + opaque background.
 *
 * `top-[73px]` = SiteHeader's real rendered height: `min-h-[72px]` plus its
 * own `border-b` (1px) -- see src/components/layout/SiteHeader.tsx
 * (`sticky top-0 z-[100]`). `z-30` sits below SiteHeader (z-[100]) and above
 * table body rows/mobile context strips.
 *
 * No ancestor between the table and the page body may set ANY `overflow`
 * value other than `visible`/`clip` -- not `overflow-hidden`, not
 * `overflow-auto`, and not `overflow-x-hidden` either. Every non-`visible`
 * overflow value (including `overflow-x-hidden`) establishes a CSS
 * "scroll container" per spec, which becomes the containing block that
 * `position: sticky` resolves against -- so the header sticks relative to
 * that wrapper instead of the page viewport, and clips or detaches once the
 * wrapper scrolls out of view. Both tables already use `table-fixed` with
 * explicit `colgroup` widths, so no horizontal clipping is needed; put any
 * rounded-corner/border cosmetic styling on a wrapper with no overflow
 * property at all.
 */
export const STICKY_MOBILE_HEADER_CELL_CLASS =
  "sticky top-[73px] z-30 border-b border-slate-200 bg-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.06)]";

/** Presentation-only first/last split for stacking a player's name across two compact lines. Last name is always the final whitespace-separated token (keeps hyphenated last names like "Crow-Armstrong" intact); never used for lookups/keys. */
export function splitDisplayName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: "", last: fullName.trim() };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

export function SortArrow({ direction }: { direction: "asc" | "desc" | null }) {
  if (!direction) {
    return (
      <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 shrink-0 opacity-40" fill="none" aria-hidden="true">
        <path d="M5 6.5 8 3.5 11 6.5M5 9.5 8 12.5 11 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const d = direction === "desc" ? "M8 3v9M4.5 9 8 12.5 11.5 9" : "M8 13V4M4.5 7 8 3.5 11.5 7";
  return (
    <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 shrink-0 text-sky-700" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Generic sortable `<th>` for a compact mobile prop table -- one column, tied to a shared sortKey/onSort pair so mobile and desktop always agree on the active sort. */
export function MobileSortHeader<K extends string>({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "center",
  testIdPrefix,
  sticky = false,
}: {
  label: string;
  sortKey: K;
  activeKey: K | null;
  direction: "asc" | "desc";
  onSort: (key: K) => void;
  align?: "left" | "center";
  testIdPrefix?: string;
  /** Applies STICKY_MOBILE_HEADER_CELL_CLASS to this `<th>` -- see that constant's doc comment for why sticky must live on the cell, not the row. */
  sticky?: boolean;
}) {
  const active = activeKey === sortKey;
  return (
    <th
      scope="col"
      data-testid={testIdPrefix ? `${testIdPrefix}-${sortKey}` : undefined}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-1.5 py-1.5", align === "left" ? "text-left" : "text-center", sticky && STICKY_MOBILE_HEADER_CELL_CLASS)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}`}
        className={cn(
          "flex items-center gap-0.5 rounded px-0.5 text-[9px] font-bold uppercase tracking-wide transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500",
          align === "center" ? "mx-auto" : "",
          active ? "text-sky-800" : "text-slate-500 hover:text-slate-800",
        )}
      >
        {label}
        <SortArrow direction={active ? direction : null} />
      </button>
    </th>
  );
}

/**
 * Shared diff/edge tone -- positive (model favors OVER / +EV) green, negative
 * red, zero/unavailable neutral gray. Mirrors the NFL Yardage mobile table's
 * `diffToneClass` and the site-wide "green over / red under / gray neutral"
 * convention used across K and HR props.
 */
export function edgeToneClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "text-slate-500";
  return value > 0 ? "text-emerald-700" : "text-rose-700";
}

/** Two-option pill tab switch shared by K Props (Pitcher/Opponent) and HR Props (Batter/Matchup) stat panels. One tab active at a time; caller renders the panel content. */
export function PropsTwoTabSwitch<K extends string>({
  tabs,
  active,
  onChange,
  idPrefix,
}: {
  tabs: readonly [{ key: K; label: string; tone: "emerald" | "blue" | "sky" | "violet" }, { key: K; label: string; tone: "emerald" | "blue" | "sky" | "violet" }];
  active: K;
  onChange: (key: K) => void;
  idPrefix: string;
}) {
  const toneClass = (isActive: boolean, tone: "emerald" | "blue" | "sky" | "violet") => {
    const map: Record<string, { active: string; inactive: string }> = {
      emerald: { active: "border-emerald-700 bg-emerald-600 text-white shadow-sm", inactive: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
      blue: { active: "border-blue-700 bg-blue-600 text-white shadow-sm", inactive: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" },
      sky: { active: "border-sky-700 bg-sky-600 text-white shadow-sm", inactive: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100" },
      violet: { active: "border-violet-600 bg-violet-600 text-white shadow-sm", inactive: "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100" },
    };
    return isActive ? map[tone].active : map[tone].inactive;
  };
  return (
    <div role="tablist" aria-label="Stats" className="grid grid-cols-2 gap-1.5">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${tab.key}`}
          aria-selected={active === tab.key}
          aria-controls={`${idPrefix}-panel-${tab.key}`}
          tabIndex={active === tab.key ? 0 : -1}
          onClick={() => onChange(tab.key)}
          className={cn("rounded border px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide transition", toneClass(active === tab.key, tab.tone))}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function PropsTabPanel({ id, labelledBy, active, children }: { id: string; labelledBy: string; active: boolean; children: ReactNode }) {
  return (
    <div id={id} role="tabpanel" aria-labelledby={labelledBy} hidden={!active} className={cn("mt-2", active && "border-t-2 border-slate-200 pt-2")}>
      {active && children}
    </div>
  );
}

/** Collapsed-by-default accordion for the "Projection Details" section at the bottom of a mobile expanded row, matching the NFL detail panel's Projection Details shell. */
export function ProjectionDetailsAccordion({
  title = "Projection Details",
  defaultOpen = false,
  children,
}: {
  title?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-md border-2 border-slate-300 bg-white" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-left [&::-webkit-details-marker]:hidden">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-700">{title}</span>
        <span className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
      </summary>
      <div className="border-t-2 border-slate-300 p-3">{children}</div>
    </details>
  );
}
