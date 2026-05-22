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
  size = 80,
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
    <div className="flex flex-col items-center rounded-xl bg-white/10 px-3 py-2 backdrop-blur-sm">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">{label}</span>
      <span className="mt-0.5 text-sm font-bold text-white">{value}</span>
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">
            Overall Edge
          </div>
          <div className="mt-1 text-base font-bold text-slate-900">{spotlight.title}</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">{spotlight.note}</p>
        </div>
        <div className="shrink-0 rounded-xl bg-sky-50 p-2 text-sky-700">{spotlight.icon}</div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
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
  const { game, starters, weather } = detail;
  const awayColors = getMlbTeamColors(game.away.abbreviation);
  const homeColors = getMlbTeamColors(game.home.abbreviation);

  const awayEra = starters.away.era ? Number(starters.away.era).toFixed(2) : MLB_DASH;
  const homeEra = starters.home.era ? Number(starters.home.era).toFixed(2) : MLB_DASH;
  const awayWhip = starters.away.whip ? Number(starters.away.whip).toFixed(2) : MLB_DASH;
  const homeWhip = starters.home.whip ? Number(starters.home.whip).toFixed(2) : MLB_DASH;
  const awayK9 = computeK9(starters.away.strikeOuts, starters.away.inningsPitched);
  const homeK9 = computeK9(starters.home.strikeOuts, starters.home.inningsPitched);

  return (
    <div className="space-y-4">
      <div
        className="relative overflow-hidden rounded-[28px] shadow-xl"
        style={{
          background: `linear-gradient(135deg, ${awayColors.primary}cc 0%, #0f172a 40%, #0f172a 60%, ${homeColors.primary}cc 100%)`,
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            backgroundSize: "200px 200px",
          }}
        />

        <div className="relative px-6 py-8 sm:px-8 sm:py-10">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-white/60">
            <span>{game.venue}</span>
            {weather && weather !== MLB_DASH && <span>{weather}</span>}
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="flex flex-col items-center gap-3 text-center">
              <TeamLogo abbreviation={game.away.abbreviation} size={72} />
              <div>
                <div className="text-2xl font-extrabold uppercase tracking-wide text-white sm:text-3xl">
                  {game.away.name}
                </div>
                <div className="mt-0.5 text-xs font-medium text-white/50">
                  {game.away.abbreviation} · {game.away.record}
                </div>
              </div>

              <div className="mt-1 flex flex-col items-center gap-2">
                <PitcherHeadshot
                  mlbId={starters.away.id}
                  name={starters.away.name}
                  teamAbbreviation={game.away.abbreviation}
                  size={64}
                />
                <div className="text-center">
                  <div className="text-sm font-bold text-white">{starters.away.name}</div>
                  <div className="text-[11px] text-white/50">
                    {starters.away.hand} · {starters.away.record}
                  </div>
                </div>
                <div className="flex gap-2">
                  <StatPill label="ERA" value={awayEra} />
                  <StatPill label="WHIP" value={awayWhip} />
                  <StatPill label="K/9" value={awayK9 ? awayK9.toFixed(1) : MLB_DASH} />
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 text-center">
              <div className="rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-white/70 backdrop-blur-sm">
                vs
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 backdrop-blur-sm">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
                  Game Total
                </div>
                <div className="mt-0.5 text-lg font-extrabold text-white">
                  {quickChips.find((c) => c.label?.toLowerCase().includes("neutral total") || c.label?.toLowerCase().includes("over") || c.label?.toLowerCase().includes("under"))?.label ?? "—"}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 text-center">
              <TeamLogo abbreviation={game.home.abbreviation} size={72} />
              <div>
                <div className="text-2xl font-extrabold uppercase tracking-wide text-white sm:text-3xl">
                  {game.home.name}
                </div>
                <div className="mt-0.5 text-xs font-medium text-white/50">
                  {game.home.abbreviation} · {game.home.record}
                </div>
              </div>

              <div className="mt-1 flex flex-col items-center gap-2">
                <PitcherHeadshot
                  mlbId={starters.home.id}
                  name={starters.home.name}
                  teamAbbreviation={game.home.abbreviation}
                  size={64}
                />
                <div className="text-center">
                  <div className="text-sm font-bold text-white">{starters.home.name}</div>
                  <div className="text-[11px] text-white/50">
                    {starters.home.hand} · {starters.home.record}
                  </div>
                </div>
                <div className="flex gap-2">
                  <StatPill label="ERA" value={homeEra} />
                  <StatPill label="WHIP" value={homeWhip} />
                  <StatPill label="K/9" value={homeK9 ? homeK9.toFixed(1) : MLB_DASH} />
                </div>
              </div>
            </div>
          </div>

          {quickChips.length > 0 && (
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {quickChips.map((chip, i) => (
                <span
                  key={i}
                  className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 backdrop-blur-sm"
                >
                  {chip.label}
                </span>
              ))}
            </div>
          )}

          {summaryIndicators.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {summaryIndicators.map((ind, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/8 p-3 backdrop-blur-sm"
                >
                  <div className="mt-0.5 shrink-0 text-white/60">{ind.icon}</div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">
                      {ind.label}
                    </div>
                    <div className="mt-0.5 truncate text-xs font-bold text-white">{ind.value}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <OverallEdgeTile detail={detail} quickChips={quickChips} spotlight={spotlight} />
    </div>
  );
}
