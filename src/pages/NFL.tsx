import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useNflV03PublicPowerRatings } from "@/hooks/useNflV03PublicPowerRatings";
import { getSeoMeta } from "@/lib/seo";
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
      <main className="site-page pb-16 pt-8">
        <div className="site-container site-stack">
          <section className="nfl-pr-hero">
            <div className="nfl-pr-eyebrow">NFL · Power Ratings</div>
            <h1 className="nfl-pr-title">
              {data?.title ?? "2026 NFL Preseason Power Ratings"}
            </h1>
            <p className="nfl-pr-sub">
              Joe Knows Ball model v0.3 · {data?.subtitle ?? "Based on 2025 regular-season performance"}
              {" · "}
              Select a team for its schedule, stats, odds, value and offseason changes
            </p>
            {data?.fallbackExplanation ? (
              <p className="nfl-pr-fallback" role="status">
                {data.fallbackExplanation}
              </p>
            ) : null}
          </section>

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
                  <div className="nfl-pr-scroll">
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
        </div>
      </main>
    </>
  );
}

const STYLES = `
  .nfl-pr-hero{padding:4px 0 0}.nfl-pr-eyebrow{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#1a6fc4}.nfl-pr-title{font-size:2rem;font-weight:800;letter-spacing:-.02em;color:#0c1f3a;margin-top:6px;line-height:1.05}.nfl-pr-sub{font-size:.9rem;color:#5a6878;margin-top:8px;max-width:52rem}.nfl-pr-fallback{font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;margin-top:10px;max-width:52rem}
  .nfl-pr-layout{display:grid;gap:18px;align-items:start}.nfl-pr-panel{width:100%;background:#fff;border:1px solid #e3e8ef;border-radius:16px;box-shadow:0 2px 12px rgba(12,31,58,.06);overflow:hidden}.nfl-pr-controls{padding:18px 20px 12px;border-bottom:1px solid #eef2f7}.nfl-pr-toggle{display:inline-flex;background:#eef2f7;border-radius:10px;padding:3px}.nfl-pr-toggle button{appearance:none;border:0;background:transparent;font-size:13px;font-weight:700;color:#5a6878;padding:8px 16px;border-radius:8px;cursor:pointer}.nfl-pr-toggle button.is-active{background:#fff;color:#0c1f3a;box-shadow:0 1px 3px rgba(12,31,58,.14)}.nfl-pr-legend{font-size:12px;color:#7a8694;margin-top:10px}
  .nfl-pr-status{padding:24px 20px;font-size:14px;color:#5a6878}.nfl-pr-status-error{color:#991b1b}
  .nfl-pr-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}.nfl-pr-table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}.nfl-pr-col-rank{width:48px}.nfl-pr-col-team{width:240px}.nfl-pr-col-rating{width:170px}.nfl-pr-col-record{width:80px}.nfl-pr-table thead th{background:#0c1f3a;color:#fff;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:11px 10px;text-align:center;white-space:nowrap}.nfl-pr-th-team{text-align:left!important}.nfl-pr-table tbody tr{border-bottom:1px solid #eef2f7}.nfl-pr-table tbody tr:hover{background:#f7faff}.nfl-pr-rank{text-align:center;font-weight:800;font-size:15px;color:#0c1f3a}
  .nfl-pr-team{padding:0}.nfl-pr-team-link{display:flex;align-items:center;gap:8px;width:100%;padding:8px;color:inherit;text-decoration:none}.nfl-pr-team-link:focus-visible{outline:2px solid #1a6fc4;outline-offset:-2px}.nfl-pr-team-link:hover .nfl-pr-name{text-decoration:underline}.nfl-pr-accent{width:4px;height:28px;border-radius:2px;flex-shrink:0}.nfl-pr-logo{width:28px;height:28px;object-fit:contain;flex-shrink:0}.nfl-pr-badge{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:#fff;flex-shrink:0}.nfl-pr-name{font-weight:700;font-size:13px;color:#1a2a3f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .nfl-pr-heat{text-align:center;padding:7px 6px}.nfl-pr-heatval{display:block;font-weight:800;font-size:13px}.nfl-pr-heatrank{display:block;font-size:9.5px;color:#8a96a4;font-weight:600;margin-top:1px}.nfl-pr-rec{text-align:center;font-weight:700;color:#0c1f3a}.nfl-pr-foot{font-size:11px;color:#9aa6b4;line-height:1.5;padding:14px 20px}
  @media(max-width:640px){.nfl-pr-title{font-size:1.5rem}.nfl-pr-table{min-width:520px;font-size:11px}.nfl-pr-col-rank{width:38px}.nfl-pr-col-team{width:60px}.nfl-pr-col-rating{width:115px}.nfl-pr-col-record{width:55px}.nfl-pr-table thead th{font-size:9px;padding:8px 4px}.nfl-pr-team-link{padding:6px 4px;gap:0;justify-content:center}.nfl-pr-accent,.nfl-pr-name{display:none}.nfl-pr-logo,.nfl-pr-badge{width:26px;height:26px}.nfl-pr-heat{padding:6px 3px}.nfl-pr-heatval{font-size:11px}.nfl-pr-heatrank{font-size:8.5px}}
`;
