import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Trophy } from "lucide-react";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { type MetricCellMode } from "@/components/nfl/powerRatings/MetricCell";
import { PowerRatingsTable } from "@/components/nfl/powerRatings/PowerRatingsTable";
import { useNflPowerRatingsBoard } from "@/hooks/useNflPowerRatingsBoard";
import { buildPowerRatingsHeat } from "@/lib/nfl/powerRatingsHeat";
import { JKB_HEAT_LEGEND, jkbHeatStyle } from "@/lib/shared/jkbHeat";
import {
  POWER_RATINGS_PERIODS,
  POWER_RATINGS_PERIOD_LABELS,
  type PowerRatingsPeriod,
} from "@/lib/nfl/powerRatingsPeriod";
import {
  defaultSortDirection,
  defaultSortForPeriod,
  sortPowerRatingRows,
  type PowerRatingsSort,
  type PowerRatingsSortKey,
} from "@/lib/nfl/powerRatingsSort";
import {
  POWER_RATINGS_GROUP_VIEWS,
  POWER_RATINGS_GROUP_VIEW_LABELS,
  groupRowsByConference,
  groupRowsByDivision,
  type PowerRatingsGroupView,
} from "@/lib/nfl/powerRatingsGroups";

export default function NFLPowerRatings() {
  const seo = getSeoMeta("nfl");
  usePageSeo({
    title: seo.title,
    description: seo.description,
    path: "/nfl/power-ratings",
    noindex: seo.noindex ?? false,
  });

  const [period, setPeriod] = useState<PowerRatingsPeriod>("2026");
  const [mode, setMode] = useState<MetricCellMode>("rankings");
  const [sort, setSort] = useState<PowerRatingsSort>(defaultSortForPeriod);
  const [groupView, setGroupView] = useState<PowerRatingsGroupView>("league");

  const { loading, error, board } = useNflPowerRatingsBoard(period);

  // Changing period resets the sort to that period's primary ranking (#1 → #32).
  // Changing the Rankings/Ratings display mode or the League/Conference/Division
  // grouping must NOT reset it.
  useEffect(() => {
    setSort(defaultSortForPeriod());
  }, [period]);

  const handleSort = (key: PowerRatingsSortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: defaultSortDirection(key) }
    );
  };

  // Every grouped view is derived by partitioning this SAME globally-sorted
  // array — grouping a sorted sequence by a predicate preserves the comparator's
  // order within each group, so a shared sort state sorts every group
  // independently without teams ever crossing group boundaries.
  const sortedRows = useMemo(
    () => (board ? sortPowerRatingRows(board.rows, sort) : []),
    [board, sort]
  );

  // Heat is computed once per period against the full, UNSORTED, UNGROUPED team
  // population, so row sorting, grouping, and the Rankings/Ratings toggle never
  // change a cell's colour — League, Conference, and Division all read the same
  // lookup.
  const heat = useMemo(() => (board ? buildPowerRatingsHeat(board.rows) : null), [board]);

  const conferenceGroups = useMemo(() => groupRowsByConference(sortedRows), [sortedRows]);
  const divisionGroups = useMemo(() => groupRowsByDivision(sortedRows), [sortedRows]);

  return (
    <>
      <style>{STYLES}</style>
      <NflPageHeader
        eyebrow="NFL · Power Ratings"
        title="2026 NFL Power Rankings"
        description="Joe Knows Ball projected team strength, updated as 2026 results are incorporated."
      />

      <Link
        to="/16-0"
        className="nfl-pr-promo"
        aria-label="Start Draft: 16-0 Fantasy Draft Simulator. Build a team in a fast 12-team PPR draft, then simulate the regular season and playoffs"
      >
        <span className="nfl-pr-promo-icon" aria-hidden="true">
          <Trophy className="h-4 w-4" />
        </span>
        <span className="nfl-pr-promo-body">
          <span className="nfl-pr-promo-eyebrow">Fantasy Game</span>
          <span className="nfl-pr-promo-title">16-0 Fantasy Draft Simulator</span>
          <span className="nfl-pr-promo-desc">
            Draft a 17-player roster in a fast 12-team PPR draft, then simulate the season.
          </span>
        </span>
        <span className="nfl-pr-promo-cta">
          Start Draft
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </Link>

      <div className="nfl-pr-layout">
        <section className="nfl-pr-panel">
          <div className="nfl-pr-controls">
            <div className="nfl-pr-controlrow">
              <div className="nfl-pr-toggle" role="group" aria-label="Period">
                {POWER_RATINGS_PERIODS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={period === value ? "is-active" : ""}
                    onClick={() => setPeriod(value)}
                    aria-pressed={period === value}
                  >
                    {POWER_RATINGS_PERIOD_LABELS[value].tab}
                  </button>
                ))}
              </div>
              <div className="nfl-pr-toggle" role="group" aria-label="Display">
                <button
                  type="button"
                  className={mode === "rankings" ? "is-active" : ""}
                  onClick={() => setMode("rankings")}
                  aria-pressed={mode === "rankings"}
                >
                  Rankings
                </button>
                <button
                  type="button"
                  className={mode === "ratings" ? "is-active" : ""}
                  onClick={() => setMode("ratings")}
                  aria-pressed={mode === "ratings"}
                >
                  Ratings
                </button>
              </div>
              <div className="nfl-pr-toggle" role="group" aria-label="View">
                {POWER_RATINGS_GROUP_VIEWS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={groupView === value ? "is-active" : ""}
                    onClick={() => setGroupView(value)}
                    aria-pressed={groupView === value}
                  >
                    {POWER_RATINGS_GROUP_VIEW_LABELS[value]}
                  </button>
                ))}
              </div>
            </div>
            <p className="nfl-pr-legend">
              {POWER_RATINGS_PERIOD_LABELS[period].full}
              {" · "}
              {mode === "rankings"
                ? "each cell shows league rank first, rating/value second."
                : "each cell shows the rating/value first, league rank second."}
            </p>
          </div>

          {loading && (
            <p className="nfl-pr-status" role="status">
              Loading power ratings…
            </p>
          )}
          {!loading && error && (
            <p className="nfl-pr-status nfl-pr-status-error" role="alert">
              Unable to load power ratings: {error}
            </p>
          )}

          {!loading && !error && board && (
            <>
              {board.notes.length > 0 && (
                <ul className="nfl-pr-notes">
                  {board.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}

              {groupView === "league" && (
                <PowerRatingsTable
                  rows={sortedRows}
                  mode={mode}
                  sort={sort}
                  onSort={handleSort}
                  heat={heat}
                  ariaLabel="NFL power ratings"
                />
              )}

              {groupView === "conference" &&
                conferenceGroups.map((group) => (
                  <PowerRatingsTable
                    key={group.key}
                    rows={group.rows}
                    mode={mode}
                    sort={sort}
                    onSort={handleSort}
                    heat={heat}
                    ariaLabel={`NFL power ratings — ${group.name}`}
                    groupLabel={{ eyebrow: group.eyebrow, name: group.name, count: group.rows.length }}
                  />
                ))}

              {groupView === "division" &&
                divisionGroups.map((group) => (
                  <PowerRatingsTable
                    key={group.key}
                    rows={group.rows}
                    mode={mode}
                    sort={sort}
                    onSort={handleSort}
                    heat={heat}
                    ariaLabel={`NFL power ratings — ${group.name}`}
                    groupLabel={{ eyebrow: group.eyebrow, name: group.name, count: group.rows.length }}
                  />
                ))}

              <div className="nfl-pr-heatlegend">
                <span className="nfl-pr-heatlegend-label">
                  JKB Heat · OVR / OFF / DEF / YPP / EPA / Success — favorable percentile vs. the other teams this period
                </span>
                <ul>
                  {JKB_HEAT_LEGEND.map((entry) => {
                    const s = jkbHeatStyle(entry.tone);
                    return (
                      <li
                        key={entry.id}
                        style={{ backgroundColor: s.backgroundColor, color: s.color, boxShadow: s.boxShadow }}
                      >
                        <span className="nfl-pr-heatlegend-name">{entry.label}</span>
                        <span className="nfl-pr-heatlegend-range">{entry.percentileRange}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="nfl-pr-foot">
                <p>
                  <strong>OVR / OFF / DEF:</strong>{" "}
                  {board.provenance.ovr}
                  {board.period === "last8" ? "" : "."}
                </p>
                <p>
                  <strong>EPA / YPP Overall:</strong> {board.provenance.efficiency}. Offense and
                  defense are each league-normalized, the defensive side inverted, then blended 50/50;
                  higher is always better. Ranked #1–#32 from the unrounded blend.
                </p>
                <p>
                  <strong>Success Overall:</strong> {board.provenance.success}.
                </p>
                <p>
                  <strong>SoS:</strong> {board.provenance.sos}
                </p>
                <p>
                  <strong>Record:</strong> {board.provenance.record}.
                </p>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}

// Sticky header top offset (STICKY_TOP in PowerRatingsTable.tsx) = SiteHeader's real
// rendered height (`min-h-[72px]` + its `border-b` hairline = 73px —
// src/components/layout/SiteHeader.tsx), so the table header sticks directly under
// global chrome and never covers it.
// z-index values mirror the shared TABLE_LAYER ladder
// (src/components/ui/dense-table.tsx): sticky header clone 20, frozen column 10,
// header/frozen intersection 30 — all below SiteHeader's z-[100].
const STYLES = `
  .nfl-pr-promo{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px 14px;border-radius:8px;border:1px solid #1e293b;background:#0f172a;color:#fff;text-decoration:none}
  .nfl-pr-promo:hover{background:#172033}.nfl-pr-promo:focus-visible{outline:2px solid #0ea5e9;outline-offset:2px}
  .nfl-pr-promo-icon{display:flex;height:32px;width:32px;flex-shrink:0;align-items:center;justify-content:center;border-radius:6px;background:rgba(255,255,255,.1)}
  .nfl-pr-promo-body{min-width:0;flex:1}.nfl-pr-promo-eyebrow{display:block;font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#7dd3fc}.nfl-pr-promo-title{display:block;margin-top:1px;font-size:.9rem;font-weight:700}.nfl-pr-promo-desc{display:block;margin-top:2px;font-size:.78rem;line-height:1.4;color:rgba(255,255,255,.7);max-width:44rem}
  .nfl-pr-promo-cta{display:inline-flex;flex-shrink:0;align-items:center;gap:6px;border-radius:6px;background:#fff;color:#0f172a;font-size:.76rem;font-weight:600;padding:6px 12px}
  .nfl-pr-layout{display:grid;align-items:start}.nfl-pr-panel{width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}.nfl-pr-controls{padding:12px 14px;border-bottom:1px solid #f1f5f9}.nfl-pr-controlrow{display:flex;flex-wrap:wrap;gap:16px}.nfl-pr-toggle{display:inline-flex;gap:6px}.nfl-pr-toggle button{appearance:none;border:1px solid #e2e8f0;background:#fff;font-size:12px;font-weight:600;color:#475569;padding:5px 10px;border-radius:4px;cursor:pointer}.nfl-pr-toggle button:hover{border-color:#94a3b8;color:#0f172a}.nfl-pr-toggle button.is-active{background:#0f172a;border-color:#0f172a;color:#fff}.nfl-pr-toggle button:focus-visible{outline:2px solid #0ea5e9;outline-offset:1px}.nfl-pr-legend{font-size:11.5px;color:#64748b;margin-top:8px}
  .nfl-pr-notes{margin:0;padding:10px 14px 10px 30px;background:#fffbeb;border-bottom:1px solid #fde68a;font-size:11.5px;color:#92400e;line-height:1.5}
  .nfl-pr-status{padding:20px 14px;font-size:14px;color:#475569}.nfl-pr-status-error{color:#991b1b}
  /* Grouped views (Conference / Division) get a full-width separator band above
     each table so adjacent grouped tables never visually merge. League view has
     no groupLabel and no --grouped class, so it gets neither band nor spacing. */
  .nfl-pr-group--grouped + .nfl-pr-group--grouped{margin-top:14px}
  .nfl-pr-group--conference + .nfl-pr-group--conference{margin-top:20px}
  .nfl-pr-grouplabel{display:flex;align-items:baseline;gap:10px;padding:10px 14px;background:#f1f5f9;border-top:3px solid #0f172a;border-bottom:1px solid #e2e8f0}
  .nfl-pr-group--conference > .nfl-pr-grouplabel{background:#e2e8f0}
  .nfl-pr-grouplabel-eyebrow{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8}
  .nfl-pr-grouplabel-name{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.02em;color:#0f172a}
  .nfl-pr-grouplabel-count{font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#94a3b8;margin-left:auto}
  .nfl-pr-tablewrap{position:relative}
  .nfl-pr-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}.nfl-pr-scroll:focus-visible{outline:2px solid #0ea5e9;outline-offset:-2px}.nfl-pr-table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;table-layout:fixed;min-width:760px}.nfl-pr-col-team{width:200px}.nfl-pr-col-metric{width:74px}.nfl-pr-col-record{width:64px}
  .nfl-pr-table thead th{z-index:20;background:#0f172a;color:#f8fafc;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;padding:9px 6px;text-align:center;white-space:nowrap;border-bottom:2px solid #1e293b}
  .nfl-pr-th-team{text-align:left!important}.nfl-pr-table tbody tr{border-bottom:1px solid #f1f5f9}.nfl-pr-table tbody tr:hover{background:#f8fafc}
  .nfl-pr-th-team{position:sticky;left:0;z-index:30;background:#0f172a;border-right:2px solid #1e293b}
  .nfl-pr-team{position:sticky;left:0;z-index:10;padding:0;background:#fff;border-right:2px solid #cbd5e1;border-bottom:1px solid #f1f5f9}
  /* Page-scroll sticky clone — see PowerRatingsTable.tsx useStickyHeaderClone.
     .nfl-pr-scroll needs overflow-x:auto for mobile-local horizontal scroll, which
     makes it (not the viewport) the containing block for a CSS position:sticky
     descendant, so a plain sticky <thead> can never track page scroll here. This
     fixed-position clone is rendered outside that scroll container instead, its
     left/width/scrollLeft synced in JS so it visually replaces the real header
     exactly when the table's own header would otherwise scroll under SiteHeader. */
  .nfl-pr-stickyclone{position:fixed;top:73px;z-index:20;overflow:hidden;background:#0f172a;color:#f8fafc;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;border-bottom:2px solid #1e293b;pointer-events:none}
  .nfl-pr-stickyclone-clip{position:absolute;inset:0;overflow:hidden}
  .nfl-pr-stickyclone-row{position:absolute;top:0;bottom:0;left:0;will-change:transform}
  .nfl-pr-stickyclone-cell{position:absolute;top:0;bottom:0;display:flex;align-items:center;justify-content:center;gap:3px;padding:0 6px;margin:0;border:0;background:none;font:inherit;letter-spacing:inherit;text-transform:inherit;color:inherit;box-sizing:border-box;pointer-events:auto;cursor:pointer}
  .nfl-pr-stickyclone-team{position:absolute;left:0;top:0;bottom:0;z-index:2;display:flex;align-items:center;gap:3px;padding:0 6px;margin:0;border:0;border-right:2px solid #1e293b;background:#0f172a;font:inherit;letter-spacing:inherit;text-transform:inherit;color:inherit;box-sizing:border-box;pointer-events:auto;cursor:pointer;text-align:left}
  .nfl-pr-table tbody tr:hover .nfl-pr-team{background:#f8fafc}.nfl-pr-team-link{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;color:inherit;text-decoration:none}.nfl-pr-team-link:focus-visible{outline:2px solid #0ea5e9;outline-offset:-2px}.nfl-pr-team-link:hover .nfl-pr-name{text-decoration:underline}.nfl-pr-accent{width:3px;height:24px;border-radius:2px;flex-shrink:0}.nfl-pr-logo{width:26px;height:26px;object-fit:contain;flex-shrink:0}.nfl-pr-badge{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;flex-shrink:0}.nfl-pr-name{font-weight:600;font-size:13px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .nfl-pr-sortbtn{display:inline-flex;align-items:center;justify-content:center;gap:3px;width:100%;padding:0;margin:0;background:none;border:0;font:inherit;letter-spacing:inherit;text-transform:inherit;color:inherit;cursor:pointer}.nfl-pr-sortbtn:hover,.nfl-pr-sortbtn.is-active{color:#7dd3fc}.nfl-pr-sortbtn:focus-visible{outline:2px solid #38bdf8;outline-offset:2px;border-radius:2px}.nfl-pr-th-team .nfl-pr-sortbtn{justify-content:flex-start}.nfl-pr-sortind{font-size:10px;line-height:1;font-weight:700;color:#7dd3fc}
  .nfl-pr-heat{text-align:center;padding:6px 4px}.nfl-pr-heatval{display:block;font-variant-numeric:tabular-nums}.nfl-pr-heatrank{display:block;margin-top:1px}.nfl-pr-unavailable{color:#cbd5e1;font-weight:600}.nfl-pr-rec{text-align:center;font-weight:600;font-variant-numeric:tabular-nums;color:#334155}.nfl-pr-foot{font-size:11px;color:#94a3b8;line-height:1.5;padding:12px 14px;border-top:1px solid #f1f5f9}.nfl-pr-foot p{margin:0 0 6px}.nfl-pr-foot p:last-child{margin-bottom:0}.nfl-pr-foot strong{color:#64748b}
  .nfl-pr-heat--painted .nfl-pr-value-primary{color:inherit}.nfl-pr-heat--painted .nfl-pr-value-secondary{color:inherit;opacity:.72}
  .nfl-pr-heatlegend{padding:10px 14px;border-top:1px solid #f1f5f9}.nfl-pr-heatlegend-label{display:block;font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#64748b;margin-bottom:6px}.nfl-pr-heatlegend ul{display:flex;flex-wrap:wrap;gap:4px;margin:0;padding:0;list-style:none}.nfl-pr-heatlegend li{display:flex;align-items:baseline;gap:5px;padding:3px 7px;border-radius:4px;font-size:10px;font-variant-numeric:tabular-nums}.nfl-pr-heatlegend-name{font-weight:700}.nfl-pr-heatlegend-range{opacity:.8}
  .nfl-pr-value-primary{font-size:14px;font-weight:800;color:#0f172a}.nfl-pr-value-secondary{font-size:10.5px;font-weight:600;color:#94a3b8}
  @media(max-width:640px){.nfl-pr-table{font-size:10px;min-width:376px}.nfl-pr-col-team{width:40px}.nfl-pr-col-metric{width:42px}.nfl-pr-col-record{width:42px}.nfl-pr-table thead th{font-size:7.5px;letter-spacing:.02em;padding:5px 2px}.nfl-pr-th-team,.nfl-pr-team{border-right-width:1.5px}.nfl-pr-team-link{padding:4px 0;gap:0;justify-content:center}.nfl-pr-accent,.nfl-pr-name{display:none}.nfl-pr-logo,.nfl-pr-badge{width:22px;height:22px}.nfl-pr-heat{padding:3px 2px}.nfl-pr-heatrank{margin-top:0}.nfl-pr-value-primary{font-size:9.5px}.nfl-pr-value-secondary{font-size:7px}.nfl-pr-rec{font-size:9.5px}.nfl-pr-grouplabel{padding:7px 8px;gap:8px}.nfl-pr-grouplabel-name{font-size:11px}.nfl-pr-grouplabel-count{font-size:8.5px}.nfl-pr-group--grouped + .nfl-pr-group--grouped{margin-top:10px}.nfl-pr-group--conference + .nfl-pr-group--conference{margin-top:12px}
    .nfl-pr-stickyclone{font-size:7.5px;letter-spacing:.02em}.nfl-pr-stickyclone-team{border-right-width:1.5px}.nfl-pr-stickyclone-cell{padding:0 2px}}
`;
