import { useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import {
  NFL_DIVISIONS,
  NFL_DIVISION_ORDER,
  nflLogoUrl,
  type NflDivisionTeam,
} from "@/data/nflPreseason2026";

// Win % from a "W-L" string for sorting.
function winPct(record: string): number {
  const [w, l] = record.split("-").map((n) => parseInt(n, 10) || 0);
  const total = w + l;
  return total > 0 ? w / total : 0;
}

// Color the power rank within a division: best (lowest number) green → worst red.
function rankHeat(rank: number | null): { bg: string; fg: string } {
  if (rank == null) return { bg: "transparent", fg: "#5a6878" };
  // NFL ranks 1..32 → map to 0(best)..1(worst)
  const t = (rank - 1) / 31;
  if (t <= 0.5) {
    const k = 1 - t * 2;
    return { bg: `rgba(22,163,74,${0.12 + k * 0.30})`, fg: k > 0.4 ? "#0f5132" : "#166534" };
  }
  const k = (t - 0.5) * 2;
  return { bg: `rgba(220,38,38,${0.10 + k * 0.30})`, fg: k > 0.4 ? "#7f1d1d" : "#991b1b" };
}

function TeamLogo({ team }: { team: NflDivisionTeam }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="nfl-st-badge" style={{ background: team.color }}>{team.abbr.toUpperCase()}</span>;
  }
  return (
    <img src={nflLogoUrl(team.abbr)} alt={team.team} className="nfl-st-logo" loading="lazy" onError={() => setFailed(true)} />
  );
}

function DivisionCard({ name, teams }: { name: string; teams: NflDivisionTeam[] }) {
  // Sort by win % (preseason placeholder = 2025 record), then power rank.
  const sorted = [...teams].sort((a, b) => {
    const wp = winPct(b.record) - winPct(a.record);
    if (wp !== 0) return wp;
    return (a.pwrRank ?? 99) - (b.pwrRank ?? 99);
  });
  const conf = name.startsWith("AFC") ? "afc" : "nfc";

  return (
    <div className={`nfl-st-card nfl-st-card-${conf}`}>
      <div className="nfl-st-card-head">{name}</div>
      <div className="nfl-st-scroll">
        <table className="nfl-st-table">
          <thead>
            <tr>
              <th className="nfl-st-th-team">Team</th>
              <th>W-L</th>
              <th>Pwr</th>
              <th>Off</th>
              <th>Def</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const heat = rankHeat(t.pwrRank);
              return (
                <tr key={t.abbr}>
                  <td className="nfl-st-team">
                    <span className="nfl-st-accent" style={{ background: t.color }} aria-hidden />
                    <TeamLogo team={t} />
                    <span className="nfl-st-name">{t.team}</span>
                  </td>
                  <td className="nfl-st-rec">{t.record}</td>
                  <td className="nfl-st-pwr" style={{ background: heat.bg }}>
                    <span style={{ color: heat.fg }}>{t.pwrRank ?? "\u2014"}</span>
                  </td>
                  <td className="nfl-st-sub">{t.offRank ?? "\u2014"}</td>
                  <td className="nfl-st-sub">{t.defRank ?? "\u2014"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function NFLStandings() {
  const seo = getSeoMeta("nfl");
  usePageSeo({
    title: "2026 NFL Standings by Division | Joe Knows Ball",
    description: "2026 NFL standings by division with preseason power rankings, win totals, and 2025 records. Updates with live results as the season progresses.",
    path: "/nfl/standings",
    noindex: seo.noindex ?? false,
  });

  return (
    <SiteShell>
      <style>{STYLES}</style>
      <main className="site-page pb-16 pt-8">
        <div className="site-container site-stack">

          <section className="nfl-st-hero">
            <div className="nfl-st-eyebrow">NFL · Standings</div>
            <h1 className="nfl-st-title">2026 NFL Standings by Division</h1>
            <p className="nfl-st-sub">Sorted by record, then preseason power rank · Records show 2025 finish until 2026 games begin</p>

            <nav className="nfl-st-subnav" aria-label="NFL sections">
              <Link to="/nfl" className="nfl-st-subnav-link">&larr; Power Ratings</Link>
              <span className="nfl-st-subnav-active">Standings by Division</span>
            </nav>
          </section>

          <div className="nfl-st-grid">
            {NFL_DIVISION_ORDER.filter((d) => NFL_DIVISIONS[d]).map((d) => (
              <DivisionCard key={d} name={d} teams={NFL_DIVISIONS[d]} />
            ))}
          </div>

          <p className="nfl-st-foot">
            Pwr = preseason power rank (1&ndash;32) &middot; Off / Def = unit rank &middot; W-L reflects 2025 final records as a preseason placeholder, updating to live 2026 results once the season starts.
          </p>
        </div>
      </main>
    </SiteShell>
  );
}

const STYLES = `
  .nfl-st-hero{padding:4px 0 0}
  .nfl-st-eyebrow{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#1a6fc4}
  .nfl-st-title{font-size:2rem;font-weight:800;letter-spacing:-.02em;color:#0c1f3a;margin-top:6px;line-height:1.05}
  .nfl-st-sub{font-size:.9rem;color:#5a6878;margin-top:8px;max-width:46rem}
  .nfl-st-subnav{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;align-items:center}
  .nfl-st-subnav-active{font-size:13px;font-weight:700;color:#fff;background:#0c1f3a;border-radius:999px;padding:7px 16px}
  .nfl-st-subnav-link{font-size:13px;font-weight:600;color:#1a3a5c;background:#eef2f7;border-radius:999px;padding:7px 16px;text-decoration:none;transition:background .15s}
  .nfl-st-subnav-link:hover{background:#dde6f0}

  .nfl-st-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-top:18px}

  .nfl-st-card{background:#fff;border:1px solid #e3e8ef;border-radius:14px;box-shadow:0 2px 10px rgba(12,31,58,.06);overflow:hidden}
  .nfl-st-card-head{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#fff;padding:10px 14px}
  .nfl-st-card-afc .nfl-st-card-head{background:#0c1f3a}
  .nfl-st-card-nfc .nfl-st-card-head{background:#1a3a5c}

  .nfl-st-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .nfl-st-table{width:100%;border-collapse:collapse;font-size:12.5px}
  .nfl-st-table thead th{background:#f4f7fb;color:#5a6878;font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:7px 8px;text-align:center;white-space:nowrap}
  .nfl-st-th-team{text-align:left!important;min-width:150px}
  .nfl-st-table tbody tr{border-bottom:1px solid #f0f3f7}
  .nfl-st-table tbody tr:last-child{border-bottom:0}
  .nfl-st-table tbody tr:hover{background:#f7faff}

  .nfl-st-team{display:flex;align-items:center;gap:8px;padding:8px 8px;position:relative}
  .nfl-st-accent{width:3px;height:26px;border-radius:2px;flex-shrink:0}
  .nfl-st-logo{width:26px;height:26px;object-fit:contain;flex-shrink:0}
  .nfl-st-badge{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:8.5px;font-weight:800;color:#fff;flex-shrink:0}
  .nfl-st-name{font-weight:700;font-size:12.5px;color:#1a2a3f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

  .nfl-st-rec{text-align:center;font-weight:700;color:#0c1f3a;font-variant-numeric:tabular-nums;white-space:nowrap}
  .nfl-st-pwr{text-align:center;font-weight:800;font-variant-numeric:tabular-nums}
  .nfl-st-sub{text-align:center;font-weight:600;color:#7a8694;font-variant-numeric:tabular-nums}

  .nfl-st-foot{font-size:11px;color:#9aa6b4;line-height:1.5;margin-top:16px}

  @media(max-width:860px){
    .nfl-st-grid{grid-template-columns:1fr}
    .nfl-st-title{font-size:1.5rem}
  }
`;
