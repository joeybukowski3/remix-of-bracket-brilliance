import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Trophy } from "lucide-react";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useNflV03PublicPowerRatings } from "@/hooks/useNflV03PublicPowerRatings";
import { useNflCurrentRating2026 } from "@/hooks/useNflCurrentRating2026";
import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import { getSeoMeta } from "@/lib/seo";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { NFL_V03_PUBLIC_PRESEASON_SEASON } from "@/lib/nfl/publicPowerRatings";

const CURRENT_SEASON = 2026;

type ViewMode = "rankings" | "ratings";

/**
 * Row shape for this page only: universal current OVR/OFF/DEF/rank
 * (authoritative, all from useNflCurrentRating2026 -- the same Current Power
 * Board every other current-rating surface on the site reads) merged with
 * team identity (from the canonical teams.json registry, independent of
 * either rating board) and W-L record (from the existing v0.3.1 public
 * board, which is the only source of that field). Record is optional per row
 * on purpose -- a team missing a record must never block or replace the
 * universal OVR/OFF/DEF for that row.
 */
type NflPowerPageRow = {
  abbr: string;
  name: string;
  slug: string | null;
  color: string;
  rank: number;
  rating: number;
  offenseRating: number | null;
  offRank: number | null;
  defenseRating: number | null;
  defRank: number | null;
  record: string | null;
};

/** Absolute 1-99 scale heat, centred on 50. The old scale-center-relative display mode is gone. */
function heatStyle(value: number): { bg: string; fg: string } {
  const t = Math.max(0, Math.min(1, value / 100));
  if (t >= 0.5) {
    const k = (t - 0.5) * 2;
    return { bg: `rgba(22, 163, 74, ${0.1 + k * 0.32})`, fg: k > 0.55 ? "#0f5132" : "#166534" };
  }
  const k = (0.5 - t) * 2;
  return { bg: `rgba(220, 38, 38, ${0.1 + k * 0.32})`, fg: k > 0.55 ? "#7f1d1d" : "#991b1b" };
}

function UnitCell({ value, rank }: { value: number | null; rank: number | null }) {
  if (value === null || rank === null) {
    return (
      <td className="nfl-pr-heat">
        <span className="nfl-pr-heatval nfl-pr-unavailable">—</span>
      </td>
    );
  }
  const { bg, fg } = heatStyle(value);
  return (
    <td style={{ background: bg }} className="nfl-pr-heat">
      <span className="nfl-pr-heatval" style={{ color: fg }}>
        {value.toFixed(1)}
      </span>
      <span className="nfl-pr-heatrank">#{rank}</span>
    </td>
  );
}

function OvrCell({ rating, mode }: { rating: number; mode: ViewMode }) {
  const { bg, fg } = heatStyle(rating);
  return (
    <td style={{ background: bg }} className="nfl-pr-heat">
      <span
        className={`nfl-pr-heatval ${mode === "ratings" ? "nfl-pr-value-primary" : "nfl-pr-value-secondary"}`}
        style={{ color: fg }}
      >
        {rating.toFixed(1)}
      </span>
    </td>
  );
}

function RankCell({ rank, mode }: { rank: number; mode: ViewMode }) {
  return (
    <td className="nfl-pr-rank">
      <span className={mode === "rankings" ? "nfl-pr-value-primary" : "nfl-pr-value-secondary"}>
        #{rank}
      </span>
    </td>
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

function TeamCell({ row }: { row: NflPowerPageRow }) {
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

export default function NFL() {
  const seo = getSeoMeta("nfl");
  usePageSeo({
    title: seo.title,
    description: seo.description,
    path: seo.path,
    noindex: seo.noindex ?? false,
  });
  const [mode, setMode] = useState<ViewMode>("rankings");

  const current = useNflCurrentRating2026();
  const teamsData = useNflSeasonData(CURRENT_SEASON);
  const offDef = useNflV03PublicPowerRatings(NFL_V03_PUBLIC_PRESEASON_SEASON);

  const teamsByAbbr = useMemo(() => {
    const map = new Map<string, { name: string; slug: string; primaryColor: string }>();
    for (const team of teamsData.data?.teams ?? []) {
      map.set(team.abbr, { name: team.name, slug: team.slug, primaryColor: team.primaryColor });
    }
    return map;
  }, [teamsData.data]);

  // Record (W-L) has no equivalent in the Current Power Board -- it is the
  // one field on this page still sourced from the v0.3.1 public board.
  const recordByAbbr = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const team of offDef.data?.teams ?? []) map.set(team.abbr, team.sourceRecord);
    return map;
  }, [offDef.data]);

  const rows = useMemo<NflPowerPageRow[]>(() => {
    if (!current.data) return [];
    return current.data.teams.map((team) => {
      const identity = teamsByAbbr.get(team.abbr) ?? null;
      return {
        abbr: team.abbr,
        rank: team.rank,
        rating: team.rating,
        name: identity?.name ?? team.team,
        slug: identity?.slug ?? null,
        color: identity?.primaryColor ?? "#334155",
        offenseRating: team.offenseRating,
        offRank: team.offenseRank,
        defenseRating: team.defenseRating,
        defRank: team.defenseRank,
        record: recordByAbbr.get(team.abbr) ?? null,
      };
    });
  }, [current.data, teamsByAbbr, recordByAbbr]);

  // Universal OVR/OFF/DEF (+ the canonical team registry it needs to render a
  // row at all) is authoritative and page-blocking -- all three now come
  // from the same Current Power Board, so there is no longer a separate
  // "OFF/DEF supplementary" loading state.
  const loading = current.loading || teamsData.loading;
  const error = current.error ?? teamsData.error;

  // OFF/DEF provenance now follows the Current Power Board's own state --
  // OVR/OFF/DEF flip from preseason to in-season together, on the same
  // "this team has completed games" signal.
  const unitProvenanceLabel = current.data?.state === "live" ? "2026 Performance" : "2025 Performance";

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
            <div className="nfl-pr-toggle" role="group" aria-label="Power ratings view">
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
            <p className="nfl-pr-legend">
              {mode === "rankings"
                ? "Teams ordered #1-#32 by current overall rating (OVR shown alongside)."
                : "Current overall rating (1-99) shown first; league rank shown alongside."}
            </p>
          </div>

          {loading && (
            <p className="nfl-pr-status" role="status">
              Loading 2026 power ratings…
            </p>
          )}
          {!loading && error && (
            <p className="nfl-pr-status nfl-pr-status-error" role="alert">
              Unable to load power ratings: {error}
            </p>
          )}

          {!loading && !error && rows.length > 0 && (
            <>
              <div className="nfl-pr-scroll" role="region" aria-label="NFL power ratings" tabIndex={0}>
                <table className="nfl-pr-table">
                  <colgroup>
                    <col className="nfl-pr-col-rank" />
                    <col className="nfl-pr-col-team" />
                    <col className="nfl-pr-col-rating" />
                    <col className="nfl-pr-col-rating" />
                    <col className="nfl-pr-col-rating" />
                    <col className="nfl-pr-col-record" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">Rank</th>
                      <th scope="col" className="nfl-pr-th-team">
                        Team
                      </th>
                      <th scope="col">
                        OFF
                        <span className="nfl-pr-th-sub">{unitProvenanceLabel}</span>
                      </th>
                      <th scope="col">
                        DEF
                        <span className="nfl-pr-th-sub">{unitProvenanceLabel}</span>
                      </th>
                      <th scope="col">OVR</th>
                      <th scope="col">Record</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.abbr}>
                        <RankCell rank={row.rank} mode={mode} />
                        <TeamCell row={row} />
                        <UnitCell value={row.offenseRating} rank={row.offRank} />
                        <UnitCell value={row.defenseRating} rank={row.defRank} />
                        <OvrCell rating={row.rating} mode={mode} />
                        <td className="nfl-pr-rec">{row.record ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="nfl-pr-foot">
                OVR is the current Joe Knows Ball 2026 overall team rating (1-99, higher is better).
                Preseason OVR begins from the approved 2026 projection; once games are played,
                current-season performance progressively updates the number. OFF/DEF are objective
                unit-performance metrics reflecting {unitProvenanceLabel.toLowerCase()}.
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}

/**
 * Page-scoped CSS for the ratings board.
 *
 * The heat cells need per-cell computed backgrounds and the table needs a fixed
 * column layout, neither of which is a good fit for utility classes -- so this
 * table keeps its own stylesheet. The Rankings/Ratings button group reuses the
 * old toggle's chrome styling (it is still exactly a two-option button group),
 * but the modes it switches are entirely new -- the old scale-center-relative
 * display mode and its math are gone, not hidden behind this markup.
 */
const STYLES = `
  .nfl-pr-promo{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px 14px;border-radius:8px;border:1px solid #1e293b;background:#0f172a;color:#fff;text-decoration:none}
  .nfl-pr-promo:hover{background:#172033}.nfl-pr-promo:focus-visible{outline:2px solid #0ea5e9;outline-offset:2px}
  .nfl-pr-promo-icon{display:flex;height:32px;width:32px;flex-shrink:0;align-items:center;justify-content:center;border-radius:6px;background:rgba(255,255,255,.1)}
  .nfl-pr-promo-body{min-width:0;flex:1}.nfl-pr-promo-eyebrow{display:block;font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#7dd3fc}.nfl-pr-promo-title{display:block;margin-top:1px;font-size:.9rem;font-weight:700}.nfl-pr-promo-desc{display:block;margin-top:2px;font-size:.78rem;line-height:1.4;color:rgba(255,255,255,.7);max-width:44rem}
  .nfl-pr-promo-cta{display:inline-flex;flex-shrink:0;align-items:center;gap:6px;border-radius:6px;background:#fff;color:#0f172a;font-size:.76rem;font-weight:600;padding:6px 12px}
  .nfl-pr-layout{display:grid;align-items:start}.nfl-pr-panel{width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}.nfl-pr-controls{padding:12px 14px;border-bottom:1px solid #f1f5f9}.nfl-pr-toggle{display:inline-flex;gap:6px}.nfl-pr-toggle button{appearance:none;border:1px solid #e2e8f0;background:#fff;font-size:12px;font-weight:600;color:#475569;padding:5px 10px;border-radius:4px;cursor:pointer}.nfl-pr-toggle button:hover{border-color:#94a3b8;color:#0f172a}.nfl-pr-toggle button.is-active{background:#0f172a;border-color:#0f172a;color:#fff}.nfl-pr-toggle button:focus-visible{outline:2px solid #0ea5e9;outline-offset:1px}.nfl-pr-legend{font-size:11.5px;color:#64748b;margin-top:8px}
  .nfl-pr-status{padding:20px 14px;font-size:14px;color:#475569}.nfl-pr-status-error{color:#991b1b}
  .nfl-pr-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}.nfl-pr-scroll:focus-visible{outline:2px solid #0ea5e9;outline-offset:-2px}.nfl-pr-table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}.nfl-pr-col-rank{width:44px}.nfl-pr-col-team{width:230px}.nfl-pr-col-rating{width:165px}.nfl-pr-col-record{width:76px}.nfl-pr-table thead th{background:#f1f5f9;color:#475569;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:8px;text-align:center;white-space:nowrap;border-bottom:1px solid #e2e8f0}.nfl-pr-th-team{text-align:left!important}.nfl-pr-th-sub{display:block;font-size:8.5px;font-weight:500;letter-spacing:0;text-transform:none;color:#94a3b8;margin-top:1px}.nfl-pr-table tbody tr{border-bottom:1px solid #f1f5f9}.nfl-pr-table tbody tr:hover{background:#f8fafc}.nfl-pr-rank{text-align:center;font-variant-numeric:tabular-nums;color:#0f172a}
  .nfl-pr-team{padding:0}.nfl-pr-team-link{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;color:inherit;text-decoration:none}.nfl-pr-team-link:focus-visible{outline:2px solid #0ea5e9;outline-offset:-2px}.nfl-pr-team-link:hover .nfl-pr-name{text-decoration:underline}.nfl-pr-accent{width:3px;height:24px;border-radius:2px;flex-shrink:0}.nfl-pr-logo{width:26px;height:26px;object-fit:contain;flex-shrink:0}.nfl-pr-badge{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;flex-shrink:0}.nfl-pr-name{font-weight:600;font-size:13px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .nfl-pr-heat{text-align:center;padding:6px}.nfl-pr-heatval{display:block;font-weight:600;font-size:13px;font-variant-numeric:tabular-nums}.nfl-pr-heatrank{display:block;font-size:9.5px;color:#94a3b8;font-weight:500;margin-top:1px}.nfl-pr-unavailable{color:#cbd5e1;font-weight:600}.nfl-pr-rec{text-align:center;font-weight:600;font-variant-numeric:tabular-nums;color:#334155}.nfl-pr-foot{font-size:11px;color:#94a3b8;line-height:1.5;padding:12px 14px;border-top:1px solid #f1f5f9}
  .nfl-pr-value-primary{font-size:15px;font-weight:800}.nfl-pr-value-secondary{font-size:11.5px;font-weight:600;color:#94a3b8}
  @media(max-width:640px){.nfl-pr-table{min-width:520px;font-size:11px}.nfl-pr-col-rank{width:36px}.nfl-pr-col-team{width:58px}.nfl-pr-col-rating{width:112px}.nfl-pr-col-record{width:54px}.nfl-pr-table thead th{font-size:9px;padding:7px 4px}.nfl-pr-team-link{padding:6px 4px;gap:0;justify-content:center}.nfl-pr-accent,.nfl-pr-name{display:none}.nfl-pr-logo,.nfl-pr-badge{width:24px;height:24px}.nfl-pr-heat{padding:6px 3px}.nfl-pr-heatval{font-size:11px}.nfl-pr-heatrank{font-size:8.5px}.nfl-pr-value-primary{font-size:13px}.nfl-pr-value-secondary{font-size:10px}}
`;
