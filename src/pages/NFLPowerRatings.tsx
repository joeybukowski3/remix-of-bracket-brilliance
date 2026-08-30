import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Trophy } from "lucide-react";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { MetricCell, type MetricCellMode } from "@/components/nfl/powerRatings/MetricCell";
import { useNflPowerRatingsBoard, type PowerRatingsRow } from "@/hooks/useNflPowerRatingsBoard";
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

const oneDecimal = (value: number) => value.toFixed(1);

type SortHandler = (key: PowerRatingsSortKey) => void;

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

  const { loading, error, board } = useNflPowerRatingsBoard(period);

  // Changing period resets the sort to that period's primary ranking (#1 → #32).
  // Changing the Rankings/Ratings display mode must NOT reset it.
  useEffect(() => {
    setSort(defaultSortForPeriod());
  }, [period]);

  const handleSort: SortHandler = (key) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: defaultSortDirection(key) }
    );
  };

  const sortedRows = useMemo(
    () => (board ? sortPowerRatingRows(board.rows, sort) : []),
    [board, sort]
  );

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
              <div className="nfl-pr-scroll" role="region" aria-label="NFL power ratings" tabIndex={0}>
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
                  <thead>
                    <tr>
                      <SortableTh label="Team" title="team name" sortKey="team" sort={sort} onSort={handleSort} className="nfl-pr-th-team" />
                      <SortableTh label="OVR" title="overall rating" sortKey="ovr" sort={sort} onSort={handleSort} />
                      <SortableTh label="OFF" title="offensive rating" sortKey="off" sort={sort} onSort={handleSort} />
                      <SortableTh label="DEF" title="defensive rating" sortKey="def" sort={sort} onSort={handleSort} />
                      <SortableTh label="YPP" title="yards per play rating" sortKey="ypp" sort={sort} onSort={handleSort} />
                      <SortableTh label="EPA" title="EPA rating" sortKey="epa" sort={sort} onSort={handleSort} />
                      <SortableTh label="Success" title="success rate rating" sortKey="success" sort={sort} onSort={handleSort} />
                      <SortableTh label="SoS" title="strength of schedule" sortKey="sos" sort={sort} onSort={handleSort} />
                      <SortableTh label="Record" title="period record win percentage" sortKey="record" sort={sort} onSort={handleSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row) => (
                      <tr key={row.abbr}>
                        <TeamCell row={row} />
                        <MetricCell value={row.ovr.value} rank={row.ovr.rank} mode={mode} formatValue={oneDecimal} heat />
                        <MetricCell value={row.off.value} rank={row.off.rank} mode={mode} formatValue={oneDecimal} heat />
                        <MetricCell value={row.def.value} rank={row.def.rank} mode={mode} formatValue={oneDecimal} heat />
                        <MetricCell value={row.ypp.value} rank={row.ypp.rank} mode={mode} formatValue={oneDecimal} heat />
                        <MetricCell value={row.epa.value} rank={row.epa.rank} mode={mode} formatValue={oneDecimal} heat />
                        <MetricCell value={row.success.value} rank={row.success.rank} mode={mode} formatValue={oneDecimal} heat />
                        <SosCell value={row.sos.value} rank={row.sos.rank} mode={mode} />
                        <td className="nfl-pr-rec">{row.record ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

const STYLES = `
  .nfl-pr-promo{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px 14px;border-radius:8px;border:1px solid #1e293b;background:#0f172a;color:#fff;text-decoration:none}
  .nfl-pr-promo:hover{background:#172033}.nfl-pr-promo:focus-visible{outline:2px solid #0ea5e9;outline-offset:2px}
  .nfl-pr-promo-icon{display:flex;height:32px;width:32px;flex-shrink:0;align-items:center;justify-content:center;border-radius:6px;background:rgba(255,255,255,.1)}
  .nfl-pr-promo-body{min-width:0;flex:1}.nfl-pr-promo-eyebrow{display:block;font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#7dd3fc}.nfl-pr-promo-title{display:block;margin-top:1px;font-size:.9rem;font-weight:700}.nfl-pr-promo-desc{display:block;margin-top:2px;font-size:.78rem;line-height:1.4;color:rgba(255,255,255,.7);max-width:44rem}
  .nfl-pr-promo-cta{display:inline-flex;flex-shrink:0;align-items:center;gap:6px;border-radius:6px;background:#fff;color:#0f172a;font-size:.76rem;font-weight:600;padding:6px 12px}
  .nfl-pr-layout{display:grid;align-items:start}.nfl-pr-panel{width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}.nfl-pr-controls{padding:12px 14px;border-bottom:1px solid #f1f5f9}.nfl-pr-controlrow{display:flex;flex-wrap:wrap;gap:16px}.nfl-pr-toggle{display:inline-flex;gap:6px}.nfl-pr-toggle button{appearance:none;border:1px solid #e2e8f0;background:#fff;font-size:12px;font-weight:600;color:#475569;padding:5px 10px;border-radius:4px;cursor:pointer}.nfl-pr-toggle button:hover{border-color:#94a3b8;color:#0f172a}.nfl-pr-toggle button.is-active{background:#0f172a;border-color:#0f172a;color:#fff}.nfl-pr-toggle button:focus-visible{outline:2px solid #0ea5e9;outline-offset:1px}.nfl-pr-legend{font-size:11.5px;color:#64748b;margin-top:8px}
  .nfl-pr-notes{margin:0;padding:10px 14px 10px 30px;background:#fffbeb;border-bottom:1px solid #fde68a;font-size:11.5px;color:#92400e;line-height:1.5}
  .nfl-pr-status{padding:20px 14px;font-size:14px;color:#475569}.nfl-pr-status-error{color:#991b1b}
  .nfl-pr-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}.nfl-pr-scroll:focus-visible{outline:2px solid #0ea5e9;outline-offset:-2px}.nfl-pr-table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;min-width:760px}.nfl-pr-col-team{width:200px}.nfl-pr-col-metric{width:74px}.nfl-pr-col-record{width:64px}.nfl-pr-table thead th{background:#f1f5f9;color:#475569;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:8px 6px;text-align:center;white-space:nowrap;border-bottom:1px solid #e2e8f0}.nfl-pr-th-team{text-align:left!important}.nfl-pr-table tbody tr{border-bottom:1px solid #f1f5f9}.nfl-pr-table tbody tr:hover{background:#f8fafc}
  .nfl-pr-th-team{position:sticky;left:0;z-index:3;background:#f1f5f9;border-right:2px solid #cbd5e1}
  .nfl-pr-team{position:sticky;left:0;z-index:2;padding:0;background:#fff;border-right:2px solid #cbd5e1;border-bottom:1px solid #f1f5f9}
  .nfl-pr-table tbody tr:hover .nfl-pr-team{background:#f8fafc}.nfl-pr-team-link{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;color:inherit;text-decoration:none}.nfl-pr-team-link:focus-visible{outline:2px solid #0ea5e9;outline-offset:-2px}.nfl-pr-team-link:hover .nfl-pr-name{text-decoration:underline}.nfl-pr-accent{width:3px;height:24px;border-radius:2px;flex-shrink:0}.nfl-pr-logo{width:26px;height:26px;object-fit:contain;flex-shrink:0}.nfl-pr-badge{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;flex-shrink:0}.nfl-pr-name{font-weight:600;font-size:13px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .nfl-pr-sortbtn{display:inline-flex;align-items:center;justify-content:center;gap:3px;width:100%;padding:0;margin:0;background:none;border:0;font:inherit;letter-spacing:inherit;text-transform:inherit;color:inherit;cursor:pointer}.nfl-pr-sortbtn:hover,.nfl-pr-sortbtn.is-active{color:#0f172a}.nfl-pr-sortbtn:focus-visible{outline:2px solid #0ea5e9;outline-offset:2px;border-radius:2px}.nfl-pr-th-team .nfl-pr-sortbtn{justify-content:flex-start}.nfl-pr-sortind{font-size:9px;line-height:1}
  .nfl-pr-heat{text-align:center;padding:6px 4px}.nfl-pr-heatval{display:block;font-variant-numeric:tabular-nums}.nfl-pr-heatrank{display:block;margin-top:1px}.nfl-pr-unavailable{color:#cbd5e1;font-weight:600}.nfl-pr-rec{text-align:center;font-weight:600;font-variant-numeric:tabular-nums;color:#334155}.nfl-pr-foot{font-size:11px;color:#94a3b8;line-height:1.5;padding:12px 14px;border-top:1px solid #f1f5f9}.nfl-pr-foot p{margin:0 0 6px}.nfl-pr-foot p:last-child{margin-bottom:0}.nfl-pr-foot strong{color:#64748b}
  .nfl-pr-value-primary{font-size:14px;font-weight:800;color:#0f172a}.nfl-pr-value-secondary{font-size:10.5px;font-weight:600;color:#94a3b8}
  @media(max-width:640px){.nfl-pr-table{font-size:10px;min-width:376px}.nfl-pr-col-team{width:40px}.nfl-pr-col-metric{width:42px}.nfl-pr-col-record{width:42px}.nfl-pr-table thead th{font-size:7.5px;letter-spacing:.02em;padding:4px 2px}.nfl-pr-th-team,.nfl-pr-team{border-right-width:1.5px}.nfl-pr-team-link{padding:4px 0;gap:0;justify-content:center}.nfl-pr-accent,.nfl-pr-name{display:none}.nfl-pr-logo,.nfl-pr-badge{width:22px;height:22px}.nfl-pr-heat{padding:3px 2px}.nfl-pr-heatrank{margin-top:0}.nfl-pr-value-primary{font-size:9.5px}.nfl-pr-value-secondary{font-size:7px}.nfl-pr-rec{font-size:9.5px}}
`;
