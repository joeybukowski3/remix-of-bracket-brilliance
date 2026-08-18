import { useMemo, useState } from "react";
import type { HrDashboardBatter } from "@/pages/MlbHrProps";
import type { DailyProfile } from "@/types/mlbNumerology";
import { panel, type NumerologyCardPlayer } from "./NumerologyAuditCard";
import { ExplorerFilters } from "./ExplorerFilters";
import {
  ExplorerTable,
  compareRowsByRankingMode,
  matchHrBatter,
  type ExplorerRankingMode,
  type ExplorerRow,
} from "./ExplorerTable";
import {
  calculateNumerologyScoreBreakdown,
  defaultFieldInclusion,
  defaultSignalTypeInclusion,
  type FieldInclusion,
  type PlayerIdentity,
  type SignalTypeInclusion,
} from "@/lib/numerology/mlbScoreAudit";
import {
  defaultSinCityFields,
  defaultSinCitySignalTypes,
  type SinCityFieldInclusion,
  type SinCitySignalTypeInclusion,
} from "@/lib/numerology/sinCityMasonic";

export type { ExplorerRankingMode };

export function filterExplorerRows(
  rows: ExplorerRow[],
  options: {
    query?: string;
    team?: string;
    matchType?: string;
  },
): ExplorerRow[] {
  const query = options.query ?? "";
  const team = options.team ?? "all";
  const matchType = options.matchType ?? "all";

  return rows.filter((p) => {
    if (team !== "all" && p.team !== team) return false;
    if (matchType !== "all" && p.matchType !== matchType) return false;
    if (query && !`${p.playerName} ${p.team} ${p.opponent}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });
}

export function NumerologyExplorer({
  exact,
  root,
  hrBatters,
  identities = {},
  dailyProfile,
  slateDate,
  weights,
}: {
  exact: NumerologyCardPlayer[];
  root: NumerologyCardPlayer[];
  hrBatters?: HrDashboardBatter[];
  identities?: Record<string, PlayerIdentity>;
  dailyProfile?: DailyProfile | null;
  slateDate?: string | null;
  weights?: Record<string, number>;
}) {
  const [rankingMode, setRankingMode] = useState<ExplorerRankingMode>("sinCity");
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("all");
  const [matchType, setMatchType] = useState("all");
  const [includedFields, setIncludedFields] = useState<FieldInclusion>(defaultFieldInclusion);
  const [includedTypes, setIncludedTypes] = useState<SignalTypeInclusion>(defaultSignalTypeInclusion);
  const [sinCityFields, setSinCityFields] = useState<SinCityFieldInclusion>(defaultSinCityFields);
  const [sinCityTypes, setSinCityTypes] = useState<SinCitySignalTypeInclusion>(defaultSinCitySignalTypes);

  const rows = useMemo<ExplorerRow[]>(
    () => [
      ...exact.map((p) => ({ ...p, matchType: "Exact Match" as const })),
      ...root.map((p) => ({ ...p, matchType: "Root Match" as const })),
    ],
    [exact, root],
  );

  const teams = [...new Set(rows.map((p) => p.team))].sort();
  const batters = useMemo(() => hrBatters ?? [], [hrBatters]);

  const scored = useMemo(() => {
    return rows.map((player) => {
      if (!dailyProfile || !slateDate) return player;
      const identity = identities[`${player.playerName}|${player.team}`] ?? {
        jerseyNumber: player.jerseyNumber ?? null,
      };
      const hrBatter = matchHrBatter(player, batters);
      try {
        const scoreBreakdown = calculateNumerologyScoreBreakdown(
          player,
          identity,
          dailyProfile,
          slateDate,
          weights,
          {
            includedFields,
            includedSignalTypes: includedTypes,
            sinCity: {
              included: true,
              fields: sinCityFields,
              includedSignalTypes: sinCityTypes,
              currentHrCount: hrBatter?.seasonHomeRuns ?? null,
            },
          },
        );
        return {
          ...player,
          numerologyScore: scoreBreakdown.calculatedScore,
          scoreBreakdown,
        };
      } catch (reason) {
        console.error("[mlb-numerology] explorer rescore failed", player.playerName, reason);
        return player;
      }
    });
  }, [rows, dailyProfile, slateDate, identities, batters, weights, includedFields, includedTypes, sinCityFields, sinCityTypes]);

  const filtered = filterExplorerRows(scored, {
    query,
    team,
    matchType,
  }).sort((a, b) => compareRowsByRankingMode(a, b, rankingMode));

  return (
    <section id="explorer" className="mb-4 scroll-mt-20 overflow-x-hidden">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-[#e9c349]">Player Explorer</span>
        <span className="text-xs text-[#958ea0]">
          {rankingMode === "sinCity"
            ? "Sin City Score ranks this view. Base Numerology stays independent."
            : "Numerology Score ranks this view. Sin City stays independent."}
        </span>
      </div>
      <div className={`${panel} overflow-hidden`}>
        <div className="border-b border-[#494454] bg-[#14161f] px-3 pt-3 sm:px-4">
          <div role="tablist" aria-label="Ranking view" className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              role="tab"
              aria-selected={rankingMode === "sinCity"}
              onClick={() => setRankingMode("sinCity")}
              className={`min-h-11 rounded-lg px-3 py-2 text-sm font-bold transition ${
                rankingMode === "sinCity"
                  ? "bg-[#e9c349] text-[#342800] shadow-sm"
                  : "border border-[#494454] bg-[#1d1f28] text-[#cbc3d7]"
              }`}
            >
              Sin City
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={rankingMode === "numerology"}
              onClick={() => setRankingMode("numerology")}
              className={`min-h-11 rounded-lg px-3 py-2 text-sm font-bold transition ${
                rankingMode === "numerology"
                  ? "bg-[#a078ff] text-[#26005d] shadow-sm"
                  : "border border-[#494454] bg-[#1d1f28] text-[#cbc3d7]"
              }`}
            >
              Numerology
            </button>
          </div>
          <p className="py-2 text-[11px] text-[#958ea0]">
            {rankingMode === "sinCity" ? "Sin City Score ↓" : "Numerology Score ↓"}
          </p>
        </div>
        <ExplorerFilters
          query={query}
          setQuery={setQuery}
          team={team}
          setTeam={setTeam}
          teams={teams}
          matchType={matchType}
          setMatchType={setMatchType}
          rankingMode={rankingMode}
          includedFields={includedFields}
          setIncludedFields={setIncludedFields}
          includedTypes={includedTypes}
          setIncludedTypes={setIncludedTypes}
          sinCityFields={sinCityFields}
          setSinCityFields={setSinCityFields}
          sinCityTypes={sinCityTypes}
          setSinCityTypes={setSinCityTypes}
        />
        <p className="px-4 py-2 text-xs text-[#958ea0]">Showing {filtered.length} players</p>
        <ExplorerTable rows={filtered} hrBatters={batters} rankingMode={rankingMode} />
      </div>
    </section>
  );
}
