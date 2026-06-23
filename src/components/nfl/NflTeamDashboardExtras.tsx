import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { getNflOffseasonProfile, type NflPlayerMove } from "@/data/nflOffseason2026";
import { NFL_GUIDE_TEAM_BY_ABBR, formatSigned, type NflGuideTeam } from "@/lib/nfl/guide2026";
import { calculateRankGap, getRankGapSignal, type SuperBowlMarketTeam } from "@/lib/nfl/superBowlMarkets";
import type { NflScheduleGame, NflTeamScheduleResponse } from "@/lib/nfl/teamSchedule";

type LoadStatus = "loading" | "success" | "error";
type MatchupTone = "advantage" | "disadvantage" | "even" | "neutral";

type SuperBowlOddsResponse = {
  updatedAt: string;
  stale?: boolean;
  teams: SuperBowlMarketTeam[];
};

export default function NflTeamDashboardExtras({ team }: { team: NflGuideTeam }) {
  return (
    <div className="space-y-8">
      <MarketValueSection team={team} />
      <ScheduleSection team={team} />
      <OffseasonSection team={team} />
    </div>
  );
}

function MarketValueSection({ team }: { team: NflGuideTeam }) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [response, setResponse] = useState<SuperBowlOddsResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

    fetch(`${base}/api/nfl/super-bowl-odds`, { signal: controller.signal })
      .then(async (result) => {
        const payload = await result.json().catch(() => null);
        if (!result.ok || !Array.isArray(payload?.teams)) {
          throw new Error(payload?.error ?? "Super Bowl market data is unavailable.");
        }
        return payload as SuperBowlOddsResponse;
      })
      .then((payload) => {
        setResponse(payload);
        setStatus("success");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      });

    return () => controller.abort();
  }, []);

  const market = useMemo(
    () => response?.teams.find((entry) => entry.abbr.toLowerCase() === team.abbr) ?? null,
    [response, team.abbr],
  );
  const rankGap = calculateRankGap(market?.marketRank ?? null, team.powerRank);
  const rankSignal = getRankGapSignal(rankGap);

  return (
    <section>
      <SectionHeading
        eyebrow="Odds & value"
        title="Market comparison"
        description="Win-total value comes from the preseason model. Super Bowl value compares the live prediction-market rank with the Joe Knows Ball power rank."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <ValueCard label="Win total" value={team.winTotal?.toFixed(1) ?? "—"} />
        <ValueCard label="Projected wins" value={team.projectedWins.toFixed(1)} tone="blue" />
        <ValueCard
          label="Win-total edge"
          value={team.modelEdge == null ? "—" : formatSigned(team.modelEdge)}
          tone={team.modelEdge == null ? "neutral" : team.modelEdge > 0 ? "good" : team.modelEdge < 0 ? "bad" : "neutral"}
        />
        <ValueCard
          label="Super Bowl probability"
          value={status === "loading" ? "Loading…" : market?.probability == null ? "—" : `${market.probability.toFixed(1)}%`}
        />
        <ValueCard
          label="Market rank gap"
          value={rankGap == null ? "—" : `${formatSigned(rankGap, 0)} spots`}
          detail={rankGap == null ? "No matched market" : rankSignal}
          tone={rankGap == null ? "neutral" : rankGap > 1 ? "good" : rankGap < -1 ? "bad" : "neutral"}
        />
      </div>
      {status === "error" && <p className="mt-3 text-xs leading-5 text-slate-500">Live Super Bowl market data is unavailable; the team model and win-total value remain available.</p>}
      {response?.stale && <p className="mt-3 text-xs font-bold text-amber-700">Showing the most recent cached Super Bowl market response.</p>}
    </section>
  );
}

function ScheduleSection({ team }: { team: NflGuideTeam }) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [data, setData] = useState<NflTeamScheduleResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    setStatus("loading");
    setError("");

    fetch(`${base}/api/nfl/team-schedule?team=${encodeURIComponent(team.abbr)}`, { signal: controller.signal })
      .then(async (result) => {
        const payload = await result.json().catch(() => null);
        if (!result.ok || !Array.isArray(payload?.games)) {
          throw new Error(payload?.error ?? "The 2026 schedule is unavailable.");
        }
        return payload as NflTeamScheduleResponse;
      })
      .then((payload) => {
        setData(payload);
        setStatus("success");
      })
      .catch((fetchError) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setError(fetchError instanceof Error ? fetchError.message : "The 2026 schedule is unavailable.");
        setStatus("error");
      });

    return () => controller.abort();
  }, [team.abbr]);

  return (
    <section>
      <SectionHeading
        eyebrow="Week by week"
        title="2026 regular-season schedule"
        description="Each matchup includes the opponent's current power rating and the model's offensive and defensive matchup edges. Away games use a blue background."
      />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {status === "loading" && <ScheduleLoading />}
        {status === "error" && <div className="p-6 text-sm leading-6 text-red-700">The schedule feed is unavailable right now. {error}</div>}
        {status === "success" && data && (
          <>
            {data.stale && <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs font-bold text-amber-800">Showing the most recent cached schedule.</div>}
            <div className="grid sm:grid-cols-2 xl:grid-cols-3">
              {data.games.map((game, index) => (
                <ScheduleGameCard key={game.id} team={team} game={game} fallbackWeek={index + 1} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function OffseasonSection({ team }: { team: NflGuideTeam }) {
  const offseason = getNflOffseasonProfile(team.abbr);

  return (
    <section>
      <SectionHeading
        eyebrow="2025 → 2026"
        title="Coaching and notable player changes"
        description="A team-specific view of the head-coach transition plus notable free-agent and trade movement. The player list is selective, not a complete transaction log."
      />
      <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-black text-slate-900">Head coach</h3>
            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${offseason.status === "Changed" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}`}>{offseason.status}</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <CoachCard year="2025" coach={offseason.headCoach2025} muted />
            <CoachCard year="2026" coach={offseason.headCoach2026} />
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">{offseason.note}</p>
        </article>
        <div className="grid gap-6 md:grid-cols-2">
          <MoveCard title="Key additions" moves={offseason.additions} direction="in" />
          <MoveCard title="Key departures" moves={offseason.departures} direction="out" />
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-slate-400">Offseason snapshot updated through {formatVerifiedDate(offseason.verifiedAt)}. Draft picks and minor transactions are not included.</p>
    </section>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="mb-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">{eyebrow}</div><h2 className="mt-1 text-2xl font-black text-slate-900">{title}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p></div>;
}

function ValueCard({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail?: string; tone?: "good" | "bad" | "blue" | "neutral" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-600" : tone === "blue" ? "text-blue-700" : "text-slate-900";
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className={`mt-1 text-2xl font-black ${color}`}>{value}</div>{detail && <div className="mt-1 text-xs font-bold text-slate-500">{detail}</div>}</div>;
}

function CoachCard({ year, coach, muted = false }: { year: string; coach: string; muted?: boolean }) {
  return <div className={`rounded-xl border p-4 ${muted ? "border-slate-200 bg-slate-50" : "border-blue-200 bg-blue-50"}`}><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{year}</div><div className="mt-1 text-lg font-black text-slate-900">{coach}</div></div>;
}

function MoveCard({ title, moves, direction }: { title: string; moves: NflPlayerMove[]; direction: "in" | "out" }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className={`text-lg font-black ${direction === "in" ? "text-emerald-800" : "text-red-700"}`}>{title}</h3>
      <div className="mt-3 divide-y divide-slate-100">
        {moves.length === 0 ? <p className="py-4 text-sm leading-6 text-slate-500">No notable move is included in the current snapshot.</p> : moves.slice(0, 8).map((move) => {
          const otherAbbr = direction === "in" ? move.from : move.to;
          const otherTeam = NFL_GUIDE_TEAM_BY_ABBR.get(otherAbbr)?.team ?? otherAbbr.toUpperCase();
          return <div key={`${move.player}-${move.from}-${move.to}`} className="flex items-start justify-between gap-3 py-3"><div><div className="font-black text-slate-900">{move.player}</div><div className="mt-0.5 text-xs text-slate-500">{move.position} · {move.method}</div></div><div className="text-right text-xs font-bold text-slate-500">{direction === "in" ? "From" : "To"} {otherTeam}</div></div>;
        })}
      </div>
    </article>
  );
}

function ScheduleLoading() {
  return <div className="grid sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="animate-pulse border-b border-r border-slate-100 p-5"><div className="h-3 w-16 rounded bg-slate-200" /><div className="mt-4 h-8 w-40 rounded bg-slate-200" /><div className="mt-3 h-3 w-28 rounded bg-slate-100" /><div className="mt-4 grid grid-cols-3 gap-2"><div className="h-14 rounded bg-slate-100" /><div className="h-14 rounded bg-slate-100" /><div className="h-14 rounded bg-slate-100" /></div></div>)}</div>;
}

function ScheduleGameCard({ team, game, fallbackWeek }: { team: NflGuideTeam; game: NflScheduleGame; fallbackWeek: number }) {
  const opponent = NFL_GUIDE_TEAM_BY_ABBR.get(game.opponentAbbr);
  const opponentName = opponent?.team ?? game.opponentName;
  const date = game.date ? new Date(game.date) : null;
  const dateText = date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date) : game.status;
  const isAway = game.homeAway === "away";
  const offenseEdge = opponent ? team.offPct - opponent.defPct : null;
  const defenseEdge = opponent ? team.defPct - opponent.offPct : null;

  return (
    <article className={`border-b border-r p-5 transition-colors ${isAway ? "border-blue-100 bg-blue-50/80" : "border-slate-100 bg-white"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-black uppercase tracking-wider text-blue-600">Week {game.week ?? fallbackWeek}</div>
          {isAway && <span className="rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-blue-700">Away</span>}
        </div>
        <div className="text-xs font-bold text-slate-400">{game.result ?? game.status}</div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <img src={nflLogoUrl(game.opponentAbbr)} alt="" className="h-9 w-9 object-contain" />
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{isAway ? "at" : game.homeAway === "neutral" ? "vs · neutral" : "vs"}</div>
          {opponent ? <Link to={`/nfl/guide/team/${opponent.slug}`} className="text-lg font-black text-slate-900 hover:text-blue-700 hover:underline">{opponentName}</Link> : <div className="text-lg font-black text-slate-900">{opponentName}</div>}
        </div>
      </div>

      <div className="mt-3 text-xs leading-5 text-slate-500">{dateText}{game.venue ? ` · ${game.venue}` : ""}</div>

      {opponent && (
        <div className="mt-4 grid grid-cols-3 gap-2" aria-label={`Model matchup ratings against ${opponentName}`}>
          <MatchupMetric
            label="Opponent power"
            value={`#${opponent.powerRank}`}
            detail={`${formatModelRating(opponent.ovrPct)} overall`}
            tone="neutral"
          />
          <MatchupMetric
            label="Offense edge"
            value={formatModelRating(offenseEdge)}
            detail={getEdgeLabel(offenseEdge)}
            tone={getEdgeTone(offenseEdge)}
          />
          <MatchupMetric
            label="Defense edge"
            value={formatModelRating(defenseEdge)}
            detail={getEdgeLabel(defenseEdge)}
            tone={getEdgeTone(defenseEdge)}
          />
        </div>
      )}
    </article>
  );
}

function MatchupMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: MatchupTone }) {
  const classes = tone === "advantage"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : tone === "disadvantage"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "even"
        ? "border-slate-200 bg-slate-50 text-slate-700"
        : "border-blue-200/70 bg-white/80 text-slate-900";

  return (
    <div className={`min-w-0 rounded-lg border px-2 py-2.5 text-center ${classes}`}>
      <div className="truncate text-[8px] font-black uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-sm font-black tabular-nums">{value}</div>
      <div className="mt-0.5 truncate text-[9px] font-bold opacity-75">{detail}</div>
    </div>
  );
}

function formatModelRating(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function getEdgeTone(value: number | null): MatchupTone {
  if (value == null || !Number.isFinite(value)) return "neutral";
  if (value > 0) return "advantage";
  if (value < 0) return "disadvantage";
  return "even";
}

function getEdgeLabel(value: number | null) {
  const tone = getEdgeTone(value);
  if (tone === "advantage") return "Advantage";
  if (tone === "disadvantage") return "Disadvantage";
  if (tone === "even") return "Even";
  return "Unavailable";
}

function formatVerifiedDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date);
}
