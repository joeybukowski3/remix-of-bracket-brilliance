import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  getWsOffensiveEfficiency,
  getWsRushingEfficiency,
  getWsHealthByUnit,
  getWsQbMetricsForTeam,
  WS_PROJECTED_QB_2026,
  type WsOffensiveEfficiencyRanks,
  type WsRushingEfficiency,
  type WsHealthByUnit,
  type WsQbMetrics,
} from "@/data/nflWarrenSharpAdvanced2026";
import type { NflGuideTeam } from "@/lib/nfl/guide2026";

// ── Shared rank display helpers ───────────────────────────────────────────────

function rankBg(rank: number, total = 32): string {
  const pct = rank / total;
  if (pct <= 0.25) return "bg-emerald-600 text-white";
  if (pct <= 0.5)  return "bg-emerald-100 text-emerald-800";
  if (pct <= 0.75) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

function RankBadge({ rank, label }: { rank: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black tabular-nums ${rankBg(rank)}`}>
        {rank}
      </span>
      <span className="text-center text-[9px] font-bold uppercase tracking-wide text-slate-500 leading-tight max-w-[52px]">
        {label}
      </span>
    </div>
  );
}

function MetricRow({ label, value, rank }: { label: string; value?: number; rank: number }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-600">{label}</span>
      <div className="flex items-center gap-2 shrink-0">
        {value !== undefined && (
          <span className="text-xs tabular-nums text-slate-700">{value}</span>
        )}
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-black tabular-nums ${rankBg(rank)}`}>
          #{rank}
        </span>
      </div>
    </div>
  );
}

// ── 1. Offensive Efficiency Panel ─────────────────────────────────────────────

function OffensiveEfficiencyPanel({ data }: { data: WsOffensiveEfficiencyRanks }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
        Team Offensive Efficiency Ranks (p.46) · #1 = best
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
        <RankBadge rank={data.earlyDownSuccessRank} label="Early Down Success" />
        <RankBadge rank={data.explosivePlayRank} label="Explosive Play %" />
        <RankBadge rank={data.thirdDownConvRank} label="3rd Down Conv" />
        <RankBadge rank={data.fourthDownConvRank} label="4th Down Conv" />
        <RankBadge rank={data.edRzPassEpaRank} label="RZ Pass EPA" />
        <RankBadge rank={data.paceRank} label="Pace" />
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-[10px] font-bold text-slate-400 hover:text-slate-600 list-none select-none">
          ▸ all 12 efficiency categories
        </summary>
        <div className="mt-2 space-y-0">
          <MetricRow label="Early Down Success %" rank={data.earlyDownSuccessRank} />
          <MetricRow label="1H Early-Down Pass Rate" rank={data.firstHalfEDPassRateRank} />
          <MetricRow label="Early-Down Q1–3 Pass EPA" rank={data.edQ13PassEpaRank} />
          <MetricRow label="Early-Down Q1–3 Rush EPA" rank={data.edQ13RushEpaRank} />
          <MetricRow label="Red Zone Pass EPA" rank={data.edRzPassEpaRank} />
          <MetricRow label="Red Zone Rush EPA" rank={data.edRzRushEpaRank} />
          <MetricRow label="3rd Down EPA (FG range)" rank={data.thirdDownEpaFgRangeRank} />
          <MetricRow label="Down Set Conv %" rank={data.downSetConvRank} />
          <MetricRow label="Explosive Play %" rank={data.explosivePlayRank} />
          <MetricRow label="3rd Down Conv %" rank={data.thirdDownConvRank} />
          <MetricRow label="4th Down Conv %" rank={data.fourthDownConvRank} />
          <MetricRow label="Offensive Pace" rank={data.paceRank} />
        </div>
      </details>
    </div>
  );
}

// ── 2. Rushing Efficiency Panel ───────────────────────────────────────────────

function RushingEfficiencyPanel({ data }: { data: WsRushingEfficiency }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
        Team Rushing Efficiency (p.45) · #1 = best
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
        <RankBadge rank={data.epaPerPlay.rank} label="EPA/Rush" />
        <RankBadge rank={data.successRate.rank} label="Success Rate" />
        <RankBadge rank={data.ypc.rank} label="YPC" />
        <RankBadge rank={data.ydsAfContact.rank} label="YAC/Rush" />
        <RankBadge rank={data.ydsBfContact.rank} label="Yds Bf Contact" />
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-[10px] font-bold text-slate-400 hover:text-slate-600 list-none select-none">
          ▸ all 9 rushing metrics
        </summary>
        <div className="mt-2 space-y-0">
          <MetricRow label="EPA per rush" value={data.epaPerPlay.value} rank={data.epaPerPlay.rank} />
          <MetricRow label="Success rate" value={Math.round(data.successRate.value * 100 * 10) / 10} rank={data.successRate.rank} />
          <MetricRow label="Early-down success" value={Math.round(data.earlyDownSuccess.value * 100 * 10) / 10} rank={data.earlyDownSuccess.rank} />
          <MetricRow label="Non-QB scramble success" value={Math.round(data.nonQbScrambleSuccess.value * 100 * 10) / 10} rank={data.nonQbScrambleSuccess.rank} />
          <MetricRow label="Yards per carry" value={data.ypc.value} rank={data.ypc.rank} />
          <MetricRow label="Yards before contact" value={data.ydsBfContact.value} rank={data.ydsBfContact.rank} />
          <MetricRow label="Yards after contact" value={data.ydsAfContact.value} rank={data.ydsAfContact.rank} />
          <MetricRow label="EPA/att between tackles" value={data.epaAttBetweenTackles.value} rank={data.epaAttBetweenTackles.rank} />
          <MetricRow label="EPA/att outside tackles" value={data.epaAttOutsideTackles.value} rank={data.epaAttOutsideTackles.rank} />
        </div>
      </details>
    </div>
  );
}

// ── 4. QB Metrics Panel ───────────────────────────────────────────────────────

function QbMetricsPanel({ qbData, qbName }: { qbData: WsQbMetrics; qbName: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
          2025 QB Metrics — {qbName} (pp.42–43) · #1 = best EPA/att
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Stable metrics */}
        <div>
          <div className="mb-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-600">
            Stable Metrics (more predictive)
          </div>
          <div className="space-y-0">
            {qbData.stable.noPressure && <MetricRow label="No pressure" value={qbData.stable.noPressure.value} rank={qbData.stable.noPressure.rank} />}
            {qbData.stable.inPocket && <MetricRow label="In pocket" value={qbData.stable.inPocket.value} rank={qbData.stable.inPocket.rank} />}
            {qbData.stable.noPlayActionEarlyDowns && <MetricRow label="No PA, early downs" value={qbData.stable.noPlayActionEarlyDowns.value} rank={qbData.stable.noPlayActionEarlyDowns.rank} />}
            {qbData.stable.firstDown123Q && <MetricRow label="1st down, Q1–3" value={qbData.stable.firstDown123Q.value} rank={qbData.stable.firstDown123Q.rank} />}
            {qbData.stable.layupThrows && <MetricRow label="Layup throws" value={qbData.stable.layupThrows.value} rank={qbData.stable.layupThrows.rank} />}
            {qbData.stable.lt2p5SecAtt && <MetricRow label="< 2.5s to release" value={qbData.stable.lt2p5SecAtt.value} rank={qbData.stable.lt2p5SecAtt.rank} />}
            {qbData.stable.outsideRedZone && <MetricRow label="Outside red zone" value={qbData.stable.outsideRedZone.value} rank={qbData.stable.outsideRedZone.rank} />}
          </div>
        </div>
        {/* Less stable */}
        <div>
          <div className="mb-1.5 text-[9px] font-black uppercase tracking-wider text-amber-600">
            Less Stable Metrics (contextual)
          </div>
          <div className="space-y-0">
            {qbData.lessStable.underPressure && <MetricRow label="Under pressure" value={qbData.lessStable.underPressure.value} rank={qbData.lessStable.underPressure.rank} />}
            {qbData.lessStable.outsidePocket && <MetricRow label="Outside pocket" value={qbData.lessStable.outsidePocket.value} rank={qbData.lessStable.outsidePocket.rank} />}
            {qbData.lessStable.playAction && <MetricRow label="Play action" value={qbData.lessStable.playAction.value} rank={qbData.lessStable.playAction.rank} />}
            {qbData.lessStable.beingBlitzed && <MetricRow label="Being blitzed" value={qbData.lessStable.beingBlitzed.value} rank={qbData.lessStable.beingBlitzed.rank} />}
            {qbData.lessStable.thirdAndFourthDown && <MetricRow label="3rd & 4th down" value={qbData.lessStable.thirdAndFourthDown.value} rank={qbData.lessStable.thirdAndFourthDown.rank} />}
            {qbData.lessStable.fourthQuarter && <MetricRow label="4th quarter" value={qbData.lessStable.fourthQuarter.value} rank={qbData.lessStable.fourthQuarter.rank} />}
            {qbData.lessStable.insideRedZone && <MetricRow label="Inside red zone" value={qbData.lessStable.insideRedZone.value} rank={qbData.lessStable.insideRedZone.rank} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 6. Health by Unit Panel ───────────────────────────────────────────────────

function HealthPanel({ data }: { data: WsHealthByUnit }) {
  const healthTone = (rank: number) => {
    if (rank <= 8) return "bg-emerald-600 text-white";
    if (rank <= 16) return "bg-emerald-100 text-emerald-800";
    if (rank <= 24) return "bg-amber-100 text-amber-800";
    return "bg-red-100 text-red-800";
  };

  const units = [
    { label: "Overall '25", rank: data.overall2025Rk },
    { label: "Overall '24", rank: data.overall2024Rk },
    { label: "Offense", rank: data.offenseRk },
    { label: "Defense", rank: data.defenseRk },
    { label: "QB", rank: data.qbRk },
    { label: "RB", rank: data.rbRk },
    { label: "WR", rank: data.wrRk },
    { label: "TE", rank: data.teRk },
    { label: "O-Line", rank: data.olineRk },
    { label: "D-Line", rank: data.dlineRk },
    { label: "LB", rank: data.lbRk },
    { label: "DB", rank: data.dbRk },
  ];

  return (
    <div>
      <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
        2025 Health by Unit — FTN Adjusted Games Lost · #1 = healthiest
      </div>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {units.map((u) => (
          <div key={u.label} className="flex flex-col items-center gap-1">
            <span className={`flex h-7 w-full items-center justify-center rounded text-[10px] font-black tabular-nums ${healthTone(u.rank)}`}>
              {u.rank}
            </span>
            <span className="text-center text-[9px] font-bold text-slate-400 leading-tight">
              {u.label}
            </span>
          </div>
        ))}
      </div>
      {data.vsLastYrRk && (
        <div className="mt-1.5 text-[9px] text-slate-400">
          vs prior year rank: <strong>#{data.vsLastYrRk}</strong>{" "}
          {data.vsLastYrRk <= 8 ? "(biggest improvement)" : data.vsLastYrRk >= 25 ? "(biggest decline)" : ""}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NflWarrenSharpAdvancedMetrics({ team }: { team: NflGuideTeam }) {
  const [open, setOpen] = useState(false);

  const offEff = getWsOffensiveEfficiency(team.abbr);
  const rushEff = getWsRushingEfficiency(team.abbr);
  const health = getWsHealthByUnit(team.abbr);
  const qbMetrics = getWsQbMetricsForTeam(team.abbr);
  const qbName = WS_PROJECTED_QB_2026[team.abbr] ?? null;

  if (!offEff && !rushEff && !health) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-white shadow-sm overflow-hidden">
      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 border-b border-amber-200 bg-gradient-to-r from-amber-50 to-white px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        aria-expanded={open}
      >
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">
            Warren Sharp 2026 Football Preview
          </div>
          <div className="mt-0.5 text-base font-black text-slate-900">
            2025 Advanced Efficiency &amp; Health Metrics
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden text-[10px] font-bold text-slate-400 sm:block">
            pp.42–46 + chapter p.3
          </span>
          {open
            ? <ChevronUp className="h-4 w-4 text-amber-600" />
            : <ChevronDown className="h-4 w-4 text-amber-600" />
          }
        </div>
      </button>

      {open && (
        <div className="divide-y divide-slate-100 p-5 space-y-6">
          {/* Offensive efficiency */}
          {offEff && <OffensiveEfficiencyPanel data={offEff} />}

          {/* Rushing efficiency */}
          {rushEff && <RushingEfficiencyPanel data={rushEff} />}

          {/* QB metrics */}
          {qbMetrics && qbName && (
            <div>
              {qbName && WS_PROJECTED_QB_2026[team.abbr] && !qbMetrics && (
                <p className="text-xs text-slate-400 italic">
                  {qbName} did not have qualifying 2025 data in Sharp's QB metrics table.
                </p>
              )}
              <QbMetricsPanel qbData={qbMetrics} qbName={qbName} />
            </div>
          )}
          {!qbMetrics && qbName && (
            <div>
              <div className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
                QB Metrics (pp.42–43)
              </div>
              <p className="text-xs text-slate-400 italic">
                {qbName} did not have qualifying 2025 data in Sharp's QB metrics table (new starter or limited sample).
              </p>
            </div>
          )}

          {/* Health */}
          {health && <HealthPanel data={health} />}

          <p className="text-[10px] leading-4 text-slate-400">
            All metrics reflect 2025 season performance. Presented as context for 2026 projections.
            Health data based on FTN Adjusted Games Lost, as presented in the Warren Sharp 2026 Football Preview.
            Separate from Joe Knows Ball model, VSiN data, and Vegas markets.
          </p>
        </div>
      )}
    </div>
  );
}
