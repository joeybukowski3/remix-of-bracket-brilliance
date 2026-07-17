import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { NFL_POWER_RATINGS, nflLogoUrl, type NflPowerTeam } from "@/data/nflPreseason2026";
import { slugifyNflTeam } from "@/lib/nfl/guide2026";
import {
  NFL_2025_TREND_DATASET,
  NFL_TREND_METADATA,
  type NflTrendClassification,
  type NflTrendConfidenceLevel,
  type NflTrendRecord,
} from "@/lib/nfl/teamTrends";
import {
  NFL_TREND_SORT_LABELS,
  sortTrendRowsForNflPage,
  type NflTrendSortKey,
} from "@/lib/nfl/teamTrendPresentation";

type ViewMode = "avg" | "percentile";
type PowerRatingsView = "preseason" | "trend";

const TREND_CLASSIFICATION_LABELS: Record<NflTrendClassification, string> = {
  strong_improvement: "Strong late-season improvement",
  moderate_improvement: "Moderate late-season improvement",
  stable: "Stable late-season profile",
  moderate_decline: "Moderate late-season decline",
  strong_decline: "Strong late-season decline",
  insufficient_data: "Insufficient data",
};

const TEAM_COLOR_BY_ABBR = new Map(NFL_POWER_RATINGS.map((team) => [team.abbr, team.color]));

function heatStyle(value: number, mode: ViewMode): { bg: string; fg: string } {
  const t = mode === "avg"
    ? Math.max(0, Math.min(1, (value + 12) / 24))
    : Math.max(0, Math.min(1, value / 100));
  if (t >= 0.5) {
    const k = (t - 0.5) * 2;
    return { bg: `rgba(22, 163, 74, ${0.10 + k * 0.32})`, fg: k > 0.55 ? "#0f5132" : "#166534" };
  }
  const k = (0.5 - t) * 2;
  return { bg: `rgba(220, 38, 38, ${0.10 + k * 0.32})`, fg: k > 0.55 ? "#7f1d1d" : "#991b1b" };
}

function HeatCell({ value, rank, mode }: { value: number; rank: number; mode: ViewMode }) {
  const { bg, fg } = heatStyle(value, mode);
  return (
    <td style={{ background: bg }} className="nfl-pr-heat">
      <span className="nfl-pr-heatval" style={{ color: fg }}>
        {mode === "avg" ? `${value > 0 ? "+" : ""}${value.toFixed(1)}%` : Math.round(value)}
      </span>
      <span className="nfl-pr-heatrank">#{rank}</span>
    </td>
  );
}

function TeamLogo({ team }: { team: NflPowerTeam }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="nfl-pr-badge" style={{ background: team.color }}>{team.abbr.toUpperCase()}</span>;
  return <img src={nflLogoUrl(team.abbr)} alt="" className="nfl-pr-logo" loading="lazy" onError={() => setFailed(true)} />;
}

function TrendLogo({ record }: { record: NflTrendRecord }) {
  const [failed, setFailed] = useState(false);
  const color = TEAM_COLOR_BY_ABBR.get(record.abbr) ?? "#0c1f3a";
  if (failed) return <span className="nfl-pr-badge" style={{ background: color }}>{record.abbr.toUpperCase()}</span>;
  return <img src={nflLogoUrl(record.abbr)} alt="" className="nfl-pr-logo" loading="lazy" onError={() => setFailed(true)} />;
}

function formatTrendNumber(value: number | null, digits = 1): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatRank(rank: number | null): string {
  return rank === null ? "—" : `#${rank}`;
}

function movementLabel(value: number | null, unit: string, digits = 1): string {
  if (value === null) return `No ${unit} movement available`;
  if (value > 0) return `Improved by ${value.toFixed(digits)} ${unit}`;
  if (value < 0) return `Declined by ${Math.abs(value).toFixed(digits)} ${unit}`;
  return `No ${unit} change`;
}

function rankMovementLabel(value: number | null): string {
  if (value === null) return "No rank movement available";
  if (value > 0) return `Improved ${value} spots`;
  if (value < 0) return `Declined ${Math.abs(value)} spots`;
  return "No rank change";
}

function movementClass(value: number | null): string {
  if (value === null || value === 0) return "is-neutral";
  return value > 0 ? "is-up" : "is-down";
}

function classificationClass(classification: NflTrendClassification): string {
  if (classification.endsWith("improvement")) return "is-up";
  if (classification.endsWith("decline")) return "is-down";
  if (classification === "insufficient_data") return "is-low";
  return "is-neutral";
}

function confidenceClass(level: NflTrendConfidenceLevel): string {
  if (level === "high") return "is-high";
  if (level === "medium") return "is-medium";
  return "is-low";
}

function formatSourceTimestamp(value: string): string {
  return value || "Unknown";
}

export default function NFL() {
  const seo = getSeoMeta("nfl");
  usePageSeo({ title: seo.title, description: seo.description, path: seo.path, noindex: seo.noindex ?? false });
  const [activeView, setActiveView] = useState<PowerRatingsView>("preseason");
  const [mode, setMode] = useState<ViewMode>("avg");
  const [trendSort, setTrendSort] = useState<NflTrendSortKey>("finalRank");
  const rows = useMemo(() => [...NFL_POWER_RATINGS].sort((a, b) => a.rank - b.rank), []);
  const trendRows = useMemo(() => sortTrendRowsForNflPage(NFL_2025_TREND_DATASET.records, trendSort), [trendSort]);
  const isTrendView = activeView === "trend";

  return (
    <>
      <style>{STYLES}</style>
      <main className="site-page pb-16 pt-8">
        <div className="site-container site-stack">
          <section className="nfl-pr-hero">
            <div className="nfl-pr-eyebrow">NFL · Power Ratings</div>
            <h1 className="nfl-pr-title">{isTrendView ? "2025 Late-Season Trend" : "2026 Preseason Power Rankings"}</h1>
            <p className="nfl-pr-sub">
              {isTrendView
                ? "Descriptive full-season versus final-eight performance from the 2025 season · Not a 2026 win projection"
                : "Based on 2025 season performance · Select a team for its schedule, stats, odds, value and offseason changes"}
            </p>
          </section>

          <div className="nfl-pr-layout">
            <section className="nfl-pr-panel">
              <div className="nfl-pr-viewbar">
                <div className="nfl-pr-toggle" role="tablist" aria-label="NFL power ratings dataset">
                  <button
                    type="button"
                    role="tab"
                    id="nfl-view-preseason"
                    aria-controls="nfl-panel-preseason"
                    aria-selected={activeView === "preseason"}
                    className={activeView === "preseason" ? "is-active" : ""}
                    onClick={() => setActiveView("preseason")}
                  >
                    2026 Preseason
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id="nfl-view-trend"
                    aria-controls="nfl-panel-trend"
                    aria-selected={activeView === "trend"}
                    className={activeView === "trend" ? "is-active" : ""}
                    onClick={() => setActiveView("trend")}
                  >
                    2025 Late-Season Trend
                  </button>
                </div>
                <p className="nfl-pr-legend">
                  {isTrendView
                    ? "2025 full-season performance compared with each team's final eight completed games."
                    : "Legacy 2026 preseason ratings from the existing hand-curated preseason power table."}
                </p>
              </div>

              {!isTrendView && (
                <div id="nfl-panel-preseason" role="tabpanel" aria-labelledby="nfl-view-preseason">
              <div className="nfl-pr-controls">
                <div className="nfl-pr-toggle" role="group" aria-label="Rating display mode">
                  <button type="button" className={mode === "avg" ? "is-active" : ""} onClick={() => setMode("avg")} aria-pressed={mode === "avg"}>vs League Avg</button>
                  <button type="button" className={mode === "percentile" ? "is-active" : ""} onClick={() => setMode("percentile")} aria-pressed={mode === "percentile"}>Percentile</button>
                </div>
                <p className="nfl-pr-legend">{mode === "avg" ? "Each rating shows how far above or below the league average a unit performed." : "Each rating shows the unit's percentile (100 = best in NFL, 50 = league average)."}</p>
              </div>

              <div className="nfl-pr-scroll">
                <table className="nfl-pr-table">
                  <colgroup><col className="nfl-pr-col-rank" /><col className="nfl-pr-col-team" /><col className="nfl-pr-col-rating" /><col className="nfl-pr-col-rating" /><col className="nfl-pr-col-rating" /><col className="nfl-pr-col-record" /><col className="nfl-pr-col-win" /></colgroup>
                  <thead><tr><th>Rank</th><th className="nfl-pr-th-team">Team</th><th>Offense</th><th>Defense</th><th>Overall</th><th>2025</th><th>'26 Win Total</th></tr></thead>
                  <tbody>
                    {rows.map((team) => (
                      <tr key={team.abbr}>
                        <td className="nfl-pr-rank">{team.rank}</td>
                        <td className="nfl-pr-team" title={team.team}>
                          <Link to={`/nfl/guide/team/${slugifyNflTeam(team.team)}`} className="nfl-pr-team-link" aria-label={`Open ${team.team} team dashboard`}>
                            <span className="nfl-pr-accent" style={{ background: team.color }} aria-hidden />
                            <TeamLogo team={team} />
                            <span className="nfl-pr-name">{team.team}</span>
                          </Link>
                        </td>
                        <HeatCell value={mode === "avg" ? team.offPct : team.offPctile} rank={team.offRank} mode={mode} />
                        <HeatCell value={mode === "avg" ? team.defPct : team.defPctile} rank={team.defRank} mode={mode} />
                        <HeatCell value={mode === "avg" ? team.ovrPct : team.ovrPctile} rank={team.ovrRank} mode={mode} />
                        <td className="nfl-pr-rec">{team.record2025}</td>
                        <td className="nfl-pr-win">{team.winTotal != null ? team.winTotal.toFixed(1) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="nfl-pr-foot">Composite weighting: EPA ×2 · Success% ×2 · YPP ×2 · 1st Down ×1 · 3rd Down ×1 · Blocking ×1.5, normalized over 9.5. Win totals are preseason market lines.</p>
                </div>
              )}

              {isTrendView && (
                <div id="nfl-panel-trend" role="tabpanel" aria-labelledby="nfl-view-trend">
                  <div className="nfl-trend-meta" aria-label="NFL trend source metadata">
                    <span>Source season {NFL_TREND_METADATA.sourceSeason}</span>
                    <span>{NFL_TREND_METADATA.modelVersion}</span>
                    <span>Generated {formatSourceTimestamp(NFL_TREND_METADATA.generatedAt)}</span>
                    <span className="nfl-trend-stage">Validation {NFL_TREND_METADATA.validationStatus === "stage-1" ? "Stage-1" : NFL_TREND_METADATA.validationStatus}</span>
                  </div>

                  <div className="nfl-trend-sortbar" aria-label="Trend sorting controls">
                    <span>Sort by</span>
                    {Object.entries(NFL_TREND_SORT_LABELS).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={trendSort === key ? "is-active" : ""}
                        aria-pressed={trendSort === key}
                        onClick={() => setTrendSort(key as NflTrendSortKey)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="nfl-trend-table-wrap">
                    <table className="nfl-pr-table nfl-trend-table" aria-label="2025 full-season versus final-eight NFL trend table">
                      <thead>
                        <tr>
                          <th aria-sort={trendSort === "finalRank" ? "ascending" : "none"}>
                            <button type="button" onClick={() => setTrendSort("finalRank")}>Final 8 Rank</button>
                          </th>
                          <th className="nfl-pr-th-team">Team</th>
                          <th>Full Rank</th>
                          <th>Rank Move</th>
                          <th>Full Rating</th>
                          <th>Final 8 Rating</th>
                          <th aria-sort={trendSort === "ratingChange" ? "descending" : "none"}>
                            <button type="button" onClick={() => setTrendSort("ratingChange")}>Rating Move</button>
                          </th>
                          <th aria-sort={trendSort === "offenseChange" ? "descending" : "none"}>
                            <button type="button" onClick={() => setTrendSort("offenseChange")}>Offense</button>
                          </th>
                          <th aria-sort={trendSort === "defenseChange" ? "descending" : "none"}>
                            <button type="button" onClick={() => setTrendSort("defenseChange")}>Defense</button>
                          </th>
                          <th>Classification</th>
                          <th>Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trendRows.map((record) => (
                          <tr key={record.teamId} data-testid="nfl-trend-row">
                            <td className="nfl-pr-rank" data-label="Final-eight rank">{formatRank(record.finalEight.rank)}</td>
                            <td className="nfl-pr-team" data-label="Team">
                              <Link to={`/nfl/guide/team/${record.slug}`} className="nfl-pr-team-link" aria-label={`Open ${record.name} team dashboard`}>
                                <span className="nfl-pr-accent" style={{ background: TEAM_COLOR_BY_ABBR.get(record.abbr) ?? "#0c1f3a" }} aria-hidden />
                                <TrendLogo record={record} />
                                <span className="nfl-pr-name">{record.name}</span>
                              </Link>
                            </td>
                            <td className="nfl-trend-num" data-label="Full-season rank">{formatRank(record.fullSeason.rank)}</td>
                            <td className={`nfl-trend-move ${movementClass(record.deltas.rank)}`} data-label="Rank movement">
                              <span aria-hidden>{record.deltas.rank === null ? "—" : record.deltas.rank > 0 ? `↑ ${record.deltas.rank}` : record.deltas.rank < 0 ? `↓ ${Math.abs(record.deltas.rank)}` : "→ 0"}</span>
                              <span className="sr-only">{rankMovementLabel(record.deltas.rank)}</span>
                            </td>
                            <td className="nfl-trend-num" data-label="Full-season rating">{record.fullSeason.comparableRating?.toFixed(1) ?? "—"}</td>
                            <td className="nfl-trend-num" data-label="Final-eight rating">{record.finalEight.comparableRating?.toFixed(1) ?? "—"}</td>
                            <td className={`nfl-trend-move ${movementClass(record.deltas.rating)}`} data-label="Rating movement">
                              <span aria-hidden>{formatTrendNumber(record.deltas.rating, 1)}</span>
                              <span className="sr-only">{movementLabel(record.deltas.rating, "rating points")}</span>
                            </td>
                            <td className={`nfl-trend-move ${movementClass(record.deltas.offense)}`} data-label="Offense movement">
                              <span aria-hidden>{formatTrendNumber(record.deltas.offense, 2)}</span>
                              <span className="sr-only">{movementLabel(record.deltas.offense, "offense z-score", 2)}</span>
                            </td>
                            <td className={`nfl-trend-move ${movementClass(record.deltas.defense)}`} data-label="Defense movement">
                              <span aria-hidden>{formatTrendNumber(record.deltas.defense, 2)}</span>
                              <span className="sr-only">{movementLabel(record.deltas.defense, "defense z-score", 2)}</span>
                            </td>
                            <td data-label="Classification">
                              <span className={`nfl-trend-badge ${classificationClass(record.classification)}`}>{TREND_CLASSIFICATION_LABELS[record.classification]}</span>
                            </td>
                            <td data-label="Confidence">
                              <span className={`nfl-trend-confidence ${confidenceClass(record.confidence.level)}`}>{record.confidence.level}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="nfl-trend-method">
                    <p>
                      Full-season data covers the complete 2025 regular season. Final-eight data covers each team's final eight completed games. Ratings use the same NFL v0.3 public-scale transform; positive movement means stronger final-eight performance.
                    </p>
                    <details>
                      <summary>Methodology and status</summary>
                      <p>
                        Late-season classifications are descriptive, derived from the 32-team rating-change distribution using q10, q25, median, q75 and q90 thresholds. This is not a 2026 win projection. NFL v0.3 remains Stage-1.
                      </p>
                    </details>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

const STYLES = `
  .nfl-pr-hero{padding:4px 0 0}.nfl-pr-eyebrow{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#1a6fc4}.nfl-pr-title{font-size:2rem;font-weight:800;letter-spacing:-.02em;color:#0c1f3a;margin-top:6px;line-height:1.05}.nfl-pr-sub{font-size:.9rem;color:#5a6878;margin-top:8px;max-width:52rem}
  .nfl-pr-layout{display:grid;gap:18px;align-items:start}.nfl-pr-panel{width:100%;background:#fff;border:1px solid #e3e8ef;border-radius:16px;box-shadow:0 2px 12px rgba(12,31,58,.06);overflow:hidden}.nfl-pr-viewbar,.nfl-pr-controls{padding:18px 20px 12px;border-bottom:1px solid #eef2f7}.nfl-pr-controls{background:#fbfdff}.nfl-pr-toggle{display:inline-flex;flex-wrap:wrap;gap:2px;background:#eef2f7;border-radius:10px;padding:3px}.nfl-pr-toggle button{appearance:none;border:0;background:transparent;font-size:13px;font-weight:700;color:#5a6878;padding:8px 16px;border-radius:8px;cursor:pointer}.nfl-pr-toggle button.is-active,.nfl-pr-toggle button[aria-selected="true"]{background:#fff;color:#0c1f3a;box-shadow:0 1px 3px rgba(12,31,58,.14)}.nfl-pr-toggle button:focus-visible,.nfl-trend-sortbar button:focus-visible,.nfl-trend-table th button:focus-visible{outline:2px solid #1a6fc4;outline-offset:2px}.nfl-pr-legend{font-size:12px;color:#7a8694;margin-top:10px}
  .nfl-pr-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}.nfl-pr-table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}.nfl-pr-col-rank{width:48px}.nfl-pr-col-team{width:220px}.nfl-pr-col-rating{width:170px}.nfl-pr-col-record{width:70px}.nfl-pr-col-win{width:85px}.nfl-pr-table thead th{background:#0c1f3a;color:#fff;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:11px 10px;text-align:center;white-space:nowrap}.nfl-pr-th-team{text-align:left!important}.nfl-pr-table tbody tr{border-bottom:1px solid #eef2f7}.nfl-pr-table tbody tr:hover{background:#f7faff}.nfl-pr-rank{text-align:center;font-weight:800;font-size:15px;color:#0c1f3a}
  .nfl-pr-team{padding:0}.nfl-pr-team-link{display:flex;align-items:center;gap:8px;width:100%;padding:8px;color:inherit;text-decoration:none}.nfl-pr-team-link:focus-visible{outline:2px solid #1a6fc4;outline-offset:-2px}.nfl-pr-team-link:hover .nfl-pr-name{text-decoration:underline}.nfl-pr-accent{width:4px;height:28px;border-radius:2px;flex-shrink:0}.nfl-pr-logo{width:28px;height:28px;object-fit:contain;flex-shrink:0}.nfl-pr-badge{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:#fff;flex-shrink:0}.nfl-pr-name{font-weight:700;font-size:13px;color:#1a2a3f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .nfl-pr-heat{text-align:center;padding:7px 6px}.nfl-pr-heatval{display:block;font-weight:800;font-size:13px}.nfl-pr-heatrank{display:block;font-size:9.5px;color:#8a96a4;font-weight:600;margin-top:1px}.nfl-pr-rec,.nfl-pr-win{text-align:center;font-weight:700;color:#0c1f3a}.nfl-pr-foot{font-size:11px;color:#9aa6b4;line-height:1.5;padding:14px 20px}
  .nfl-trend-meta{display:flex;flex-wrap:wrap;gap:8px;padding:14px 20px;border-bottom:1px solid #eef2f7;background:#fbfdff}.nfl-trend-meta span{border:1px solid #d8e1ec;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:800;color:#34465c;background:#fff}.nfl-trend-meta .nfl-trend-stage{border-color:#facc15;background:#fffbeb;color:#854d0e}.nfl-trend-sortbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:12px 20px;border-bottom:1px solid #eef2f7;color:#667589;font-size:12px;font-weight:800}.nfl-trend-sortbar button{border:1px solid #d8e1ec;background:#fff;color:#34465c;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:800;cursor:pointer}.nfl-trend-sortbar button.is-active{border-color:#1a6fc4;color:#0c1f3a;background:#eff6ff}.nfl-trend-table-wrap{width:100%;overflow-x:hidden}.nfl-trend-table{table-layout:auto}.nfl-trend-table th button{appearance:none;border:0;background:transparent;color:inherit;font:inherit;text-transform:inherit;letter-spacing:inherit;cursor:pointer}.nfl-trend-num{text-align:center;font-weight:800;color:#0c1f3a}.nfl-trend-move{text-align:center;font-weight:900}.nfl-trend-move.is-up{color:#166534}.nfl-trend-move.is-down{color:#991b1b}.nfl-trend-move.is-neutral{color:#5a6878}.nfl-trend-badge,.nfl-trend-confidence{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:5px 8px;font-size:10.5px;font-weight:900;line-height:1.15;text-align:center}.nfl-trend-badge.is-up{background:#dcfce7;color:#14532d}.nfl-trend-badge.is-down{background:#fee2e2;color:#7f1d1d}.nfl-trend-badge.is-neutral{background:#f1f5f9;color:#334155}.nfl-trend-badge.is-low,.nfl-trend-confidence.is-low{background:#fef3c7;color:#78350f}.nfl-trend-confidence.is-high{background:#e0f2fe;color:#075985}.nfl-trend-confidence.is-medium{background:#fef9c3;color:#713f12}.nfl-trend-method{padding:14px 20px;border-top:1px solid #eef2f7;color:#667589;font-size:12px;line-height:1.5}.nfl-trend-method details{margin-top:8px}.nfl-trend-method summary{cursor:pointer;font-weight:900;color:#0c1f3a}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  @media(max-width:640px){.nfl-pr-title{font-size:1.5rem}.nfl-pr-table{min-width:560px;font-size:11px}.nfl-pr-col-rank{width:38px}.nfl-pr-col-team{width:60px}.nfl-pr-col-rating{width:115px}.nfl-pr-col-record{width:55px}.nfl-pr-col-win{width:60px}.nfl-pr-table thead th{font-size:9px;padding:8px 4px}.nfl-pr-team-link{padding:6px 4px;gap:0;justify-content:center}.nfl-pr-accent,.nfl-pr-name{display:none}.nfl-pr-logo,.nfl-pr-badge{width:26px;height:26px}.nfl-pr-heat{padding:6px 3px}.nfl-pr-heatval{font-size:11px}.nfl-pr-heatrank{font-size:8.5px}}
  @media(max-width:900px){.nfl-trend-table{min-width:0;table-layout:auto;border-collapse:separate;border-spacing:0 10px;padding:10px;background:#f8fafc}.nfl-trend-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.nfl-trend-table tbody,.nfl-trend-table tr,.nfl-trend-table td{display:block;width:100%}.nfl-trend-table tbody tr{border:1px solid #e2e8f0;border-radius:14px;background:#fff;overflow:hidden}.nfl-trend-table td{box-sizing:border-box;text-align:right;padding:8px 12px;border-bottom:1px solid #eef2f7}.nfl-trend-table td:last-child{border-bottom:0}.nfl-trend-table td::before{content:attr(data-label);float:left;font-size:10px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;color:#64748b}.nfl-trend-table .nfl-pr-team{padding:0}.nfl-trend-table .nfl-pr-team::before{content:""}.nfl-trend-table .nfl-pr-team-link{justify-content:flex-start;padding:10px 12px;gap:8px}.nfl-trend-table .nfl-pr-accent,.nfl-trend-table .nfl-pr-name{display:inline-flex}.nfl-trend-table .nfl-pr-name{white-space:normal}.nfl-trend-meta,.nfl-trend-sortbar,.nfl-pr-viewbar,.nfl-pr-controls{padding-left:12px;padding-right:12px}.nfl-pr-toggle{width:100%}.nfl-pr-toggle button{flex:1 1 140px}.nfl-trend-sortbar button{flex:1 1 120px}}
`;
