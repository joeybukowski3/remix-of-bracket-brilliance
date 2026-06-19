import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
import { NFL_POWER_RATINGS, nflLogoUrl, type NflPowerTeam } from "@/data/nflPreseason2026";
import { calculateRankGap, getRankGapSignal, type SuperBowlMarketTeam } from "@/lib/nfl/superBowlMarkets";

type SuperBowlOddsResponse = {
  source: "polymarket";
  eventId: string;
  eventTitle: string;
  eventSlug: string | null;
  updatedAt: string;
  stale?: boolean;
  teams: SuperBowlMarketTeam[];
};

type PageStatus = "loading" | "success" | "error";

type OddsRow = NflPowerTeam & {
  marketPrice: number | null;
  probability: number | null;
  marketRank: number | null;
  gap: number | null;
};

function TeamLogo({ team }: { team: NflPowerTeam }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="nfl-sb-badge" style={{ background: team.color }}>{team.abbr.toUpperCase()}</span>;
  return <img src={nflLogoUrl(team.abbr)} alt={team.team} className="nfl-sb-logo" loading="lazy" onError={() => setFailed(true)} />;
}

function formatPrice(probability: number | null) {
  return probability == null ? "\u2014" : `${probability.toFixed(1)}\u00a2`;
}

function formatGap(gap: number | null) {
  if (gap == null) return "\u2014";
  return `${gap > 0 ? "+" : ""}${gap}`;
}

function gapClass(gap: number | null) {
  if (gap == null || Math.abs(gap) <= 1) return "is-neutral";
  return gap > 0 ? "is-positive" : "is-negative";
}

function SummaryCard({ label, primary, secondary, tone = "neutral" }: {
  label: string;
  primary: string;
  secondary: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className={`nfl-sb-summary nfl-sb-summary-${tone}`}>
      <div className="nfl-sb-summary-label">{label}</div>
      <div className="nfl-sb-summary-primary">{primary}</div>
      <div className="nfl-sb-summary-secondary">{secondary}</div>
    </div>
  );
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 10 }, (_, index) => (
        <tr key={index} className="nfl-sb-loading-row">
          <td><span className="nfl-sb-skeleton nfl-sb-skeleton-rank" /></td>
          <td><span className="nfl-sb-skeleton nfl-sb-skeleton-team" /></td>
          <td><span className="nfl-sb-skeleton nfl-sb-skeleton-price" /></td>
          <td><span className="nfl-sb-skeleton nfl-sb-skeleton-rank" /></td>
          <td><span className="nfl-sb-skeleton nfl-sb-skeleton-rank" /></td>
          <td><span className="nfl-sb-skeleton nfl-sb-skeleton-signal" /></td>
        </tr>
      ))}
    </>
  );
}

export default function NFLSuperBowlOdds() {
  usePageSeo({
    title: "Super Bowl Odds & NFL Power Ranking Value | Joe Knows Ball",
    description: "Track live Super Bowl prediction-market prices and compare each NFL team’s market rank with the Joe Knows Ball power rankings.",
    path: "/nfl/super-bowl",
    noindex: false,
  });

  const [status, setStatus] = useState<PageStatus>("loading");
  const [data, setData] = useState<SuperBowlOddsResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

    fetch(`${base}/api/nfl/super-bowl-odds`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.teams) throw new Error(payload?.error ?? "Live Super Bowl market prices are unavailable right now.");
        return payload as SuperBowlOddsResponse;
      })
      .then((payload) => {
        setData(payload);
        setStatus("success");
      })
      .catch((fetchError) => {
        if (fetchError.name === "AbortError") return;
        setError(fetchError instanceof Error ? fetchError.message : "Live Super Bowl market prices are unavailable right now.");
        setStatus("error");
      });

    return () => controller.abort();
  }, []);

  const rows = useMemo<OddsRow[]>(() => {
    const byAbbr = new Map(data?.teams.map((team) => [team.abbr, team]) ?? []);
    return NFL_POWER_RATINGS
      .map((team) => {
        const market = byAbbr.get(team.abbr);
        const marketRank = market?.marketRank ?? null;
        return {
          ...team,
          marketPrice: market?.price ?? null,
          probability: market?.probability ?? null,
          marketRank,
          gap: calculateRankGap(marketRank, team.rank),
        };
      })
      .sort((a, b) => {
        if (a.marketPrice == null && b.marketPrice == null) return a.team.localeCompare(b.team);
        if (a.marketPrice == null) return 1;
        if (b.marketPrice == null) return -1;
        return b.marketPrice - a.marketPrice || a.team.localeCompare(b.team);
      });
  }, [data]);

  const favorite = rows.find((row) => row.marketRank === 1) ?? null;
  const bestValue = rows.filter((row) => row.gap != null && row.gap > 0).sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))[0] ?? null;
  const marketPremium = rows.filter((row) => row.gap != null && row.gap < 0).sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0))[0] ?? null;
  const matchedCount = rows.filter((row) => row.marketPrice != null).length;
  const updatedAt = data?.updatedAt
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.updatedAt))
    : "\u2014";

  return (
    <SiteShell>
      <style>{STYLES}</style>
      <main className="site-page pb-16 pt-8">
        <div className="site-container site-stack">
          <section className="nfl-sb-hero">
            <div className="nfl-sb-eyebrow">NFL · Prediction Markets</div>
            <h1 className="nfl-sb-title">Super Bowl Odds Tracker</h1>
            <p className="nfl-sb-sub">Live Super Bowl market prices compared with the Joe Knows Ball NFL Power Rankings.</p>

            <nav className="nfl-sb-subnav" aria-label="NFL sections">
              <Link to="/nfl" className="nfl-sb-subnav-link">Power Ratings</Link>
              <Link to="/nfl/standings" className="nfl-sb-subnav-link">Standings by Division</Link>
              <span className="nfl-sb-subnav-active">Super Bowl Odds</span>
            </nav>
          </section>

          <section className="nfl-sb-summary-grid" aria-label="Super Bowl market summary">
            <SummaryCard
              label="Market Favorite"
              primary={favorite?.team ?? "\u2014"}
              secondary={favorite ? formatPrice(favorite.probability) : "No market price"}
            />
            <SummaryCard
              label="Best Rank Value"
              primary={bestValue?.team ?? "\u2014"}
              secondary={bestValue ? `${formatGap(bestValue.gap)} spots` : "No positive gap"}
              tone="positive"
            />
            <SummaryCard
              label="Largest Market Premium"
              primary={marketPremium?.team ?? "\u2014"}
              secondary={marketPremium ? `${formatGap(marketPremium.gap)} spots` : "No negative gap"}
              tone="negative"
            />
            <SummaryCard
              label="Last Updated"
              primary={updatedAt}
              secondary={data?.stale ? "Polymarket · cached response" : "Polymarket"}
            />
          </section>

          {status === "error" ? (
            <section className="nfl-sb-message nfl-sb-message-error" role="alert">
              Live Super Bowl market prices are unavailable right now. {error}
            </section>
          ) : (
            <section className="nfl-sb-panel">
              {data?.stale && <div className="nfl-sb-message nfl-sb-message-stale">Showing the most recent cached Polymarket response while the live market refreshes.</div>}
              {status === "success" && matchedCount < 32 && (
                <div className="nfl-sb-message nfl-sb-message-partial">
                  Polymarket returned prices for {matchedCount} of 32 NFL teams. Teams without a matched price remain in the table.
                </div>
              )}
              <div className="nfl-sb-scroll">
                <table className="nfl-sb-table">
                  <thead>
                    <tr>
                      <th>Odds Rank</th>
                      <th className="nfl-sb-th-team">Team</th>
                      <th>Market Price</th>
                      <th>Power Rank</th>
                      <th>Rank Gap</th>
                      <th className="nfl-sb-th-signal">Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status === "loading" ? <LoadingRows /> : rows.map((row) => {
                      const signal = getRankGapSignal(row.gap);
                      return (
                        <tr key={row.abbr}>
                          <td className="nfl-sb-rank">{row.marketRank ?? "\u2014"}</td>
                          <td className="nfl-sb-team" title={row.team}>
                            <span className="nfl-sb-accent" style={{ background: row.color }} aria-hidden />
                            <TeamLogo team={row} />
                            <span className="nfl-sb-name">{row.team}</span>
                            <span className="nfl-sb-abbr">{row.abbr.toUpperCase()}</span>
                          </td>
                          <td className="nfl-sb-price">
                            <span>{formatPrice(row.probability)}</span>
                            <small>{row.probability == null ? "\u2014" : `${row.probability.toFixed(1)}%`}</small>
                          </td>
                          <td className="nfl-sb-power">{row.rank}</td>
                          <td className={`nfl-sb-gap ${gapClass(row.gap)}`}>{formatGap(row.gap)}</td>
                          <td className={`nfl-sb-signal ${gapClass(row.gap)}`}>{signal}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="nfl-sb-foot">
                Rank Gap compares the team&apos;s prediction-market rank with its Joe Knows Ball power rank. A positive number means the power rankings rate the team higher than the market does. This is a rank comparison, not a calculated betting edge.
              </p>
            </section>
          )}
        </div>
      </main>
    </SiteShell>
  );
}

const STYLES = `
  .nfl-sb-hero{padding:4px 0 0}
  .nfl-sb-eyebrow{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#1a6fc4}
  .nfl-sb-title{font-size:2rem;font-weight:800;letter-spacing:-.02em;color:#0c1f3a;margin-top:6px;line-height:1.05}
  .nfl-sb-sub{font-size:.9rem;color:#5a6878;margin-top:8px;max-width:46rem}
  .nfl-sb-subnav{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;align-items:center}
  .nfl-sb-subnav-active{font-size:13px;font-weight:700;color:#fff;background:#0c1f3a;border-radius:999px;padding:7px 16px}
  .nfl-sb-subnav-link{font-size:13px;font-weight:600;color:#1a3a5c;background:#eef2f7;border-radius:999px;padding:7px 16px;text-decoration:none;transition:background .15s}
  .nfl-sb-subnav-link:hover{background:#dde6f0}

  .nfl-sb-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:18px}
  .nfl-sb-summary{background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:13px 14px;min-width:0}
  .nfl-sb-summary-label{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#718096}
  .nfl-sb-summary-primary{color:#0c1f3a;font-size:14px;font-weight:800;line-height:1.2;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .nfl-sb-summary-secondary{font-size:12px;color:#667586;margin-top:3px;font-variant-numeric:tabular-nums}
  .nfl-sb-summary-positive .nfl-sb-summary-secondary{color:#15803d;font-weight:700}
  .nfl-sb-summary-negative .nfl-sb-summary-secondary{color:#b91c1c;font-weight:700}

  .nfl-sb-panel{background:#fff;border:1px solid #e3e8ef;border-radius:8px;box-shadow:0 2px 12px rgba(12,31,58,.06);overflow:hidden;margin-top:18px}
  .nfl-sb-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .nfl-sb-table{width:100%;border-collapse:collapse;font-size:13px;min-width:720px}
  .nfl-sb-table thead th{background:#0c1f3a;color:#fff;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:11px 10px;text-align:center;white-space:nowrap}
  .nfl-sb-th-team{text-align:left!important;width:245px}
  .nfl-sb-th-signal{width:145px}
  .nfl-sb-table tbody tr{border-bottom:1px solid #eef2f7}
  .nfl-sb-table tbody tr:last-child{border-bottom:0}
  .nfl-sb-table tbody tr:hover{background:#f7faff}
  .nfl-sb-rank,.nfl-sb-power{text-align:center;font-weight:800;font-size:14px;color:#0c1f3a;font-variant-numeric:tabular-nums}
  .nfl-sb-team{display:flex;align-items:center;gap:8px;padding:8px 10px}
  .nfl-sb-accent{width:4px;height:28px;border-radius:2px;flex-shrink:0}
  .nfl-sb-logo{width:28px;height:28px;object-fit:contain;flex-shrink:0}
  .nfl-sb-badge{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;color:#fff;flex-shrink:0}
  .nfl-sb-name{font-weight:700;color:#1a2a3f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .nfl-sb-abbr{display:none}
  .nfl-sb-price{text-align:center;font-weight:800;color:#0c1f3a;font-variant-numeric:tabular-nums}
  .nfl-sb-price span,.nfl-sb-price small{display:block}
  .nfl-sb-price small{font-size:10px;font-weight:600;color:#7a8694;margin-top:1px}
  .nfl-sb-gap{text-align:center;font-size:14px;font-weight:800;font-variant-numeric:tabular-nums}
  .nfl-sb-signal{text-align:center;font-size:11px;font-weight:800;white-space:nowrap}
  .is-positive{color:#15803d}.is-negative{color:#b91c1c}.is-neutral{color:#667586}
  .nfl-sb-foot{font-size:11px;color:#778596;line-height:1.55;padding:14px 18px}
  .nfl-sb-message{font-size:13px;line-height:1.45;padding:11px 14px}
  .nfl-sb-message-error{margin-top:18px;background:#fff7f7;border:1px solid #fecaca;border-radius:8px;color:#991b1b}
  .nfl-sb-message-stale{background:#fffbea;border-bottom:1px solid #fde68a;color:#92400e}
  .nfl-sb-message-partial{background:#f7faff;border-bottom:1px solid #dce8f7;color:#34506b}
  .nfl-sb-skeleton{display:block;height:13px;background:#e8eef5;border-radius:3px;margin:10px auto;animation:nfl-sb-pulse 1.3s ease-in-out infinite}
  .nfl-sb-skeleton-rank{width:24px}.nfl-sb-skeleton-team{width:150px;margin-left:10px}.nfl-sb-skeleton-price{width:45px}.nfl-sb-skeleton-signal{width:90px}
  @keyframes nfl-sb-pulse{50%{opacity:.45}}

  @media(max-width:780px){
    .nfl-sb-title{font-size:1.5rem}
    .nfl-sb-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  }
  @media(max-width:640px){
    .nfl-sb-subnav{gap:6px}
    .nfl-sb-subnav-active,.nfl-sb-subnav-link{font-size:12px;padding:6px 11px}
    .nfl-sb-summary{padding:11px}
    .nfl-sb-summary-primary{font-size:13px}
    .nfl-sb-table{min-width:570px;font-size:12px}
    .nfl-sb-table thead th{font-size:9px;padding:9px 6px;letter-spacing:.02em}
    .nfl-sb-th-team{width:70px}
    .nfl-sb-th-signal{width:90px}
    .nfl-sb-team{padding:7px 6px;gap:5px}
    .nfl-sb-accent,.nfl-sb-name{display:none}
    .nfl-sb-logo,.nfl-sb-badge{width:25px;height:25px}
    .nfl-sb-abbr{display:inline;font-size:10px;font-weight:800;color:#1a2a3f}
    .nfl-sb-rank,.nfl-sb-power,.nfl-sb-gap{font-size:12px}
    .nfl-sb-signal{font-size:9.5px;white-space:normal;line-height:1.15}
  }
`;
