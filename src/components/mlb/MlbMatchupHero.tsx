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

function TeamLogo({ abbreviation, size = 48 }: { abbreviation: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const colors = getMlbTeamColors(abbreviation);
  if (failed) return (
    <div className="flex items-center justify-center rounded-full font-bold text-white drop-shadow"
      style={{ width: size, height: size, backgroundColor: colors.primary, fontSize: size * 0.32 }}>
      {abbreviation.slice(0, 3)}
    </div>
  );
  return (
    <img src={espnTeamLogoUrl(abbreviation)} alt={abbreviation} width={size} height={size}
      className="object-contain drop-shadow" onError={() => setFailed(true)} />
  );
}

function PitcherHeadshot({ mlbId, name, teamAbbreviation, size = 44 }: {
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

  // Responsive logo sizes: mobile 44, tablet 56, desktop 72
  const teamLogoSize = 72;
  const pitcherHeadshotSize = 56;
  
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

  const edgePills = [
    { label: "Lineup",   value: lineupEdge },
    { label: "Pitching", value: pitchEdge },
    { label: "Total",    value: totalLean },
  ];

  return (
    <div className="relative overflow-hidden rounded-xl shadow-md"
      style={{ background: `linear-gradient(135deg, ${awayColors.primary}cc 0%, #0f172a 40%, #0f172a 60%, ${homeColors.primary}cc 100%)` }}>
      <div className="relative px-4 py-3 md:px-5 md:py-4 lg:px-6 lg:py-5 space-y-2 md:space-y-3">

        {/* Venue */}
        <div className="text-center text-[10px] md:text-[11px] font-medium text-white/40">
          {game.venue}{detail.weather && detail.weather !== MLB_DASH ? ` · ${detail.weather}` : ""}
        </div>

        {/* Team row: Away ←→ Home */}
        <div className="flex items-center justify-between gap-2 md:gap-4 lg:gap-6">
          {/* Away */}
          <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
            <div className="shrink-0 hidden sm:block">
              <TeamLogo abbreviation={game.away.abbreviation} size={teamLogoSize} />
            </div>
            <div className="shrink-0 sm:hidden">
              <TeamLogo abbreviation={game.away.abbreviation} size={44} />
            </div>
            <div className="min-w-0">
              <div className="text-lg md:text-xl lg:text-2xl font-extrabold text-white leading-tight">{game.away.abbreviation}</div>
              <div className="text-[9px] md:text-[10px] text-white/50 font-medium">{game.away.record}</div>
            </div>
          </div>

          {/* Center: edge pills on md+, simple VS on mobile */}
          <div className="hidden sm:flex flex-col items-center gap-1 md:gap-1.5 shrink-0 min-w-[96px] md:min-w-[120px] lg:min-w-[140px]">
            {edgePills.map((e) => (
              <div key={e.label} className="w-full flex flex-col items-center rounded-lg px-2 md:px-3 py-1 md:py-1.5 text-white" style={{ backgroundColor: edgeBg(e.value) }}>
                <span className="text-[7px] md:text-[8px] lg:text-[9px] font-bold uppercase tracking-[0.1em] opacity-70">{e.label}</span>
                <span className="text-[10px] md:text-[11px] lg:text-[12px] font-extrabold leading-tight">{e.value}</span>
              </div>
            ))}
          </div>

          {/* Mobile: simple VS badge */}
          <div className="sm:hidden rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/60 shrink-0">vs</div>

          {/* Home */}
          <div className="flex items-center justify-end gap-2 md:gap-3 min-w-0 flex-1">
            <div className="min-w-0 text-right">
              <div className="text-lg md:text-xl lg:text-2xl font-extrabold text-white leading-tight">{game.home.abbreviation}</div>
              <div className="text-[9px] md:text-[10px] text-white/50 font-medium">{game.home.record}</div>
            </div>
            <div className="shrink-0 hidden sm:block">
              <TeamLogo abbreviation={game.home.abbreviation} size={teamLogoSize} />
            </div>
            <div className="shrink-0 sm:hidden">
              <TeamLogo abbreviation={game.home.abbreviation} size={44} />
            </div>
          </div>
        </div>

        {/* Pitcher row */}
        <div className="grid grid-cols-2 gap-2 md:gap-3 lg:gap-4 border-t border-white/10 pt-2 md:pt-3 lg:pt-4">
          {/* Away pitcher */}
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div className="shrink-0 hidden sm:block">
              <PitcherHeadshot mlbId={starters.away.id} name={starters.away.name} teamAbbreviation={game.away.abbreviation} size={pitcherHeadshotSize} />
            </div>
            <div className="shrink-0 sm:hidden">
              <PitcherHeadshot mlbId={starters.away.id} name={starters.away.name} teamAbbreviation={game.away.abbreviation} size={40} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[12px] md:text-[13px] lg:text-[14px] font-bold text-white">{starters.away.name}</div>
              <div className="text-[9px] md:text-[10px] text-white/50 font-medium">{starters.away.record} · {awayEra} ERA</div>
              <div className="text-[9px] md:text-[10px] text-white/40 font-medium">{awayK9?.toFixed(1) ?? MLB_DASH} K/9</div>
            </div>
          </div>
          {/* Home pitcher */}
          <div className="flex items-center justify-end gap-2 md:gap-3 min-w-0">
            <div className="min-w-0 text-right">
              <div className="truncate text-[12px] md:text-[13px] lg:text-[14px] font-bold text-white">{starters.home.name}</div>
              <div className="text-[9px] md:text-[10px] text-white/50 font-medium">{starters.home.record} · {homeEra} ERA</div>
              <div className="text-[9px] md:text-[10px] text-white/40 font-medium">{homeK9?.toFixed(1) ?? MLB_DASH} K/9</div>
            </div>
            <div className="shrink-0 hidden sm:block">
              <PitcherHeadshot mlbId={starters.home.id} name={starters.home.name} teamAbbreviation={game.home.abbreviation} size={pitcherHeadshotSize} />
            </div>
            <div className="shrink-0 sm:hidden">
              <PitcherHeadshot mlbId={starters.home.id} name={starters.home.name} teamAbbreviation={game.home.abbreviation} size={40} />
            </div>
          </div>
        </div>

        {/* Mobile-only edge pills (shown below pitchers on small screens) */}
        <div className="grid grid-cols-3 gap-1.5 sm:hidden">
          {edgePills.map((e) => (
            <div key={e.label} className="flex flex-col items-center rounded-lg px-2 py-1.5 text-white" style={{ backgroundColor: edgeBg(e.value) }}>
              <span className="text-[8px] font-bold uppercase tracking-[0.1em] opacity-70">{e.label}</span>
              <span className="text-[10px] font-extrabold leading-tight">{e.value}</span>
            </div>
          ))}
        </div>

        {/* Spotlight angle */}
        {spotlight && (
          <div className="rounded-lg border border-white/10 bg-white/8 px-3 md:px-4 py-2 md:py-3">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0 text-white/60">{spotlight.icon}</div>
              <div className="min-w-0">
                <div className="text-[8px] md:text-[9px] font-bold uppercase tracking-[0.1em] text-white/50">{spotlight.eyebrow}</div>
                <div className="text-xs md:text-sm font-bold text-white">{spotlight.title}</div>
                <div className="text-[10px] md:text-[11px] leading-4 text-white/60">{spotlight.note}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
