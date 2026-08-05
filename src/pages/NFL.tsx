import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Trophy } from "lucide-react";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useNflV03PublicPowerRatings } from "@/hooks/useNflV03PublicPowerRatings";
import { getSeoMeta } from "@/lib/seo";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import {
  NFL_V03_PUBLIC_PRESEASON_SEASON,
  type NflPublicPowerTeam,
} from "@/lib/nfl/publicPowerRatings";

type ViewMode = "center" | "rating";

function heatStyle(value: number, mode: ViewMode): { bg: string; fg: string } {
  const t =
    mode === "center"
      ? Math.max(0, Math.min(1, (value + 25) / 50))
      : Math.max(0, Math.min(1, value / 100));
  if (t >= 0.5) {
    const k = (t - 0.5) * 2;
    return { bg: `rgba(22, 163, 74, ${0.10 + k * 0.32})`, fg: k > 0.55 ? "#0f5132" : "#166534" };
  }
  const k = (0.5 - t) * 2;
  return { bg: `rgba(220, 38, 38, ${0.10 + k * 0.32})`, fg: k > 0.55 ? "#7f1d1d" : "#991b1b" };
}

function HeatCell({
  value,
  rank,
  mode,
}: {
  value: number;
  rank: number;
  mode: ViewMode;
}) {
  const { bg, fg } = heatStyle(value, mode);
  const display =
    mode === "center"
      ? `${value > 0 ? "+" : ""}${value.toFixed(1)}`
      : value.toFixed(1);
  return (
    <td style={{ background: bg }} className="nfl-pr-heat">
      <span className="nfl-pr-heatval" style={{ color: fg }}>
        {display}
      </span>
      <span className="nfl-pr-heatrank">#{rank}</span>
    </td>
  );
}

function TeamLogo({ team }: { team: Pick<NflPublicPowerTeam, "abbr" | "color"> }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="nfl-pr-badge" style={{ background: team.color }}>
        {team.abbr.toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={nflLogoUrl(team.abbr)}
      alt=""
      className="nfl-pr-logo"
      loading="lazy"
      onError={() => setFailed(true)}
    />
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
  const [mode, setMode] = useState<ViewMode>("rating");
  const { loading, error, data } = useNflV03PublicPowerRatings(NFL_V03_PUBLIC_PRESEASON_SEASON);

  const rows = useMemo(
    () => (data ? [...data.teams].sort((a, b) => a.rank - b.rank) : []),
    [data]
  );

  return (
    <>
      <style>{STYLES}</style>
      <NflPageHeader
        eyebrow="NFL · Power Ratings"
        title={data?.title ?? "2026 NFL Preseason Power Ratings"}
        description={
          <>
            Joe Knows Ball model v0.3 · {data?.subtitle ?? "Based on 2025 regular-season performance"}.
            Select a team for its schedule, stats, odds, value and offseason changes.
          </>
        }
      />
      {data?.fallbackExplanation ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
          {data.fallbackExplanation}
        </p>
      ) : null}

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
                <div className="nfl-pr-toggle" role="group" aria-label="Rating display mode">
                  <button
                    type="button"
                    className={mode === "rating" ? "is-active" : ""}
                    onClick={() => setMode("rating")}
                    aria-pressed={mode === "rating"}
                  >
                    Public Rating
                  </button>
                  <button
                    type="button"
                    className={mode === "center" ? "is-active" : ""}
                    onClick={() => setMode("center")}
                    aria-pressed={mode === "center"}
                  >
                    vs Scale Center
                  </button>
                </div>
                <p className="nfl-pr-legend">
                  {mode === "rating"
                    ? "Each rating is the fixed public scale (1–99, center 50)."
                    : "Each value shows how far a unit sits above or below the scale center of 50."}
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

              {!loading && !error && data && (
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
                          <th scope="col">Offense</th>
                          <th scope="col">Defense</th>
                          <th scope="col">Overall</th>
                          <th scope="col">{data.recordColumnLabel}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((team) => (
                          <tr key={team.teamId}>
                            <td className="nfl-pr-rank">{team.rank}</td>
                            <td className="nfl-pr-team" title={team.name}>
                              <Link
                                to={`/nfl/guide/team/${team.slug}`}
                                className="nfl-pr-team-link"
                                aria-label={`Open ${team.name} team dashboard`}
                              >
                                <span
                                  className="nfl-pr-accent"
                                  style={{ background: team.color }}
                                  aria-hidden
                                />
                                <TeamLogo team={team} />
                                <span className="nfl-pr-name">{team.name}</span>
                              </Link>
                            </td>
                            <HeatCell
                              value={
                                mode === "center" ? team.offenseVsCenter : team.offenseRating
                              }
                              rank={team.offRank}
                              mode={mode}
                            />
                            <HeatCell
                              value={
                                mode === "center" ? team.defenseVsCenter : team.defenseRating
                              }
                              rank={team.defRank}
                              mode={mode}
                            />
                            <HeatCell
                              value={
                                mode === "center" ? team.overallVsCenter : team.publicRating
                              }
                              rank={team.rank}
                              mode={mode}
                            />
                            <td className="nfl-pr-rec">{team.sourceRecord ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="nfl-pr-foot">
                    {data.formula}. Model {data.modelVersion}. Window: {data.windowType}
                    {data.selectedState === "full_season"
                      ? ` · completed team-games ${data.completedTeamGames}`
                      : ""}. Trajectory does not affect launch scoring (λ = 0). Generated{" "}
                    {new Date(data.generatedAt).toUTCString()}.
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
 * column layout, neither of which is a good fit for utility classes — so this
 * table keeps its own stylesheet. The page *chrome* (header, panel, promo) no
 * longer does: those now match the shared NFL conventions, and the old hero
 * rules were deleted rather than left behind as dead CSS.
 */
const STYLES = `
  .nfl-pr-promo{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px 14px;border-radius:8px;border:1px solid #1e293b;background:#0f172a;color:#fff;text-decoration:none}
  .nfl-pr-promo:hover{background:#172033}.nfl-pr-promo:focus-visible{outline:2px solid #0ea5e9;outline-offset:2px}
  .nfl-pr-promo-icon{display:flex;height:32px;width:32px;flex-shrink:0;align-items:center;justify-content:center;border-radius:6px;background:rgba(255,255,255,.1)}
  .nfl-pr-promo-body{min-width:0;flex:1}.nfl-pr-promo-eyebrow{display:block;font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#7dd3fc}.nfl-pr-promo-title{display:block;margin-top:1px;font-size:.9rem;font-weight:700}.nfl-pr-promo-desc{display:block;margin-top:2px;font-size:.78rem;line-height:1.4;color:rgba(255,255,255,.7);max-width:44rem}
  .nfl-pr-promo-cta{display:inline-flex;flex-shrink:0;align-items:center;gap:6px;border-radius:6px;background:#fff;color:#0f172a;font-size:.76rem;font-weight:600;padding:6px 12px}
  .nfl-pr-layout{display:grid;align-items:start}.nfl-pr-panel{width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}.nfl-pr-controls{padding:12px 14px;border-bottom:1px solid #f1f5f9}.nfl-pr-toggle{display:inline-flex;gap:6px}.nfl-pr-toggle button{appearance:none;border:1px solid #e2e8f0;background:#fff;font-size:12px;font-weight:600;color:#475569;padding:5px 10px;border-radius:4px;cursor:pointer}.nfl-pr-toggle button:hover{border-color:#94a3b8;color:#0f172a}.nfl-pr-toggle button.is-active{background:#0f172a;border-color:#0f172a;color:#fff}.nfl-pr-toggle button:focus-visible{outline:2px solid #0ea5e9;outline-offset:1px}.nfl-pr-legend{font-size:11.5px;color:#64748b;margin-top:8px}
  .nfl-pr-status{padding:20px 14px;font-size:14px;color:#475569}.nfl-pr-status-error{color:#991b1b}
  .nfl-pr-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}.nfl-pr-scroll:focus-visible{outline:2px solid #0ea5e9;outline-offset:-2px}.nfl-pr-table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}.nfl-pr-col-rank{width:44px}.nfl-pr-col-team{width:230px}.nfl-pr-col-rating{width:165px}.nfl-pr-col-record{width:76px}.nfl-pr-table thead th{background:#f1f5f9;color:#475569;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:8px;text-align:center;white-space:nowrap;border-bottom:1px solid #e2e8f0}.nfl-pr-th-team{text-align:left!important}.nfl-pr-table tbody tr{border-bottom:1px solid #f1f5f9}.nfl-pr-table tbody tr:hover{background:#f8fafc}.nfl-pr-rank{text-align:center;font-weight:600;font-size:14px;font-variant-numeric:tabular-nums;color:#0f172a}
  .nfl-pr-team{padding:0}.nfl-pr-team-link{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;color:inherit;text-decoration:none}.nfl-pr-team-link:focus-visible{outline:2px solid #0ea5e9;outline-offset:-2px}.nfl-pr-team-link:hover .nfl-pr-name{text-decoration:underline}.nfl-pr-accent{width:3px;height:24px;border-radius:2px;flex-shrink:0}.nfl-pr-logo{width:26px;height:26px;object-fit:contain;flex-shrink:0}.nfl-pr-badge{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;flex-shrink:0}.nfl-pr-name{font-weight:600;font-size:13px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .nfl-pr-heat{text-align:center;padding:6px}.nfl-pr-heatval{display:block;font-weight:600;font-size:13px;font-variant-numeric:tabular-nums}.nfl-pr-heatrank{display:block;font-size:9.5px;color:#94a3b8;font-weight:500;margin-top:1px}.nfl-pr-rec{text-align:center;font-weight:600;font-variant-numeric:tabular-nums;color:#334155}.nfl-pr-foot{font-size:11px;color:#94a3b8;line-height:1.5;padding:12px 14px;border-top:1px solid #f1f5f9}
  @media(max-width:640px){.nfl-pr-table{min-width:520px;font-size:11px}.nfl-pr-col-rank{width:36px}.nfl-pr-col-team{width:58px}.nfl-pr-col-rating{width:112px}.nfl-pr-col-record{width:54px}.nfl-pr-table thead th{font-size:9px;padding:7px 4px}.nfl-pr-team-link{padding:6px 4px;gap:0;justify-content:center}.nfl-pr-accent,.nfl-pr-name{display:none}.nfl-pr-logo,.nfl-pr-badge{width:24px;height:24px}.nfl-pr-heat{padding:6px 3px}.nfl-pr-heatval{font-size:11px}.nfl-pr-heatrank{font-size:8.5px}}
`;
