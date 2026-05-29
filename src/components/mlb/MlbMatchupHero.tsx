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

function TeamLogo({ abbreviation, size = 64 }: { abbreviation: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const colors = getMlbTeamColors(abbreviation);
  if (failed) return (
    <div className="flex items-center justify-center rounded-full font-bold text-white drop-shadow-lg"
      style={{ width: size, height: size, backgroundColor: colors.primary, fontSize: size * 0.32 }}>
      {abbreviation.slice(0, 3)}
    </div>
  );
  return (
    <img src={espnTeamLogoUrl(abbreviation)} alt={abbreviation} width={size} height={size}
      className="object-contain drop-shadow-lg" onError={() => setFailed(true)} />
  );
}

function PitcherHeadshot({ mlbId, name, teamAbbreviation, size = 64 }: {
  mlbId: number | null | undefined; name: string; teamAbbreviation: string; size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = mlbHeadshotUrl(mlbId);
  const colors = getMlbTeamColors(teamAbbreviation);
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  if (!src || failed) return (
    <div className="flex items-center justify-center rounded-full font-bold text-white ring-2 ring-white/20"
      style={{ width: size, height: size, backgroundColor: colors.primary, fontSize: size * 0.3 }}>
      {initials}
    </div>
  );
  return (
    <img src={src} alt={name} width={size} height={size}
      className="rounded-full object-cover object-top ring-2 ring-white/20"
      style={{ width: size, height: size }} onError={() => setFailed(true)} />
  );
}

interface MlbMatchupHeroProps {
  detail: MlbGameDetail;
  quickChips: Array<{ label: string; tone?: "positive" | "negative" | "neutral" }>;
  summaryIndicators: Array<{ label: string; value: string; icon: React.ReactNode }>;
  spotlight: { eyebrow: string; title: string; note: string; icon: React.ReactNode };
}

export default function MlbMatchupHero({ detail, spotlight }: MlbMatchupHeroProps) {
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

  const edgeBg = (val: string) => {
    const low = val.toLowerCase();
    if (low.includes(game.away.abbreviation.toLowerCase())) return awayColors.primary;
    if (low.includes(game.home.abbreviation.toLowerCase())) return homeColors.primary;
    return "#475569";
  };

  return (
    <div className="relative overflow-hidden rounded-xl shadow-md"
      style={{ background: `linear-gradient(135deg, ${awayColors.primary}cc 0%, #0f172a 40%, #0f172a 60%, ${homeColors.primary}cc 100%)` }}>
      <div className="relative px-4 py-4">

        {/* Venue */}
        <div className="mb-3 text-center text-[10px] font-medium text-white/40">
          {game.venue}{detail.weather && detail.weather !== MLB_DASH ? ` · ${detail.weather}` : ""}
        </div>

        {/* Main 3-column hero layout */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">

          {/* Away side */}
          <div className="flex items-center gap-3">
            <TeamLogo abbreviation={game.away.abbreviation} size={56} />
            <PitcherHeadshot mlbId={starters.away.id} name={starters.away.name} teamAbbreviation={game.away.abbreviation} size={52} />
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">{game.away.abbreviation} · {game.away.record}</div>
              <div className="mt-0.5 text-sm font-extrabold leading-tight text-white">{starters.away.name}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/80">{starters.away.record}</span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/80">{awayEra} ERA</span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/80">{awayK9?.toFixed(1) ?? MLB_DASH} K/9</span>
              </div>
            </div>
          </div>

          {/* Center — edge pills */}
          <div className="flex flex-col items-center gap-1.5 min-w-[100px]">
            <div className="rounded-full border border-white/20 bg-white/10 px-3 py-0.5 text-[10px] font-bold uppercase text-white/50 mb-1">vs</div>
            {[
              { label: "Lineup", value: lineupEdge },
              { label: "Pitching", value: pitchEdge },
              { label: "Total", value: totalLean },
            ].map((edge) => (
              <div key={edge.label} className="w-full flex flex-col items-center rounded-lg px-3 py-1.5 text-white" style={{ backgroundColor: edgeBg(edge.value) }}>
                <span className="text-[9px] font-bold uppercase tracking-[0.1em] opacity-70">{edge.label}</span>
                <span className="text-[11px] font-extrabold leading-tight">{edge.value}</span>
              </div>
            ))}
          </div>

          {/* Home side */}
          <div className="flex items-center justify-end gap-3">
            <div className="min-w-0 text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">{game.home.abbreviation} · {game.home.record}</div>
              <div className="mt-0.5 text-sm font-extrabold leading-tight text-white">{starters.home.name}</div>
              <div className="mt-1 flex flex-wrap justify-end gap-1">
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/80">{starters.home.record}</span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/80">{homeEra} ERA</span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/80">{homeK9?.toFixed(1) ?? MLB_DASH} K/9</span>
              </div>
            </div>
            <PitcherHeadshot mlbId={starters.home.id} name={starters.home.name} teamAbbreviation={game.home.abbreviation} size={52} />
            <TeamLogo abbreviation={game.home.abbreviation} size={56} />
          </div>
        </div>

        {/* Top angle spotlight */}
        {spotlight && (
          <div className="mt-3 rounded-lg border border-white/10 bg-white/8 px-3 py-2">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0 text-white/60">{spotlight.icon}</div>
              <div className="min-w-0">
                <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/50">{spotlight.eyebrow}</div>
                <div className="text-xs font-bold text-white">{spotlight.title}</div>
                <div className="text-[10px] leading-4 text-white/60">{spotlight.note}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
