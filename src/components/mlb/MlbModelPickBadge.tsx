import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import { computeModelEdge } from "@/lib/mlb/mlbModelEdge";
import type { MlbGameDetail } from "@/lib/mlb/mlbTypes";

const ESPN_ABBR: Record<string, string> = {
  AZ:"ari",ATH:"oak",WSH:"wsh",CWS:"chw",KCR:"kc",SDP:"sd",SFG:"sf",TBR:"tb",
  NYY:"nyy",NYM:"nym",LAD:"lad",LAA:"laa",BOS:"bos",CHC:"chc",CIN:"cin",
  CLE:"cle",COL:"col",DET:"det",HOU:"hou",MIA:"mia",MIL:"mil",MIN:"min",
  PHI:"phi",PIT:"pit",SEA:"sea",STL:"stl",TEX:"tex",TOR:"tor",ATL:"atl",BAL:"bal",
};
const logoUrl = (abbr: string) =>
  `https://a.espncdn.com/i/teamlogos/mlb/500/${ESPN_ABBR[abbr] ?? abbr.toLowerCase()}.png`;

function FactorBar({ label, awayScore, homeScore, weight, awayColor, homeColor, awayAbbr, homeAbbr }: {
  label: string; awayScore: number; homeScore: number; weight: number;
  awayColor: string; homeColor: string; awayAbbr: string; homeAbbr: string;
}) {
  const total = awayScore + homeScore;
  const awayPct = total === 0 ? 50 : Math.round((awayScore / total) * 100);
  const homePct = 100 - awayPct;
  const leader = awayScore >= homeScore ? awayAbbr : homeAbbr;
  const leaderColor = awayScore >= homeScore ? awayColor : homeColor;
  const diff = Math.abs(awayScore - homeScore);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-semibold text-white/70">{label}</span>
        <div className="flex items-center gap-1">
          <span className="font-bold" style={{ color: leaderColor }}>{leader}</span>
          <span className="text-white/30">+{diff}</span>
          <span className="text-white/30">·</span>
          <span className="text-white/30">{Math.round(weight * 100)}% wt</span>
        </div>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-l-full transition-all" style={{ width: `${awayPct}%`, backgroundColor: awayColor }} />
        <div className="h-full rounded-r-full transition-all" style={{ width: `${homePct}%`, backgroundColor: homeColor }} />
      </div>
      <div className="flex justify-between text-[9px] text-white/30">
        <span>{awayAbbr} {awayPct}%</span>
        <span>{homePct}% {homeAbbr}</span>
      </div>
    </div>
  );
}

export default function MlbModelPickBadge({ detail }: { detail: MlbGameDetail }) {
  const result = computeModelEdge(detail);
  const awayColors = getMlbTeamColors(result.awayAbbr);
  const homeColors = getMlbTeamColors(result.homeAbbr);

  const isPush = result.pick === "push";
  const pickColors = result.pick === "away" ? awayColors : result.pick === "home" ? homeColors : null;
  const oppColors  = result.pick === "away" ? homeColors : result.pick === "home" ? awayColors : null;
  const pickAbbr   = result.pick === "away" ? result.awayAbbr : result.pick === "home" ? result.homeAbbr : "";
  const oppAbbr    = result.pick === "away" ? result.homeAbbr : result.pick === "home" ? result.awayAbbr : "";

  const confidenceLabel =
    result.confidence >= 72 ? "Strong lean" :
    result.confidence >= 64 ? "Moderate lean" :
    result.confidence >= 56 ? "Slight lean" : "Coin flip";

  return (
    <div
      className="overflow-hidden rounded-xl shadow-lg"
      style={{
        background: `linear-gradient(135deg, ${awayColors.primary}22 0%, #0b1220 30%, #0b1220 70%, ${homeColors.primary}22 100%)`,
        border: `1px solid ${isPush ? "#ffffff18" : `${pickColors?.primary}40`}`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-white/10 text-[11px]">🤖</span>
          <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/80">Model Edge</span>
        </div>
        <span className="text-[9px] text-white/30 italic">For entertainment only · not betting advice</span>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-[1fr_1px_1fr]">

        {/* Left: pick display */}
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          {isPush ? (
            <div className="space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-widest text-white/40">No Clear Edge</div>
              <div className="text-3xl font-extrabold text-white/70">—</div>
              <div className="text-[11px] text-white/40">{result.summary}</div>
            </div>
          ) : (
            <>
              {/* Team logo + vs */}
              <div className="flex items-center gap-2">
                <img src={logoUrl(pickAbbr)} alt={pickAbbr} className="h-10 w-10 object-contain drop-shadow" />
                <div className="flex flex-col items-start">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-white/40">{confidenceLabel}</div>
                  <div className="text-xl font-extrabold leading-tight text-white">{pickAbbr}</div>
                  <div className="text-[10px] text-white/40">over {oppAbbr}</div>
                </div>
              </div>

              {/* Confidence meter */}
              <div className="w-full space-y-1">
                <div className="flex justify-between text-[9px] text-white/40">
                  <span>50%</span>
                  <span className="font-bold" style={{ color: pickColors?.primary }}>{result.confidence}%</span>
                  <span>82%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${((result.confidence - 50) / 32) * 100}%`,
                      background: `linear-gradient(90deg, ${pickColors?.primary}88, ${pickColors?.primary})`,
                    }}
                  />
                </div>
                <div className="text-[10px] text-white/50 text-center">
                  Model confidence · {result.topFactor}
                </div>
              </div>

              {/* Score badges */}
              <div className="flex gap-3">
                <div className="flex flex-col items-center rounded-lg px-3 py-1.5" style={{ backgroundColor: `${pickColors?.primary}25`, border: `1px solid ${pickColors?.primary}40` }}>
                  <span className="text-[8px] uppercase tracking-wide text-white/40">{pickAbbr} score</span>
                  <span className="text-base font-extrabold" style={{ color: pickColors?.primary }}>
                    {result.pick === "away" ? result.factors.reduce((s, f) => s + f.awayScore * f.weight, 0).toFixed(0) : result.factors.reduce((s, f) => s + f.homeScore * f.weight, 0).toFixed(0)}
                  </span>
                </div>
                <div className="flex items-center text-white/20 text-sm font-bold">vs</div>
                <div className="flex flex-col items-center rounded-lg px-3 py-1.5 bg-white/5 border border-white/10">
                  <span className="text-[8px] uppercase tracking-wide text-white/40">{oppAbbr} score</span>
                  <span className="text-base font-extrabold text-white/50">
                    {result.pick === "away" ? result.factors.reduce((s, f) => s + f.homeScore * f.weight, 0).toFixed(0) : result.factors.reduce((s, f) => s + f.awayScore * f.weight, 0).toFixed(0)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px bg-white/8" />

        {/* Right: factor breakdown */}
        <div className="space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">Factor Breakdown</div>
          {result.factors.map((f) => (
            <FactorBar
              key={f.label}
              label={f.label}
              awayScore={f.awayScore}
              homeScore={f.homeScore}
              weight={f.weight}
              awayColor={awayColors.primary}
              homeColor={homeColors.primary}
              awayAbbr={result.awayAbbr}
              homeAbbr={result.homeAbbr}
            />
          ))}
          <p className="pt-1 text-[10px] italic leading-5 text-white/30">{result.summary}</p>
        </div>
      </div>
    </div>
  );
}
