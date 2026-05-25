import { useState } from "react";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import { computeK9, MLB_DASH } from "@/lib/mlb/mlbFormatters";
import { getSummaryCards } from "@/lib/mlb/mlbComparisonHelpers";
import type { MlbGameDetail } from "@/lib/mlb/mlbTypes";

const ESPN_TEAM_ABBR: Record<string, string> = {
  AZ: "ari", ATH: "oak", WSH: "wsh", CWS: "chw", KCR: "kc",
  SDP: "sd", SFG: "sf", TBR: "tb", NYY: "nyy", NYM: "nym",
  LAD: "lad", LAA: "laa", BOS: "bos", CHC: "chc", CIN: "cin",
  CLE: "cle", COL: "col", DET: "det", HOU: "hou", MIA: "mia",
  MIL: "mil", MIN: "min", PHI: "phi", PIT: "pit", SEA: "sea",
  STL: "stl", TEX: "tex", TOR: "tor", ATL: "atl", BAL: "bal",
};

function espnTeamLogoUrl(abbreviation: string) {
  const key = ESPN_TEAM_ABBR[abbreviation] ?? abbreviation.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/mlb/500/${key}.png`;
}

function mlbHeadshotUrl(mlbId: number | null | undefined) {
  if (!mlbId) return null;
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${mlbId}/headshot/67/current`;
}

function TeamLogo({ abbreviation, size = 56 }: { abbreviation: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const colors = getMlbTeamColors(abbreviation);
  if (failed) {
    return (
      <div
        className="flex items-center justify-center rounded-full font-bold text-white"
        style={{ width: size, height: size, backgroundColor: colors.primary, fontSize: size * 0.35 }}
      >
        {abbreviation.slice(0, 3)}
      </div>
    );
  }
  return (
    <img
      src={espnTeamLogoUrl(abbreviation)}
      alt={abbreviation}
      width={size}
      height={size}
      className="object-contain drop-shadow-lg"
      onError={() => setFailed(true)}
    />
  );
}

function PitcherHeadshot({
  mlbId,
  name,
  teamAbbreviation,
  size = 52,
}: {
  mlbId: number | null | undefined;
  name: string;
  teamAbbreviation: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = mlbHeadshotUrl(mlbId);
  const colors = getMlbTeamColors(teamAbbreviation);
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (!src || failed) {
    return (
      <div
        className="flex items-center justify-center rounded-full font-bold text-white ring-2 ring-white/20"
        style={{ width: size, height: size, backgroundColor: colors.primary, fontSize: size * 0.3 }}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      className="rounded-full object-cover object-top ring-2 ring-white/20"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-white/10 px-2 py-1 backdrop-blur-sm">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">{label}</span>
      <span className="mt-0.5 text-xs font-bold text-white">{value}</span>
    </div>
  );
}

function OverallEdgeTile({
  detail,
  quickChips,
  spotlight,
}: {
  detail: MlbGameDetail;
  quickChips: Array<{ label: string; tone?: "positive" | "negative" | "neutral" }>;
  spotlight: { eyebrow: string; title: string; note: string; icon: React.ReactNode };
}) {
  void quickChips;

  const cards = getSummaryCards(detail);
  const pitchEdge = cards.find((c) => c.label === "Pitching Edge");
  const lineupEdge = cards.find((c) => c.label === "Lineup Edge");
  const totalLean = cards.find((c) => c.label === "Run Total Lean");

  const edges = [
    { label: "Pitching Edge", value: pitchEdge?.value ?? "Neutral" },
    { label: "Lineup Edge", value: lineupEdge?.value ?? "Neutral" },
    { label: "Total Lean", value: totalLean?.value ?? "Neutral" },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">
            Overall Edge
          </div>
          <div className="mt-1 text-base font-bold text-slate-900">{spotlight.title}</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">{spotlight.note}</p>
        </div>
        <div className="shrink-0 rounded-xl bg-sky-50 p-2 text-sky-700">{spotlight.icon}</div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {edges.map((edge) => {
          const isAway = edge.value.toLowerCase().includes(detail.game.away.abbreviation.toLowerCase());
          const isHome = edge.value.toLowerCase().includes(detail.game.home.abbreviation.toLowerCase());
          const awayColors = getMlbTeamColors(detail.game.away.abbreviation);
          const homeColors = getMlbTeamColors(detail.game.home.abbreviation);
          const bg = isAway ? awayColors.primary : isHome ? homeColors.primary : "#64748b";
          return (
            <div key={edge.label} className="flex flex-col items-center rounded-xl px-2 py-2.5 text-white" style={{ backgroundColor: bg }}>
              <span className="text-[9px] font-semibold uppercase tracking-[0.12em] opacity-80">{edge.label}</span>
              <span className="mt-0.5 text-xs font-bold">{edge.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface MlbMatchupHeroProps {
  detail: MlbGameDetail;
  quickChips: Array<{ label: string; tone?: "positive" | "negative" | "neutral" }>;
  summaryIndicators: Array<{ label: string; value: string; icon: React.ReactNode }>;
  spotlight: { eyebrow: string; title: string; note: string; icon: React.ReactNode };
}

export default function MlbMatchupHero({
  detail,
  quickChips,
  summaryIndicators,
  spotlight,
}: MlbMatchupHeroProps) {
  const { game, starters } = detail;
  const awayColors = getMlbTeamColors(game.away.abbreviation);
  const homeColors = getMlbTeamColors(game.home.abbreviation);

  const awayEra = starters.away.era ? Number(starters.away.era).toFixed(2) : MLB_DASH;
  const homeEra = starters.home.era ? Number(starters.home.era).toFixed(2) : MLB_DASH;
  const awayK9 = computeK9(starters.away.strikeOuts, starters.away.inningsPitched);
  const homeK9 = computeK9(starters.home.strikeOuts, starters.home.inningsPitched);

  const cards = getSummaryCards(detail);
  const pitchEdge = cards.find((c) => c.label === "Pitching Edge")?.value ?? "Neutral";
  const lineupEdge = cards.find((c) => c.label === "Lineup Edge")?.value ?? "Neutral";
  const totalLean = cards.find((c) => c.label === "Run Total Lean")?.value ?? "Neutral";

  return (
    <div
      className="relative overflow-hidden rounded-xl shadow-md"
      style={{ background: `linear-gradient(135deg, ${awayColors.primary}cc 0%, #0f172a 40%, #0f172a 60%, ${homeColors.primary}cc 100%)` }}
    >
      <div className="relative px-4 py-3 space-y-3">
        {/* Venue + weather */}
        <div className="flex items-center justify-between text-[10px] font-medium text-white/50">
          <span>{game.venue}</span>
          {detail.weather && detail.weather !== MLB_DASH && <span>{detail.weather}</span>}
        </div>

        {/* Teams + pitchers row */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {/* Away */}
          <div className="flex items-center gap-2">
            <TeamLogo abbreviation={game.away.abbreviation} size={36} />
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-white">{game.away.abbreviation}</div>
              <div className="text-[10px] text-white/50">{game.away.record}</div>
            </div>
            <div className="flex items-center gap-1.5 ml-2">
              <PitcherHeadshot mlbId={starters.away.id} name={starters.away.name} teamAbbreviation={game.away.abbreviation} size={36} />
              <div className="min-w-0">
                <div className="truncate text-xs font-bold text-white">{starters.away.name}</div>
                <div className="text-[10px] text-white/50">{starters.away.record} · {awayEra} ERA · {awayK9?.toFixed(1) ?? MLB_DASH} K/9</div>
              </div>
            </div>
          </div>

          {/* VS */}
          <div className="flex flex-col items-center gap-1">
            <div className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-white/70">vs</div>
          </div>

          {/* Home */}
          <div className="flex items-center justify-end gap-2">
            <div className="flex items-center gap-1.5 mr-2">
              <div className="min-w-0 text-right">
                <div className="truncate text-xs font-bold text-white">{starters.home.name}</div>
                <div className="text-[10px] text-white/50">{starters.home.record} · {homeEra} ERA · {homeK9?.toFixed(1) ?? MLB_DASH} K/9</div>
              </div>
              <PitcherHeadshot mlbId={starters.home.id} name={starters.home.name} teamAbbreviation={game.home.abbreviation} size={36} />
            </div>
            <div className="min-w-0 text-right">
              <div className="text-sm font-extrabold text-white">{game.home.abbreviation}</div>
              <div className="text-[10px] text-white/50">{game.home.record}</div>
            </div>
            <TeamLogo abbreviation={game.home.abbreviation} size={36} />
          </div>
        </div>

        {/* Edge chips */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Lineup", value: lineupEdge },
            { label: "Pitching", value: pitchEdge },
            { label: "Total", value: totalLean },
          ].map((edge) => {
            const isAway = edge.value.toLowerCase().includes(game.away.abbreviation.toLowerCase());
            const isHome = edge.value.toLowerCase().includes(game.home.abbreviation.toLowerCase());
            const bg = isAway ? awayColors.primary : isHome ? homeColors.primary : "#475569";
            return (
              <div key={edge.label} className="flex flex-col items-center rounded-lg px-2 py-1.5 text-white" style={{ backgroundColor: bg }}>
                <span className="text-[9px] font-bold uppercase tracking-[0.1em] opacity-75">{edge.label}</span>
                <span className="text-[11px] font-extrabold">{edge.value}</span>
              </div>
            );
          })}
        </div>

        {/* Top angle */}
        {spotlight && (
          <div className="rounded-lg border border-white/10 bg-white/8 px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="shrink-0 text-white/60">{spotlight.icon}</div>
              <div className="min-w-0">
                <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/50">{spotlight.eyebrow}</div>
                <div className="text-xs font-bold text-white">{spotlight.title}</div>
                <div className="text-[10px] text-white/60 leading-4">{spotlight.note}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


