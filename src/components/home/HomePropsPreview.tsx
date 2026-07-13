/**
 * HomePropsPreview.tsx
 *
 * Renders live social-media-style table previews on the home page for:
 *  - HR Props (top 5 batters)
 *  - K Props (top 5 pitchers)
 *  - ML Edges (top model picks vs Polymarket)
 *  - PGA Power Rankings (top 10, always available; shows full model when available)
 */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useMlbPropsData } from "@/hooks/useMlbPropsData";
import { usePgaPlayerHistory } from "@/hooks/usePgaPlayerHistory";
import { TeamLogoBadge, type HrDashboardBatter, type PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";
import {
  findCourseWeightEntry,
  getCurrentAndNextEvents,
  type RawPlayerStat,
  usePgaHubData,
} from "@/components/pga/PgaHubShared";
import {
  buildCourseFitWeights,
  buildMetricPercentiles,
  calculateCourseFit,
  calculateTournamentModelScore,
  calculateTrend,
  findEventHistory,
  normalizePlayerKey,
  resolveMajorType,
  scoreFourResultHistory,
  scoreRecentResults,
  selectModelRecentResults,
  selectAllMajorHistory,
  selectSpecificMajorHistory,
} from "@/lib/pga/historyModel";

// ─── Shared helpers ───────────────────────────────────────────────────────────

const BASE_WEIGHTS = { sgTotal: .55, sgApp: .12, sgPutt: .06, sgAtG: .10, sgOTT: .07, drivingAccuracy: .05, bogeyAvoidance: .05 };
const RECENT_START_COUNT = 5;

function sc(s: number) {
  if (s >= 70) return { bg: "#22c55e", color: "#fff" };
  if (s >= 65) return { bg: "#4ade80", color: "#000" };
  if (s >= 62) return { bg: "#facc15", color: "#000" };
  return { bg: "#fb923c", color: "#fff" };
}

function normalizeEventIdentity(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(the|presented by|championship|tournament|2026|picks)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function buildBaseScores(players: Array<RawPlayerStat & { drivingDistance: number | null }>) {
  const metrics = Object.keys(BASE_WEIGHTS) as Array<keyof typeof BASE_WEIGHTS>;
  const ranges = new Map(metrics.map((key) => {
    const values = players.map((p) => Number(p[key])).filter(Number.isFinite);
    return [key, { min: Math.min(...values), max: Math.max(...values) }];
  }));
  return new Map(players.map((player) => {
    let total = 0, weight = 0;
    metrics.forEach((key) => {
      const value = Number(player[key]); const range = ranges.get(key); const metricWeight = BASE_WEIGHTS[key];
      if (!Number.isFinite(value) || !range || range.max === range.min) return;
      const percentile = key === "bogeyAvoidance"
        ? ((range.max - value) / (range.max - range.min)) * 100
        : ((value - range.min) / (range.max - range.min)) * 100;
      total += percentile * metricWeight; weight += metricWeight;
    });
    return [normalizePlayerKey(player.player), weight ? total / weight : 50];
  }));
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function PreviewSection({ eyebrow, title, description, cta, ctaRoute, accent, children }: {
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  ctaRoute: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[11px] font-extrabold uppercase tracking-[0.15em]" style={{ color: accent }}>{eyebrow}</div>
        <h3 className="mt-0.5 text-[18px] font-bold tracking-tight text-[#111]">{title}</h3>
        <p className="mt-1 text-[13px] leading-5 text-[#6b7280]">{description}</p>
      </div>
      <Link to={ctaRoute} className="block no-underline">
        {children}
      </Link>
      <Link
        to={ctaRoute}
        className="self-start text-[13px] font-semibold no-underline"
        style={{ color: accent }}
      >
        {cta} →
      </Link>
    </div>
  );
}

// ─── HR Props preview ────────────────────────────────────────────────────────

function HrPreview({ batters }: { batters: HrDashboardBatter[] }) {
  const rows = batters
    .filter((b) => !(b.atBats != null && b.atBats < 50))
    .slice().sort((a, b) => (b.adjustedHrScore ?? b.hrScore) - (a.adjustedHrScore ?? a.hrScore))
    .slice(0, 5);

  if (!rows.length) {
    return <div style={{ background: "#060d1a", borderRadius: 10, padding: "28px 14px", color: "#64748b", fontSize: 13, textAlign: "center" }}>Loading HR props…</div>;
  }

  const ACCENTS = ["#e05c2e", "#f97316", "#fb923c", "#fbbf24", "#eab308"];

  return (
    <div style={{ background: "#060d1a", borderRadius: 10, overflow: "hidden", fontSize: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.18)" }}>
      <div style={{ background: "#0a1628", borderBottom: "3px solid #e05c2e", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 15, color: "#fff", letterSpacing: "-.3px" }}>🔥 MLB HR PROPS</div>
          <div style={{ color: "#38bdf8", fontSize: 10, marginTop: 2 }}>Top 5 Home Run Edges · Today's Slate</div>
        </div>
        <div style={{ background: "#0d1e38", borderRadius: 8, padding: "4px 8px", fontSize: 10, color: "#ffffff" }}>joeknowsball.com</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 70px 72px 72px", padding: "5px 10px", background: "#0d1f3c", gap: 4 }}>
        {["", "PLAYER", "SCORE", "BARREL%", "HH%"].map((h, i) => (
          <span key={i} style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: ".07em", textAlign: i > 1 ? "center" : "left" }}>{h}</span>
        ))}
      </div>
      {rows.map((r, i) => {
        const score = r.adjustedHrScore ?? r.hrScore;
        const pill = sc(score);
        return (
          <div key={r.player} style={{ display: "grid", gridTemplateColumns: "28px 1fr 70px 72px 72px", padding: "7px 10px", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderBottom: "1px solid #1e3a5f", alignItems: "center", gap: 4, position: "relative" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: ACCENTS[i] }} />
            <span style={{ fontSize: i < 3 ? 16 : 13, fontWeight: 900, color: ACCENTS[i], paddingLeft: 5 }}>
              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
            </span>
            <div>
              <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 12 }}>{r.player}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 1 }}>
                <TeamLogoBadge team={r.team} size={11} showLabel={false} dark={true} />
                <span style={{ color: "#64748b", fontSize: 10 }}>vs {r.opposingPitcher}</span>
              </div>
            </div>
            <div style={{ background: pill.bg, color: pill.color, borderRadius: 6, padding: "3px 0", fontWeight: 900, textAlign: "center", fontSize: 13 }}>{score.toFixed(1)}</div>
            <div style={{ textAlign: "center", color: r.barrelRate != null && r.barrelRate >= 18 ? "#22c55e" : "#94a3b8", fontWeight: 600, fontSize: 12 }}>
              {r.barrelRate != null ? `${r.barrelRate.toFixed(1)}%` : "—"}
            </div>
            <div style={{ textAlign: "center", color: r.hardHitRate != null && r.hardHitRate >= 52 ? "#22c55e" : "#94a3b8", fontWeight: 600, fontSize: 12 }}>
              {r.hardHitRate != null ? `${r.hardHitRate.toFixed(1)}%` : "—"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── K Props preview ─────────────────────────────────────────────────────────

function KPreview({ rows }: { rows: PitcherStrikeoutTeamRow[] }) {
  const top = rows.slice(0, 5);

  if (!top.length) {
    return <div style={{ background: "#060d1a", borderRadius: 10, padding: "28px 14px", color: "#64748b", fontSize: 13, textAlign: "center" }}>Loading K props…</div>;
  }

  const ACCENTS = ["#22c55e", "#4ade80", "#86efac", "#fbbf24", "#eab308"];

  return (
    <div style={{ background: "#060d1a", borderRadius: 10, overflow: "hidden", fontSize: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.18)" }}>
      <div style={{ background: "#0a1628", borderBottom: "3px solid #22c55e", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 15, color: "#fff", letterSpacing: "-.3px" }}>🎯 MLB K PROPS</div>
          <div style={{ color: "#86efac", fontSize: 10, marginTop: 2 }}>Top 5 Strikeout Edges · Today's Slate</div>
        </div>
        <div style={{ background: "#0d1e38", borderRadius: 8, padding: "4px 8px", fontSize: 10, color: "#ffffff" }}>joeknowsball.com</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 70px 60px 60px", padding: "5px 10px", background: "#0d1f3c", gap: 4 }}>
        {["", "PITCHER", "K SCORE", "K%", "WHIFF%"].map((h, i) => (
          <span key={i} style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: ".07em", textAlign: i > 1 ? "center" : "left" }}>{h}</span>
        ))}
      </div>
      {top.map((r, i) => {
        const score = typeof r.strikeoutMatchupScore === "number" && isFinite(r.strikeoutMatchupScore) ? r.strikeoutMatchupScore : 0;
        const pill = sc(score);
        return (
          <div key={r.pitcher} style={{ display: "grid", gridTemplateColumns: "28px 1fr 70px 60px 60px", padding: "7px 10px", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderBottom: "1px solid #1e3a5f", alignItems: "center", gap: 4, position: "relative" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: ACCENTS[i] }} />
            <span style={{ fontSize: i < 3 ? 16 : 13, fontWeight: 900, color: ACCENTS[i], paddingLeft: 5 }}>
              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
            </span>
            <div>
              <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 12 }}>{r.pitcher}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 1 }}>
                <TeamLogoBadge team={r.team} size={11} showLabel={false} dark={true} />
                <span style={{ color: "#64748b", fontSize: 10 }}>vs {r.opponent}</span>
              </div>
            </div>
            <div style={{ background: pill.bg, color: pill.color, borderRadius: 6, padding: "3px 0", fontWeight: 900, textAlign: "center", fontSize: 13 }}>{score.toFixed(1)}</div>
            <div style={{ textAlign: "center", color: r.pitcherKRate != null && r.pitcherKRate >= 28 ? "#22c55e" : "#94a3b8", fontWeight: 600, fontSize: 12 }}>
              {r.pitcherKRate != null ? `${r.pitcherKRate.toFixed(1)}%` : "—"}
            </div>
            <div style={{ textAlign: "center", color: r.pitcherWhiffRate != null && r.pitcherWhiffRate >= 30 ? "#22c55e" : "#94a3b8", fontWeight: 600, fontSize: 12 }}>
              {r.pitcherWhiffRate != null ? `${r.pitcherWhiffRate.toFixed(1)}%` : "—"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ML Edges preview ────────────────────────────────────────────────────────

function MlPreview() {
  // ML edges are computed inside SocialMediaTablesSection which requires full detail context.
  // We show a teaser card pointing to the full MLB page.
  return (
    <div style={{ background: "#060d1a", borderRadius: 10, overflow: "hidden", fontSize: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.18)" }}>
      <div style={{ background: "#0a1628", borderBottom: "3px solid #f59e0b", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 15, color: "#fff", letterSpacing: "-.3px" }}>🏆 MLB ML EDGES</div>
          <div style={{ color: "#fcd34d", fontSize: 10, marginTop: 2 }}>Model value vs Polymarket · Today's Slate</div>
        </div>
        <div style={{ background: "#0d1e38", borderRadius: 8, padding: "4px 8px", fontSize: 10, color: "#ffffff" }}>joeknowsball.com</div>
      </div>
      <div style={{ padding: "20px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { label: "Model Win %", desc: "Probability derived from pitcher quality, lineup strength, and park factors" },
          { label: "Polymarket Price", desc: "Real-money prediction market implied probability" },
          { label: "Value Edge", desc: "Model − market: positive = model favors this team over the market" },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", marginTop: 5, flexShrink: 0 }} />
            <div>
              <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 12 }}>{item.label}</div>
              <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>{item.desc}</div>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 4, background: "#0d1f3c", borderRadius: 8, padding: "10px 12px", borderLeft: "3px solid #f59e0b" }}>
          <div style={{ color: "#fcd34d", fontSize: 11, fontWeight: 700 }}>Full ML Edges table updates live on the Game Matchups tab →</div>
        </div>
      </div>
    </div>
  );
}

// ─── PGA Power Rankings preview ──────────────────────────────────────────────

export function PgaRankingsPreview({ tournamentName }: { tournamentName: string }) {
  const { playerStats, courseWeights, schedule } = usePgaHubData();
  const { playerHistoryMap, majorHistoryMap } = usePgaPlayerHistory();

  const { active, current } = useMemo(() => getCurrentAndNextEvents(schedule), [schedule]);
  const event = active ?? current;
  const eventSlug = event?.slug ?? "";
  const eventName = event?.shortName || event?.name || "";
  const majorType = resolveMajorType(eventName, eventSlug);
  const isMajor = event?.category === "major" || majorType != null;

  const activeWeights = useMemo(
    () => event ? findCourseWeightEntry(courseWeights, event.name, event.courseName)?.weights : null,
    [courseWeights, event],
  );

  const top10 = useMemo(() => {
    if (!playerStats.length) return [];

    const merged = playerStats.map((player) => {
      const key = normalizePlayerKey(player.player);
      const history = playerHistoryMap.get(key);
      return { ...player, drivingDistance: history?.stats?.drivingDistance ?? null };
    });

    const percentiles = buildMetricPercentiles(merged);
    const baseScores = buildBaseScores(merged);
    const fitWeights = buildCourseFitWeights(activeWeights, {
      slug: eventSlug,
      name: eventName,
      category: event?.category,
      yardage: event?.yardage,
    });

    return merged
      .map((player) => {
        const key = normalizePlayerKey(player.player);
        const history = playerHistoryMap.get(key);
        const majorHistory = majorHistoryMap.get(key)?.results ?? [];
        const recentResults = selectModelRecentResults(history, RECENT_START_COUNT);
        const eventResults = findEventHistory(history, eventSlug, eventName);
        const specificMajorResults = selectSpecificMajorHistory(majorHistory, majorType);
        const allMajorResults = selectAllMajorHistory(majorHistory);
        const displayPercentiles = percentiles.get(key) ?? {};
        const courseFit = calculateCourseFit(displayPercentiles, fitWeights);
        const recentScore = scoreRecentResults(recentResults);
        const eventHistoryScore = scoreFourResultHistory(eventResults);
        const specificMajorScore = scoreFourResultHistory(specificMajorResults);
        const allMajorScore = scoreRecentResults(allMajorResults);
        const trend = calculateTrend(recentResults);
        const baseScore = baseScores.get(key) ?? 50;
        const modelScore = calculateTournamentModelScore({
          baseScore, recentScore, courseFit, eventHistoryScore,
          specificMajorScore, allMajorScore, trendScore: trend.score, isMajor,
        });
        const sgTotalPct = Math.round((percentiles.get(key)?.sgTotal ?? 50));
        return { player: player.player, modelScore, sgTotal: player.sgTotal ?? 0, sgTotalPct, courseFit };
      })
      .sort((a, b) => b.modelScore - a.modelScore)
      .slice(0, 10);
  }, [playerStats, playerHistoryMap, majorHistoryMap, activeWeights, eventSlug, eventName, event, majorType, isMajor]);

  const GOLD = ["#f59e0b", "#94a3b8", "#cd7f32"];

  return (
    <div style={{ background: "#060d1a", borderRadius: 10, overflow: "hidden", fontSize: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.18)" }}>
      <div style={{ background: "#0a1628", borderBottom: "3px solid #15803d", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 15, color: "#fff", letterSpacing: "-.3px" }}>⛳ PGA POWER RANKINGS</div>
          <div style={{ color: "#86efac", fontSize: 10, marginTop: 2 }}>{tournamentName} · Top 10</div>
        </div>
        <div style={{ background: "#0d1e38", borderRadius: 8, padding: "4px 8px", fontSize: 10, color: "#ffffff" }}>joeknowsball.com</div>
      </div>

      {top10.length === 0 ? (
        <div style={{ padding: "28px 14px", color: "#64748b", fontSize: 13, textAlign: "center" }}>Loading rankings…</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 68px 64px 68px", padding: "5px 10px", background: "#0d1f3c", gap: 4 }}>
            {["", "PLAYER", "SCORE", "SG TOT%", "COURSE FIT"].map((h, i) => (
              <span key={i} style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: ".07em", textAlign: i > 1 ? "center" : "left" }}>{h}</span>
            ))}
          </div>
          {top10.map((r, i) => {
            const pill = sc(r.modelScore);
            const fitColor = r.courseFit >= 70 ? "#22c55e" : r.courseFit >= 55 ? "#86efac" : "#94a3b8";
            const pctColor = r.sgTotalPct >= 80 ? "#22c55e" : r.sgTotalPct >= 60 ? "#86efac" : "#94a3b8";
            return (
              <div key={r.player} style={{ display: "grid", gridTemplateColumns: "28px 1fr 68px 64px 68px", padding: "7px 10px", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderBottom: "1px solid #1e3a5f", alignItems: "center", gap: 4, position: "relative" }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: i < 3 ? GOLD[i] : "#1e3a5f" }} />
                <span style={{ fontSize: i < 3 ? 16 : 13, fontWeight: 900, color: i < 3 ? GOLD[i] : "#64748b", paddingLeft: 5 }}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </span>
                <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.player}</div>
                <div style={{ background: pill.bg, color: pill.color, borderRadius: 6, padding: "3px 0", fontWeight: 900, textAlign: "center", fontSize: 13 }}>{r.modelScore.toFixed(1)}</div>
                <div style={{ textAlign: "center", color: pctColor, fontWeight: 600, fontSize: 12 }}>{r.sgTotalPct}th</div>
                <div style={{ textAlign: "center", color: fitColor, fontWeight: 600, fontSize: 12 }}>{r.courseFit.toFixed(0)}</div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function HomePropsPreview({ pgaTournamentName, pgaTournamentRoute }: {
  pgaTournamentName: string;
  pgaTournamentRoute: string;
}) {
  const { batters, strikeoutRows } = useMlbPropsData();

  return (
    <div className="space-y-16">
      {/* MLB row: HR + K */}
      <div className="grid gap-10 md:grid-cols-2">
        <PreviewSection
          eyebrow="MLB · Home Run Props"
          title="HR Props Dashboard"
          description="Top home run edges for today's slate, ranked by barrel rate, hard-hit %, park factor, and pitcher vulnerability. Full table with all 30 matchups on the MLB page."
          cta="View full HR Props table"
          ctaRoute="/mlb/hr-props"
          accent="#e05c2e"
        >
          <HrPreview batters={batters} />
        </PreviewSection>

        <PreviewSection
          eyebrow="MLB · Strikeout Props"
          title="K Props Model"
          description="Top strikeout edges for today's starters, ranked by K%, whiff rate, and opponent strikeout tendency. Full model with park context on the MLB page."
          cta="View full K Props table"
          ctaRoute="/mlb/strikeout-props"
          accent="#22c55e"
        >
          <KPreview rows={strikeoutRows} />
        </PreviewSection>
      </div>

      {/* ML Edges + PGA row */}
      <div className="grid gap-10 md:grid-cols-2">
        <PreviewSection
          eyebrow="MLB · Moneyline Edges"
          title="ML Edges"
          description="Where our model disagrees with Polymarket's real-money odds — surfacing games where the market may have mispriced a team. Updated live throughout the day."
          cta="View ML Edges on the MLB page"
          ctaRoute="/mlb"
          accent="#f59e0b"
        >
          <MlPreview />
        </PreviewSection>

        <PreviewSection
          eyebrow="PGA Tour"
          title={pgaTournamentName}
          description="Composite model score built from strokes gained, course fit, recent form, and major history. Rankings update as tournament data refreshes."
          cta="Open full PGA model"
          ctaRoute={pgaTournamentRoute}
          accent="#15803d"
        >
          <PgaRankingsPreview tournamentName={pgaTournamentName} />
        </PreviewSection>
      </div>
    </div>
  );
}
