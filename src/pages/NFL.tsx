import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { NFL_POWER_RATINGS, nflLogoUrl, type NflPowerTeam } from "@/data/nflPreseason2026";

type ViewMode = "avg" | "percentile";

function heatStyle(value: number, mode: ViewMode): { bg: string; fg: string } {
  let t: number;
  if (mode === "avg") {
    t = Math.max(0, Math.min(1, (value + 12) / 24));
  } else {
    t = Math.max(0, Math.min(1, value / 100));
  }
  if (t >= 0.5) {
    const k = (t - 0.5) * 2;
    const bg = `rgba(22, 163, 74, ${0.10 + k * 0.32})`;
    return { bg, fg: k > 0.55 ? "#0f5132" : "#166534" };
  } else {
    const k = (0.5 - t) * 2;
    const bg = `rgba(220, 38, 38, ${0.10 + k * 0.32})`;
    return { bg, fg: k > 0.55 ? "#7f1d1d" : "#991b1b" };
  }
}

function fmtAvg(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}
function fmtPctile(v: number): string {
  return `${Math.round(v)}`;
}

function HeatCell({ value, rank, mode }: { value: number; rank: number; mode: ViewMode }) {
  const { bg, fg } = heatStyle(value, mode);
  return (
    <td style={{ background: bg }} className="nfl-pr-heat">
      <span className="nfl-pr-heatval" style={{ color: fg }}>
        {mode === "avg" ? fmtAvg(value) : fmtPctile(value)}
      </span>
      <span className="nfl-pr-heatrank">#{rank}</span>
    </td>
  );
}

function TeamLogo({ team }: { team: NflPowerTeam }) {
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
      alt={team.team}
      className="nfl-pr-logo"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export default function NFL() {
  const seo = getSeoMeta("nfl");
  usePageSeo({ title: seo.title, description: seo.description, path: seo.path, noindex: seo.noindex ?? false });

  const [mode, setMode] = useState<ViewMode>("avg");
  const rows = useMemo(() => [...NFL_POWER_RATINGS].sort((a, b) => a.rank - b.rank), []);

  return (
    <SiteShell>
      <style>{STYLES}</style>
      <main className="site-page pb-16 pt-8">
        <div className="site-container site-stack">

          <section className="nfl-pr-hero">
            <div className="nfl-pr-eyebrow">NFL · Power Ratings</div>
            <h1 className="nfl-pr-title">2026 Preseason Power Rankings</h1>
            <p className="nfl-pr-sub">Based on 2025 season performance · Updates with live data as the 2026 season unfolds</p>

            <nav className="nfl-pr-subnav" aria-label="NFL sections">
              <span className="nfl-pr-subnav-active">Power Ratings</span>
              <Link to="/nfl/standings" className="nfl-pr-subnav-link">Standings by Division</Link>
              <Link to="/nfl/super-bowl" className="nfl-pr-subnav-link">Super Bowl Odds</Link>
            </nav>
          </section>

          <section className="nfl-pr-panel">
            <div className="nfl-pr-controls">
              <div className="nfl-pr-toggle" role="group" aria-label="Rating display mode">
                <button
                  type="button"
                  className={mode === "avg" ? "is-active" : ""}
                  onClick={() => setMode("avg")}
                  aria-pressed={mode === "avg"}
                >
                  vs League Avg
                </button>
                <button
                  type="button"
                  className={mode === "percentile" ? "is-active" : ""}
                  onClick={() => setMode("percentile")}
                  aria-pressed={mode === "percentile"}
                >
                  Percentile
                </button>
              </div>
              <p className="nfl-pr-legend">
                {mode === "avg"
                  ? "Each rating shows how far above or below the league average a unit performed."
                  : "Each rating shows the unit's percentile (100 = best in NFL, 50 = league average)."}
              </p>
            </div>

            <div className="nfl-pr-scroll">
              <table className="nfl-pr-table">
                <thead>
                  <tr>
                    <th className="nfl-pr-th-rank">Rank</th>
                    <th className="nfl-pr-th-team">Team</th>
                    <th>Offense</th>
                    <th>Defense</th>
                    <th>Overall</th>
                    <th className="nfl-pr-th-rec">2025</th>
                    <th className="nfl-pr-th-win">'26 Win Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.abbr + t.rank}>
                      <td className="nfl-pr-rank">{t.rank}</td>
                      <td className="nfl-pr-team" title={t.team}>
                        <span className="nfl-pr-accent" style={{ background: t.color }} aria-hidden />
                        <TeamLogo team={t} />
                        <span className="nfl-pr-name">{t.team}</span>
                      </td>
                      <HeatCell value={mode === "avg" ? t.offPct : t.offPctile} rank={t.offRank} mode={mode} />
                      <HeatCell value={mode === "avg" ? t.defPct : t.defPctile} rank={t.defRank} mode={mode} />
                      <HeatCell value={mode === "avg" ? t.ovrPct : t.ovrPctile} rank={t.ovrRank} mode={mode} />
                      <td className="nfl-pr-rec">{t.record2025}</td>
                      <td className="nfl-pr-win">{t.winTotal != null ? t.winTotal.toFixed(1) : "\u2014"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="nfl-pr-foot">
              Composite weighting: EPA &times;2 &middot; Success% &times;2 &middot; YPP &times;2 &middot; 1st Down &times;1 &middot; 3rd Down &times;1 &middot; Blocking &times;1.5, normalized over 9.5.
              Win totals are Vegas lines as of June 1, 2026.
            </p>
          </section>
        </div>
      </main>
    </SiteShell>
  );
}

const STYLES = `
  .nfl-pr-hero{padding:4px 0 0}
  .nfl-pr-eyebrow{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#1a6fc4}
  .nfl-pr-title{font-size:2rem;font-weight:800;letter-spacing:-.02em;color:#0c1f3a;margin-top:6px;line-height:1.05}
  .nfl-pr-sub{font-size:.9rem;color:#5a6878;margin-top:8px;max-width:46rem}
  .nfl-pr-subnav{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;align-items:center}
  .nfl-pr-subnav-active{font-size:13px;font-weight:700;color:#fff;background:#0c1f3a;border-radius:999px;padding:7px 16px}
  .nfl-pr-subnav-link{font-size:13px;font-weight:600;color:#1a3a5c;background:#eef2f7;border-radius:999px;padding:7px 16px;text-decoration:none;transition:background .15s}
  .nfl-pr-subnav-link:hover{background:#dde6f0}

  .nfl-pr-panel{background:#fff;border:1px solid #e3e8ef;border-radius:16px;box-shadow:0 2px 12px rgba(12,31,58,.06);overflow:hidden;margin-top:18px}
  .nfl-pr-controls{padding:18px 20px 12px;border-bottom:1px solid #eef2f7}
  .nfl-pr-toggle{display:inline-flex;background:#eef2f7;border-radius:10px;padding:3px}
  .nfl-pr-toggle button{appearance:none;border:0;background:transparent;font-size:13px;font-weight:700;color:#5a6878;padding:8px 16px;border-radius:8px;cursor:pointer;transition:all .15s}
  .nfl-pr-toggle button.is-active{background:#fff;color:#0c1f3a;box-shadow:0 1px 3px rgba(12,31,58,.14)}
  .nfl-pr-legend{font-size:12px;color:#7a8694;margin-top:10px;max-width:42rem}

  .nfl-pr-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .nfl-pr-table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}
  .nfl-pr-table thead th{position:sticky;top:0;background:#0c1f3a;color:#fff;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:11px 10px;text-align:center;white-space:nowrap}
  .nfl-pr-th-rank{width:38px}
  .nfl-pr-th-team{text-align:left!important;width:170px}
  .nfl-pr-th-rec{width:52px}
  .nfl-pr-th-win{width:60px}
  .nfl-pr-table tbody tr{border-bottom:1px solid #eef2f7}
  .nfl-pr-table tbody tr:hover{background:#f7faff}
  .nfl-pr-table tbody tr:hover .nfl-pr-heat{filter:brightness(.97)}

  .nfl-pr-rank{text-align:center;font-weight:800;font-size:15px;color:#0c1f3a;font-variant-numeric:tabular-nums}
  .nfl-pr-team{display:flex;align-items:center;gap:8px;padding:8px 8px;position:relative}
  .nfl-pr-accent{width:4px;height:28px;border-radius:2px;flex-shrink:0}
  .nfl-pr-logo{width:28px;height:28px;object-fit:contain;flex-shrink:0}
  .nfl-pr-badge{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:#fff;flex-shrink:0;letter-spacing:.02em}
  .nfl-pr-name{font-weight:700;font-size:13px;color:#1a2a3f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

  .nfl-pr-heat{text-align:center;padding:9px 6px;transition:filter .15s}
  .nfl-pr-heatval{display:block;font-weight:800;font-size:13px;font-variant-numeric:tabular-nums;line-height:1.1}
  .nfl-pr-heatrank{display:block;font-size:9.5px;color:#8a96a4;font-weight:600;margin-top:1px}

  .nfl-pr-rec{text-align:center;font-weight:600;color:#5a6878;font-variant-numeric:tabular-nums}
  .nfl-pr-win{text-align:center;font-weight:700;color:#0c1f3a;font-variant-numeric:tabular-nums}

  .nfl-pr-foot{font-size:11px;color:#9aa6b4;line-height:1.5;padding:14px 20px}

  @media(max-width:640px){
    .nfl-pr-title{font-size:1.5rem}
    .nfl-pr-table{font-size:11px}
    .nfl-pr-table thead th{font-size:9px;padding:8px 4px;letter-spacing:.02em}
    .nfl-pr-th-rank{width:26px}
    .nfl-pr-th-team{width:44px}
    .nfl-pr-th-rec{width:36px}
    .nfl-pr-th-win{width:36px}
    .nfl-pr-rank{font-size:12px}
    .nfl-pr-team{padding:6px 4px;gap:0}
    .nfl-pr-accent{display:none}
    .nfl-pr-name{display:none}
    .nfl-pr-logo{width:26px;height:26px}
    .nfl-pr-badge{width:26px;height:26px;font-size:8px}
    .nfl-pr-heat{padding:6px 3px}
    .nfl-pr-heatval{font-size:11px}
    .nfl-pr-heatrank{font-size:8.5px}
    .nfl-pr-rec{font-size:11px;padding:0 3px}
    .nfl-pr-win{font-size:11px;padding:0 3px}
  }
`;
