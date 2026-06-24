/**
 * HomeFeaturedTables
 *
 * Four live social-style data tables on the home page:
 *  1. MLB HR Props   — top 8 batters by score
 *  2. MLB K Props    — top 5 pitchers by strikeout matchup score
 *  3. MLB ML Edges   — Polymarket prices for today's slate (lightweight, no detail API calls)
 *  4. PGA Power Rankings — top 10 by SG Total percentile + course fit (always available)
 */

import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useMlbPropsData } from "@/hooks/useMlbPropsData";
import { useMlbOdds, type MlbOddsData } from "@/hooks/useMlbOdds";
import { usePolymarketMlbMoneylines } from "@/hooks/usePolymarketMlbMoneylines";
import { buildMetricPercentiles } from "@/lib/pga/historyModel";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import type { HrDashboardBatter } from "@/pages/MlbHrProps";

// Inline TeamLogoBadge — avoids importing the entire MlbHrProps page module
// which causes a circular dependency crash when loaded from Home.tsx
const ESPN_ABBR: Record<string, string> = {
  AZ:"ari",ATH:"oak",WSH:"wsh",CWS:"chw",KCR:"kc",SDP:"sd",SFG:"sf",TBR:"tb",
  NYY:"nyy",NYM:"nym",LAD:"lad",LAA:"laa",BOS:"bos",CHC:"chc",CIN:"cin",
  CLE:"cle",COL:"col",DET:"det",HOU:"hou",MIA:"mia",MIL:"mil",MIN:"min",
  PHI:"phi",PIT:"pit",SEA:"sea",STL:"stl",TEX:"tex",TOR:"tor",ATL:"atl",BAL:"bal",
};
function TeamLogo({ team, size = 18, dark = false }: { team?: string; size?: number; dark?: boolean }) {
  const t = (team ?? "").toUpperCase();
  const folder = dark ? "500-dark" : "500";
  const src = `https://a.espncdn.com/i/teamlogos/mlb/${folder}/${ESPN_ABBR[t] ?? t.toLowerCase()}.png`;
  const colors = getMlbTeamColors(t);
  const [failed, setFailed] = useState(false);
  if (failed) return <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", borderRadius:999, padding:"1px 5px", fontSize:10, fontWeight:700, color:"#fff", backgroundColor:colors.primary, minWidth:size }}>{t}</span>;
  return <img src={src} alt={t} width={size} height={size} style={{ objectFit:"contain" }} loading="lazy" onError={() => setFailed(true)} />;
}

// Mirrors normalizeName() in fetch-mlb-odds.mjs for key lookups
function normKey(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/gi, "")
    .replace(/[^a-z0-9\s'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const MEDAL = ["🥇", "🥈", "🥉"];
const ACCENTS8 = ["#e05c2e","#f97316","#fb923c","#fbbf24","#eab308","#94a3b8","#64748b","#475569"];
const LOGO = (
  <div style={{ background: "#0d1e38", borderRadius: 8, padding: "4px 8px", fontSize: 11, color: "#ffffff" }}>
    joeknowsball.com
  </div>
);

function sc(s: number) {
  if (s >= 70) return { bg: "#22c55e", color: "#fff" };
  if (s >= 65) return { bg: "#4ade80", color: "#fff" };
  if (s >= 62) return { bg: "#d97706", color: "#fff" };
  return { bg: "#fb923c", color: "#fff" };
}
function statCol(v: number | null, hi: number, mid: number) {
  if (v == null) return "#94a3b8";
  return v >= hi ? "#22c55e" : v >= mid ? "#86efac" : "#94a3b8";
}
function pctColor(p: number) {
  if (p >= 75) return "#22c55e";
  if (p >= 50) return "#86efac";
  if (p >= 25) return "#94a3b8";
  return "#ef4444";
}

function Skeleton() {
  return (
    <div style={{ background: "#060d1a", borderRadius: 10, padding: 32, textAlign: "center", color: "#64748b", fontSize: 13 }}>
      Loading…
    </div>
  );
}

function SectionWrap({ eyebrow, title, subtitle, cta, ctaTo, children }: {
  eyebrow: string; title: string; subtitle: string; cta: string; ctaTo: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{eyebrow}</div>
        <h3 className="text-[17px] font-bold tracking-tight text-slate-900">{title}</h3>
        <p className="mt-0.5 text-[12px] text-slate-500">
          {subtitle}{" "}
          <Link to={ctaTo} className="font-semibold text-sky-600 hover:underline">{cta} →</Link>
        </p>
      </div>
      <div className="overflow-hidden rounded-xl shadow-lg">{children}</div>
    </div>
  );
}

// ─── HR Props table ───────────────────────────────────────────────────────

function HRTable({ batters, mlbOdds }: { batters: HrDashboardBatter[]; mlbOdds: MlbOddsData | null }) {
  const rows = batters
    .filter(b => !(b.barrelRate != null && b.barrelRate > 25) && !(b.atBats != null && b.atBats < 50))
    .slice().sort((a, b) => (b.adjustedHrScore ?? b.hrScore) - (a.adjustedHrScore ?? a.hrScore))
    .slice(0, 8);

  if (!rows.length) return <Skeleton />;

  return (
    <div style={{ background: "#060d1a", overflow: "hidden", fontSize: 12 }}>
      <div style={{ background: "#0a1628", borderBottom: "3px solid #e05c2e", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#fff" }}>🔥 MLB HR PROPS</div>
          <div style={{ color: "#38bdf8", fontSize: 11, marginTop: 2 }}>Top 8 Home Run Edges · Today's Slate</div>
        </div>
        {LOGO}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 88px 80px 80px 46px 46px 64px", padding: "5px 10px", background: "#0d1f3c", gap: 4 }}>
        {["","PLAYER","SCORE","BARREL%","HH%","L7","L30","HR LINE"].map((h, i) => (
          <span key={i} style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: ".07em", textAlign: i > 1 ? "center" : "left" }}>{h}</span>
        ))}
      </div>
      {rows.map((r, i) => {
        const score = r.adjustedHrScore ?? r.hrScore;
        const pill = sc(score);
        const hrLine = mlbOdds?.hrOdds?.[normKey(r.player)]?.yes;
        return (
          <div key={r.player + i} style={{ display: "grid", gridTemplateColumns: "36px 1fr 88px 80px 80px 46px 46px 64px", padding: "6px 10px", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderBottom: "1px solid #1e3a5f", alignItems: "center", gap: 4, position: "relative" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: ACCENTS8[i] }} />
            <span style={{ fontSize: i < 3 ? 17 : 13, fontWeight: 900, color: ACCENTS8[i], paddingLeft: 5 }}>{i < 3 ? MEDAL[i] : i + 1}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, overflow: "hidden" }}>
              <span style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1 }}>{r.player}</span>
              <TeamLogo team={r.team} size={12} dark />
              <span style={{ color: "#64748b", fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 2 }}>vs {r.opposingPitcher}</span>
            </div>
            <div style={{ ...pill, color: "#fff", borderRadius: 7, padding: "3px 0", fontWeight: 900, textAlign: "center", fontSize: 13 }}>
              {score >= 70 && "🔥"}{score.toFixed(1)}
            </div>
            <div style={{ textAlign: "center", color: statCol(r.barrelRate, 20, 16), fontWeight: 600, fontSize: 12 }}>
              {r.barrelRate != null && r.barrelRate >= 18 && "💣 "}{r.barrelRate != null ? `${r.barrelRate.toFixed(1)}%` : "—"}
            </div>
            <div style={{ textAlign: "center", color: statCol(r.hardHitRate, 54, 50), fontWeight: 600, fontSize: 12 }}>
              {r.hardHitRate != null && r.hardHitRate >= 55 && "💥 "}{r.hardHitRate != null ? `${r.hardHitRate.toFixed(1)}%` : "—"}
            </div>
            <div style={{ textAlign: "center", color: r.last7HR >= 3 ? "#22c55e" : r.last7HR >= 2 ? "#facc15" : "#94a3b8", fontWeight: 700, fontSize: 13 }}>{r.last7HR}</div>
            <div style={{ textAlign: "center", color: r.last30HR >= 8 ? "#22c55e" : r.last30HR >= 5 ? "#facc15" : "#94a3b8", fontWeight: 700, fontSize: 13 }}>{r.last30HR}</div>
            <div style={{ textAlign: "center", fontWeight: 700, fontSize: 11, color: hrLine ? (hrLine.startsWith("+") ? "#4ade80" : "#94a3b8") : "#334155" }}>{hrLine ?? "—"}</div>
          </div>
        );
      })}
      <div style={{ padding: "4px 10px", background: "#060d1a", borderTop: "1px solid #1e3a5f", display: "flex", gap: 8 }}>
        {[["💣","Barrel ≥18%"],["💥","HH ≥55%"],["📈","L7 ≥3"],["👑","L30 ≥8"],["🔥","Score ≥70"]].map(([e,l]) => (
          <span key={l as string} style={{ fontSize: 9, color: "#475569" }}>{e} {l}</span>
        ))}
      </div>
    </div>
  );
}

// ─── K Props table ────────────────────────────────────────────────────────

type KRow = { pitcher: string; team: string; opponent: string; kMatchupScore?: number; kRate?: number | null; whiffRate?: number | null; opponentTeamKRate?: number | null };

function KTable({ rows, mlbOdds }: { rows: KRow[]; mlbOdds: MlbOddsData | null }) {
  const top = [...rows]
    .sort((a, b) => (b.kMatchupScore ?? 0) - (a.kMatchupScore ?? 0))
    .slice(0, 5);
  if (!top.length) return <Skeleton />;
  const KA = ["#e05c2e","#f97316","#fb923c","#fbbf24","#eab308"];
  return (
    <div style={{ background: "#060d1a", overflow: "hidden", fontSize: 12 }}>
      <div style={{ background: "#0a1628", borderBottom: "3px solid #22c55e", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#fff" }}>🎯 MLB K PROPS</div>
          <div style={{ color: "#86efac", fontSize: 11, marginTop: 2 }}>Top 5 Strikeout Edges · Today's Slate</div>
        </div>
        {LOGO}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 78px 68px 68px 68px 72px", padding: "5px 10px", background: "#0d1f3c", gap: 4 }}>
        {["","PITCHER","K SCORE","K%","WHIFF%","OPP K%","K LINE"].map((h, i) => (
          <span key={i} style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: ".07em", textAlign: i > 1 ? "center" : "left" }}>{h}</span>
        ))}
      </div>
      {top.map((r, i) => {
        const score = r.kMatchupScore ?? 0;
        const pill = sc(score);
        const kData = mlbOdds?.kOdds?.[normKey(r.pitcher)];
        const kLineStr = kData?.line != null && kData?.over ? `O${kData.line} ${kData.over}` : null;
        return (
          <div key={r.pitcher + i} style={{ display: "grid", gridTemplateColumns: "36px 1fr 78px 68px 68px 68px 72px", padding: "7px 10px", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderBottom: "1px solid #1e3a5f", alignItems: "center", gap: 4, position: "relative" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: KA[i] }} />
            <span style={{ fontSize: i < 3 ? 17 : 13, fontWeight: 900, color: KA[i], paddingLeft: 5 }}>{i < 3 ? MEDAL[i] : i + 1}</span>
            <div>
              <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 12 }}>{r.pitcher}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
                <TeamLogo team={r.team} size={12} dark />
                <span style={{ color: "#64748b", fontSize: 10 }}>vs {r.opponent}</span>
              </div>
            </div>
            <div style={{ ...pill, borderRadius: 7, padding: "3px 0", fontWeight: 900, textAlign: "center", fontSize: 13 }}>
              {score.toFixed(1)}
            </div>
            <div style={{ textAlign: "center", color: r.kRate != null && r.kRate >= 28 ? "#22c55e" : "#94a3b8", fontWeight: 600, fontSize: 12 }}>
              {r.kRate != null ? `${r.kRate.toFixed(1)}%` : "—"}
            </div>
            <div style={{ textAlign: "center", color: r.whiffRate != null && r.whiffRate >= 32 ? "#22c55e" : "#94a3b8", fontWeight: 600, fontSize: 12 }}>
              {r.whiffRate != null ? `${r.whiffRate.toFixed(1)}%` : "—"}
            </div>
            <div style={{ textAlign: "center", color: r.opponentTeamKRate != null && r.opponentTeamKRate >= 27 ? "#22c55e" : "#94a3b8", fontWeight: 600, fontSize: 12 }}>
              {r.opponentTeamKRate != null ? `${r.opponentTeamKRate.toFixed(1)}%` : "—"}
            </div>
            <div style={{ textAlign: "center", fontWeight: 700, fontSize: 11, color: kLineStr ? "#86efac" : "#334155" }}>{kLineStr ?? "—"}</div>
          </div>
        );
      })}
      <div style={{ padding: "4px 10px", background: "#060d1a", borderTop: "1px solid #1e3a5f", display: "flex", gap: 8 }}>
        <span style={{ fontSize: 9, color: "#475569" }}>● K% ≥28%  ■ Whiff ≥32%  ◆ Opp K ≥27%</span>
      </div>
    </div>
  );
}

// ─── ML Edges table ───────────────────────────────────────────────────────
// Shows games ranked by Polymarket market conviction (how far the favored
// team's price is from 50¢). Includes sportsbook ML for context.

function MLTable() {
  const { data: polyData } = usePolymarketMlbMoneylines();
  const mlbOdds = useMlbOdds();

  const rows = useMemo(() => {
    if (!polyData?.games?.length) return [];
    return polyData.games
      .filter(g => g.matched && g.away.yesPrice != null && g.home.yesPrice != null)
      .map(g => {
        // Determine which side the market favors and by how much
        const homeFavored = (g.home.yesPrice ?? 0) > (g.away.yesPrice ?? 0);
        const pickAbbr   = homeFavored ? g.home.abbreviation : g.away.abbreviation;
        const fadeAbbr   = homeFavored ? g.away.abbreviation : g.home.abbreviation;
        const pickPrice  = homeFavored ? g.home.yesPrice! : g.away.yesPrice!;
        const edge       = Math.round((pickPrice - 0.5) * 100); // cents above 50¢
        const gameKey    = `${g.away.abbreviation}@${g.home.abbreviation}`;
        const ml         = mlbOdds?.moneylines?.[gameKey];
        const pickAmerican = homeFavored ? ml?.home?.american : ml?.away?.american;
        return { g, pickAbbr, fadeAbbr, pickPrice, edge, gameKey, pickAmerican };
      })
      .filter(r => r.edge > 0)
      .sort((a, b) => b.edge - a.edge)
      .slice(0, 6);
  }, [polyData, mlbOdds]);

  const fmtCents = (p: number) => `${Math.round(p * 100)}¢`;
  const ML_ACCENTS = ["#6366f1","#818cf8","#a5b4fc","#c7d2fe","#e0e7ff","#ede9fe"];

  if (!rows.length) return <Skeleton />;

  return (
    <div style={{ background: "#060d1a", overflow: "hidden", fontSize: 12 }}>
      <div style={{ background: "#0a1628", borderBottom: "3px solid #6366f1", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#fff" }}>🏆 ML EDGES</div>
          <div style={{ color: "#a5b4fc", fontSize: 11, marginTop: 2 }}>Sorted by Polymarket Market Conviction</div>
        </div>
        {LOGO}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 72px 72px 72px", padding: "5px 10px", background: "#0d1f3c", gap: 4 }}>
        {["","MATCHUP","PICK","POLY PRICE","BOOK ML"].map((h, i) => (
          <span key={i} style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: ".07em", textAlign: i > 1 ? "center" : "left" }}>{h}</span>
        ))}
      </div>
      {rows.map(({ g, pickAbbr, fadeAbbr, pickPrice, edge, pickAmerican }, i) => {
        const edgeColor = edge >= 15 ? "#22c55e" : edge >= 8 ? "#4ade80" : "#a5b4fc";
        return (
          <div key={g.gamePk + i} style={{ display: "grid", gridTemplateColumns: "36px 1fr 72px 72px 72px", padding: "7px 10px", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderBottom: "1px solid #1e3a5f", alignItems: "center", gap: 4, position: "relative" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: ML_ACCENTS[i] }} />
            <span style={{ fontSize: i < 3 ? 17 : 13, fontWeight: 900, color: ML_ACCENTS[i], paddingLeft: 5 }}>{i < 3 ? MEDAL[i] : i + 1}</span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 12 }}>{pickAbbr}</span>
                <span style={{ color: "#475569", fontSize: 10 }}>vs {fadeAbbr}</span>
              </div>
              <div style={{ fontSize: 9, color: "#475569", marginTop: 1 }}>
                {g.away.abbreviation} @ {g.home.abbreviation}
              </div>
            </div>
            {/* Pick label with edge */}
            <div style={{ background: edgeColor + "22", color: edgeColor, border: `1px solid ${edgeColor}55`, borderRadius: 7, padding: "4px 0", fontWeight: 900, textAlign: "center", fontSize: 12 }}>
              {pickAbbr}
            </div>
            {/* Polymarket price */}
            <div style={{ textAlign: "center", color: "#38bdf8", fontWeight: 700, fontSize: 13 }}>
              {fmtCents(pickPrice)}
              <div style={{ fontSize: 9, color: "#475569", fontWeight: 500 }}>+{edge}¢ edge</div>
            </div>
            {/* Sportsbook ML */}
            <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 12 }}>
              {pickAmerican ?? "—"}
            </div>
          </div>
        );
      })}
      <div style={{ padding: "4px 10px", background: "#060d1a", borderTop: "1px solid #1e3a5f" }}>
        <span style={{ fontSize: 9, color: "#475569" }}>Edge = Polymarket price minus 50¢ · Full model picks on the MLB page</span>
      </div>
    </div>
  );
}

// ─── PGA Power Rankings table ─────────────────────────────────────────────

interface RawStat {
  player: string;
  sgTotal: number | null;
  sgOTT: number | null;
  sgApp: number | null;
  sgAtG: number | null;
  sgPutt: number | null;
  drivingAccuracy: number | null;
  bogeyAvoidance: number | null;
  [key: string]: unknown;
}

function PGATable({ label }: { label: string }) {
  const [players, setPlayers] = useState<RawStat[]>([]);

  useEffect(() => {
    fetch("/data/pga/player-stats-raw.json", { cache: "no-store" })
      .then(r => r.json())
      .then(d => setPlayers(Array.isArray(d) ? d : d.players ?? []))
      .catch(() => {});
  }, []);

  const rows = useMemo(() => {
    if (!players.length) return [];
    const percentiles = buildMetricPercentiles(players as any);
    return players
      .filter(p => p.sgTotal != null)
      .map(p => {
        const key = p.player.toLowerCase().replace(/[^a-z0-9]/g, "");
        const pcts = percentiles.get(key) ?? {};
        const sgPct   = Math.round(pcts["sgTotal"] ?? 0);
        const fitPct  = Math.round(
          (pcts["sgApp"] ?? 50) * 0.35 +
          (pcts["sgPutt"] ?? 50) * 0.30 +
          (pcts["sgAtG"] ?? 50) * 0.20 +
          (pcts["sgOTT"] ?? 50) * 0.15
        );
        const score = Math.round((sgPct * 0.6 + fitPct * 0.4) * 10) / 10;
        return { player: p.player, sgPct, fitPct, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [players]);

  if (!rows.length) return <Skeleton />;

  const GA = ["#22c55e","#4ade80","#86efac","#fbbf24","#facc15","#f97316","#fb923c","#94a3b8","#64748b","#475569"];

  return (
    <div style={{ background: "#060d1a", overflow: "hidden", fontSize: 12 }}>
      <div style={{ background: "#0a1628", borderBottom: "3px solid #22c55e", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 15, color: "#fff" }}>⛳ {label.toUpperCase()}</div>
          <div style={{ color: "#86efac", fontSize: 11, marginTop: 2 }}>Top 10 · SG Total Percentile + Course Fit</div>
        </div>
        {LOGO}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 72px 72px 72px", padding: "5px 10px", background: "#0d1f3c", gap: 4 }}>
        {["","PLAYER","SCORE","SG TOT%","COURSE FIT"].map((h, i) => (
          <span key={i} style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: ".06em", textAlign: i > 1 ? "center" : "left" }}>{h}</span>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={r.player + i} style={{ display: "grid", gridTemplateColumns: "36px 1fr 72px 72px 72px", padding: "7px 10px", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderBottom: "1px solid #1e3a5f", alignItems: "center", gap: 4, position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: GA[i] }} />
          <span style={{ fontSize: i < 3 ? 17 : 13, fontWeight: 900, color: GA[i], paddingLeft: 5 }}>{i < 3 ? MEDAL[i] : i + 1}</span>
          <span style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.player}</span>
          <div style={{ background: "#22c55e22", color: "#4ade80", borderRadius: 7, padding: "3px 0", fontWeight: 900, textAlign: "center", fontSize: 13, border: "1px solid #22c55e44" }}>
            {r.score.toFixed(0)}
          </div>
          <div style={{ textAlign: "center", fontWeight: 700, color: pctColor(r.sgPct), fontSize: 12 }}>{r.sgPct}</div>
          <div style={{ textAlign: "center", fontWeight: 700, color: pctColor(r.fitPct), fontSize: 12 }}>{r.fitPct}</div>
        </div>
      ))}
      <div style={{ padding: "4px 10px", background: "#060d1a", borderTop: "1px solid #1e3a5f" }}>
        <span style={{ fontSize: 9, color: "#475569" }}>Percentile rank among field · Score = 60% SG Total + 40% Course Fit</span>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────

interface PgaTournamentProp {
  name?: string;
  shortName?: string;
  slug?: string;
}

export function HomeFeaturedTables({ pgaTournament }: { pgaTournament: PgaTournamentProp | null }) {
  const { batters, strikeoutRows, loading } = useMlbPropsData();
  const mlbOdds = useMlbOdds();

  const pgaLabel = pgaTournament?.shortName ?? pgaTournament?.name ?? "PGA Current Power Ratings";
  const pgaRoute = pgaTournament?.slug ? `/pga/${pgaTournament.slug}` : "/pga";

  return (
    <section className="border-t border-black/6 bg-[#f0f4f8]">
      <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-[680px]">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Live Models</div>
          <h2 className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-slate-900 sm:text-[32px]">Today's Top Edges</h2>
          <p className="mt-2 text-[14px] leading-6 text-slate-500">
            Live outputs from our daily models. Click any table to open the full interactive dashboard.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <SectionWrap
            eyebrow="MLB · Home Run Props"
            title="Top HR Edges Today"
            subtitle="Ranked by barrel rate, hard-hit %, and park context."
            cta="Full HR Props Dashboard"
            ctaTo="/mlb/hr-props"
          >
            {loading ? <Skeleton /> : <HRTable batters={batters} mlbOdds={mlbOdds} />}
          </SectionWrap>

          <SectionWrap
            eyebrow="MLB · Strikeout Props"
            title="Top K Edges Today"
            subtitle="Ranked by whiff rate, K%, and opponent strikeout tendency."
            cta="Full K Props Model"
            ctaTo="/mlb/strikeout-props"
          >
            {loading ? <Skeleton /> : <KTable rows={strikeoutRows} mlbOdds={mlbOdds} />}
          </SectionWrap>

          <SectionWrap
            eyebrow="MLB · Polymarket Moneylines"
            title="Today's Odds"
            subtitle="Live prediction market prices for every MLB game today."
            cta="MLB Matchup Analyzer + Odds Tracker"
            ctaTo="/mlb"
          >
            <MLTable />
          </SectionWrap>

          <SectionWrap
            eyebrow="PGA Tour · Golf Rankings"
            title={pgaLabel}
            subtitle="Model score, SG Total percentile, and course fit for the current field."
            cta="Full PGA Golf Model"
            ctaTo={pgaRoute}
          >
            <PGATable label={pgaLabel} />
          </SectionWrap>
        </div>
      </div>
    </section>
  );
}
