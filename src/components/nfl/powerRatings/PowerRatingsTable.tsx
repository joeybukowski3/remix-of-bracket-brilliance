import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { MetricCell, type MetricCellMode } from "@/components/nfl/powerRatings/MetricCell";
import type { PowerRatingsRow } from "@/hooks/useNflPowerRatingsBoard";
import type { PowerRatingsHeat } from "@/lib/nfl/powerRatingsHeat";
import {
  readHeaderColumnGeometry,
  type CloneColumnGeometry,
} from "@/lib/nfl/powerRatingsTableGeometry";
import {
  type PowerRatingsSort,
  type PowerRatingsSortKey,
} from "@/lib/nfl/powerRatingsSort";

const oneDecimal = (value: number) => value.toFixed(1);

export type SortHandler = (key: PowerRatingsSortKey) => void;

/** The 7 scored/context metric columns between Team and Record, in table order. */
const METRIC_COLUMNS: { key: PowerRatingsSortKey; label: string; title: string }[] = [
  { key: "ovr", label: "OVR", title: "overall rating" },
  { key: "off", label: "OFF", title: "offensive rating" },
  { key: "def", label: "DEF", title: "defensive rating" },
  { key: "ypp", label: "YPP", title: "yards per play rating" },
  { key: "epa", label: "EPA", title: "EPA rating" },
  { key: "success", label: "Success", title: "success rate rating" },
  { key: "sos", label: "SoS", title: "strength of schedule" },
];

function SortableTh({
  label,
  title,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  title: string;
  sortKey: PowerRatingsSortKey;
  sort: PowerRatingsSort;
  onSort: SortHandler;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : "none";
  return (
    <th scope="col" className={className} aria-sort={ariaSort}>
      <button
        type="button"
        className={`nfl-pr-sortbtn${active ? " is-active" : ""}`}
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${title}`}
        title={title}
      >
        <span>{label}</span>
        <span className="nfl-pr-sortind" aria-hidden="true">
          {active ? (sort.direction === "asc" ? "↑" : "↓") : ""}
        </span>
      </button>
    </th>
  );
}

function TeamLogo({ abbr, color }: { abbr: string; color: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="nfl-pr-badge" style={{ background: color }}>
        {abbr.toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={nflLogoUrl(abbr)}
      alt=""
      className="nfl-pr-logo"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function TeamCell({ row }: { row: PowerRatingsRow }) {
  const inner = (
    <>
      <span className="nfl-pr-accent" style={{ background: row.color }} aria-hidden />
      <TeamLogo abbr={row.abbr} color={row.color} />
      <span className="nfl-pr-name">{row.name}</span>
    </>
  );
  if (!row.slug) {
    return (
      <td className="nfl-pr-team" title={row.name}>
        <span className="nfl-pr-team-link">{inner}</span>
      </td>
    );
  }
  return (
    <td className="nfl-pr-team" title={row.name}>
      <Link
        to={`/nfl/guide/team/${row.slug}`}
        className="nfl-pr-team-link"
        aria-label={`Open ${row.name} team dashboard`}
      >
        {inner}
      </Link>
    </td>
  );
}

/** SoS is an average opponent rank, not a 1-99 rating — its own cell, no heat. */
function SosCell({
  value,
  rank,
  mode,
}: {
  value: number | null;
  rank: number | null;
  mode: MetricCellMode;
}) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <td className="nfl-pr-heat">
        <span className="nfl-pr-heatval nfl-pr-unavailable">—</span>
      </td>
    );
  }
  const avgText = `${value.toFixed(1)} avg`;
  const rankPrimary = rank !== null ? `#${rank}` : value.toFixed(1);
  const rankSecondary = rank !== null ? `#${rank} hardest` : null;
  const primary = mode === "rankings" ? rankPrimary : value.toFixed(1);
  const secondary = mode === "rankings" ? avgText : rankSecondary;
  return (
    <td className="nfl-pr-heat">
      <span className="nfl-pr-heatval nfl-pr-value-primary">{primary}</span>
      {secondary && <span className="nfl-pr-heatrank nfl-pr-value-secondary">{secondary}</span>}
    </td>
  );
}

/**
 * SiteHeader's real rendered height (`min-h-[72px]` + its 1px `border-b` —
 * src/components/layout/SiteHeader.tsx) — the sticky clone's `top`, so the table
 * header sticks directly under global chrome and never renders above it.
 */
const STICKY_TOP = 73;

/** Ordered clone columns: frozen Team, the 7 metric columns, then Record — one entry per real `<th>`. */
const CLONE_COLUMNS: { key: PowerRatingsSortKey; label: string }[] = [
  { key: "team", label: "Team" },
  ...METRIC_COLUMNS.map((col) => ({ key: col.key, label: col.label })),
  { key: "record", label: "Record" },
];

type CloneGeometry = {
  active: boolean;
  left: number;
  width: number;
  height: number;
  scrollLeft: number;
  columns: CloneColumnGeometry[];
};

const INACTIVE_GEOMETRY: CloneGeometry = {
  active: false,
  left: 0,
  width: 0,
  height: 0,
  scrollLeft: 0,
  columns: [],
};

/**
 * Page-scroll sticky header for one table.
 *
 * `.nfl-pr-scroll` must keep `overflow-x: auto` for mobile-local horizontal
 * scroll (docs/TABLE_CONVENTIONS.md section B/C). That, per the CSS overflow
 * spec, makes the browser treat its `overflow-y` as `auto` too even though
 * nothing there ever actually overflows vertically — which makes that div (not
 * the viewport) the containing block for any `position: sticky` descendant, so
 * a plain sticky `<thead>` can never track page scroll inside it. There is no
 * pure-CSS way to keep local horizontal scroll on one axis while a descendant
 * stickies to the viewport on the other.
 *
 * This hook renders nothing itself — it just measures, on scroll/resize,
 * whether this table's real header has scrolled above `STICKY_TOP` while some
 * of the table's own body is still below it, and if so reports the geometry
 * (left/width/scrollLeft) for a `position: fixed` clone rendered outside the
 * scrolling container to sit exactly where the real sticky header would be.
 * Only one table's clone is ever active at a time — the next table's own
 * (still normal-flow) header is already in place underneath by the time the
 * previous table's clone deactivates, so the handoff has no stacking or gap.
 */
function useStickyHeaderClone() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const [geometry, setGeometry] = useState<CloneGeometry>(INACTIVE_GEOMETRY);

  useEffect(() => {
    const wrap = wrapRef.current;
    const scroller = scrollRef.current;
    const thead = theadRef.current;
    const table = thead?.closest("table") as HTMLElement | null;
    if (!wrap || !scroller || !thead || !table) return;

    let frame = 0;
    let columns: CloneColumnGeometry[] = [];
    let headerHeight = 0;

    // Column widths only change on resize / responsive breakpoints — measured here,
    // cached, and reused by every reposition until the next resize.
    const measureColumns = () => {
      const geo = readHeaderColumnGeometry(thead, table);
      if (!geo) return;
      columns = geo.columns;
      headerHeight = geo.height;
    };

    // Runs on every scroll frame: decides active/inactive and, when active, only
    // updates the fixed offset + horizontal translation. Never re-measures widths.
    const reposition = () => {
      frame = 0;
      const wrapRect = wrap.getBoundingClientRect();
      const theadRect = thead.getBoundingClientRect();
      const active = theadRect.bottom <= STICKY_TOP && wrapRect.bottom > STICKY_TOP;
      if (!active) {
        setGeometry((prev) => (prev.active ? INACTIVE_GEOMETRY : prev));
        return;
      }
      const scrollRect = scroller.getBoundingClientRect();
      setGeometry({
        active: true,
        left: scrollRect.left,
        width: scrollRect.width,
        height: headerHeight || theadRect.height,
        scrollLeft: scroller.scrollLeft,
        columns,
      });
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(reposition);
    };
    const remeasure = () => {
      measureColumns();
      schedule();
    };

    measureColumns();
    reposition();

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", remeasure);
    scroller.addEventListener("scroll", schedule, { passive: true });

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(remeasure);
      observer.observe(table);
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", remeasure);
      scroller.removeEventListener("scroll", schedule);
      observer?.disconnect();
    };
  }, []);

  return { wrapRef, scrollRef, theadRef, geometry };
}

function StickyHeaderClone({
  geometry,
  sort,
  onSort,
}: {
  geometry: CloneGeometry;
  sort: PowerRatingsSort;
  onSort: SortHandler;
}) {
  if (!geometry.active || geometry.columns.length === 0) return null;
  const indicator = (key: PowerRatingsSortKey) =>
    sort.key === key ? (sort.direction === "asc" ? "↑" : "↓") : "";
  const [teamCol, ...metricCols] = geometry.columns;
  return (
    <div
      className="nfl-pr-stickyclone"
      aria-hidden="true"
      style={{ left: geometry.left, width: geometry.width, height: geometry.height }}
    >
      <div className="nfl-pr-stickyclone-clip">
        <div
          className="nfl-pr-stickyclone-row"
          style={{ transform: `translateX(${-geometry.scrollLeft}px)` }}
        >
          {metricCols.map((col, index) => {
            const meta = CLONE_COLUMNS[index + 1];
            if (!meta) return null;
            return (
              <button
                key={meta.key}
                type="button"
                tabIndex={-1}
                className="nfl-pr-stickyclone-cell"
                style={{ left: col.left, width: col.width }}
                onClick={() => onSort(meta.key)}
              >
                <span>{meta.label}</span>
                <span className="nfl-pr-sortind">{indicator(meta.key)}</span>
              </button>
            );
          })}
        </div>
      </div>
      {teamCol && (
        <button
          type="button"
          tabIndex={-1}
          className="nfl-pr-stickyclone-team"
          style={{ width: teamCol.width }}
          onClick={() => onSort("team")}
        >
          <span>Team</span>
          <span className="nfl-pr-sortind">{indicator("team")}</span>
        </button>
      )}
    </div>
  );
}

export type PowerRatingsGroupLabel = {
  eyebrow: string;
  name: string;
  count: number;
};

export type PowerRatingsTableProps = {
  rows: readonly PowerRatingsRow[];
  mode: MetricCellMode;
  sort: PowerRatingsSort;
  onSort: SortHandler;
  heat: PowerRatingsHeat | null;
  ariaLabel: string;
  /** Group heading rendered immediately above the table (Conference / Division views only). */
  groupLabel?: PowerRatingsGroupLabel;
};

/**
 * One full power-ratings table: sortable dark header (page-scroll sticky via a
 * JS-measured fixed clone — see useStickyHeaderClone above), frozen Team
 * column, JKB-heat-painted metric cells. Reused for League (one instance),
 * Conference (two), and Division (eight) so the markup is defined once — see
 * docs/TABLE_CONVENTIONS.md for the sticky/frozen layer intent.
 */
export function PowerRatingsTable({
  rows,
  mode,
  sort,
  onSort,
  heat,
  ariaLabel,
  groupLabel,
}: PowerRatingsTableProps) {
  const { wrapRef, scrollRef, theadRef, geometry } = useStickyHeaderClone();

  const groupClass = [
    "nfl-pr-group",
    groupLabel && "nfl-pr-group--grouped",
    groupLabel?.eyebrow === "Conference" && "nfl-pr-group--conference",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={groupClass}>
      {groupLabel && (
        <div className="nfl-pr-grouplabel">
          <span className="nfl-pr-grouplabel-eyebrow">{groupLabel.eyebrow}</span>
          <span className="nfl-pr-grouplabel-name">{groupLabel.name}</span>
          <span className="nfl-pr-grouplabel-count">{groupLabel.count} teams</span>
        </div>
      )}
      <div className="nfl-pr-tablewrap" ref={wrapRef}>
        <div className="nfl-pr-scroll" ref={scrollRef} role="region" aria-label={ariaLabel} tabIndex={0}>
          <table className="nfl-pr-table">
            <colgroup>
              <col className="nfl-pr-col-team" />
              <col className="nfl-pr-col-metric" />
              <col className="nfl-pr-col-metric" />
              <col className="nfl-pr-col-metric" />
              <col className="nfl-pr-col-metric" />
              <col className="nfl-pr-col-metric" />
              <col className="nfl-pr-col-metric" />
              <col className="nfl-pr-col-metric" />
              <col className="nfl-pr-col-record" />
            </colgroup>
            <thead ref={theadRef}>
              <tr>
                <SortableTh label="Team" title="team name" sortKey="team" sort={sort} onSort={onSort} className="nfl-pr-th-team" />
                {METRIC_COLUMNS.map((col) => (
                  <SortableTh key={col.key} label={col.label} title={col.title} sortKey={col.key} sort={sort} onSort={onSort} />
                ))}
                <SortableTh label="Record" title="period record win percentage" sortKey="record" sort={sort} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.abbr}>
                  <TeamCell row={row} />
                  <MetricCell value={row.ovr.value} rank={row.ovr.rank} mode={mode} formatValue={oneDecimal} heat={heat?.resolve("ovr", row.abbr)?.style ?? null} />
                  <MetricCell value={row.off.value} rank={row.off.rank} mode={mode} formatValue={oneDecimal} heat={heat?.resolve("off", row.abbr)?.style ?? null} />
                  <MetricCell value={row.def.value} rank={row.def.rank} mode={mode} formatValue={oneDecimal} heat={heat?.resolve("def", row.abbr)?.style ?? null} />
                  <MetricCell value={row.ypp.value} rank={row.ypp.rank} mode={mode} formatValue={oneDecimal} heat={heat?.resolve("ypp", row.abbr)?.style ?? null} />
                  <MetricCell value={row.epa.value} rank={row.epa.rank} mode={mode} formatValue={oneDecimal} heat={heat?.resolve("epa", row.abbr)?.style ?? null} />
                  <MetricCell value={row.success.value} rank={row.success.rank} mode={mode} formatValue={oneDecimal} heat={heat?.resolve("success", row.abbr)?.style ?? null} />
                  <SosCell value={row.sos.value} rank={row.sos.rank} mode={mode} />
                  <td className="nfl-pr-rec">{row.record ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <StickyHeaderClone geometry={geometry} sort={sort} onSort={onSort} />
      </div>
    </div>
  );
}
