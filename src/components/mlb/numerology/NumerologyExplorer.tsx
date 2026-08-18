import { useMemo, useState } from "react";
import type { HrDashboardBatter } from "@/pages/MlbHrProps";
import type { DailyProfile } from "@/types/mlbNumerology";
import { panel, type NumerologyCardPlayer } from "./NumerologyAuditCard";
import { ExplorerFilters } from "./ExplorerFilters";
import { ExplorerTable, compareRowsByNumerologyScore, matchHrBatter, type ExplorerRow } from "./ExplorerTable";
import {
  calculateNumerologyScoreBreakdown,
  defaultFieldInclusion,
  defaultSignalTypeInclusion,
  type FieldInclusion,
  type PlayerIdentity,
  type SignalTypeInclusion,
} from "@/lib/numerology/mlbScoreAudit";
import { defaultSinCityFields, type SinCityFieldInclusion } from "@/lib/numerology/sinCityMasonic";

export type SinCityListScope = "all" | "hasMatch";

export function filterExplorerRows(
  rows: ExplorerRow[],
  options: {
    query?: string;
    team?: string;
    matchType?: string;
    sinCityIncluded?: boolean;
    sinCityListScope?: SinCityListScope;
  },
): ExplorerRow[] {
  const query = options.query ?? "";
  const team = options.team ?? "all";
  const matchType = options.matchType ?? "all";
  const sinCityIncluded = options.sinCityIncluded !== false;
  const sinCityListScope = options.sinCityListScope ?? "all";

  return rows.filter((p) => {
    if (team !== "all" && p.team !== team) return false;
    if (matchType !== "all" && p.matchType !== matchType) return false;
    if (query && !`${p.playerName} ${p.team} ${p.opponent}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (sinCityIncluded && sinCityListScope === "hasMatch") {
      return (p.scoreBreakdown?.sinCity?.matchCount ?? 0) >= 1;
    }
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
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("all");
  const [matchType, setMatchType] = useState("all");
  const [includedFields, setIncludedFields] = useState<FieldInclusion>(defaultFieldInclusion);
  const [includedTypes, setIncludedTypes] = useState<SignalTypeInclusion>(defaultSignalTypeInclusion);
  const [sinCityIncluded, setSinCityIncluded] = useState(true);
  const [sinCityFields, setSinCityFields] = useState<SinCityFieldInclusion>(defaultSinCityFields);
  const [sinCityListScope, setSinCityListScope] = useState<SinCityListScope>("all");

  const handleSinCityIncluded = (next: boolean) => {
    setSinCityIncluded(next);
    if (!next) setSinCityListScope("all");
  };

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
              included: sinCityIncluded,
              fields: sinCityFields,
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
  }, [rows, dailyProfile, slateDate, identities, batters, weights, includedFields, includedTypes, sinCityIncluded, sinCityFields]);

  const filtered = filterExplorerRows(scored, {
    query,
    team,
    matchType,
    sinCityIncluded,
    sinCityListScope,
  }).sort(compareRowsByNumerologyScore);

  return (
    <section id="explorer" className="mb-4 scroll-mt-20 overflow-x-hidden">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-[#e9c349]">Player Explorer</span>
        <span className="text-xs text-[#958ea0]">Always ranked by Numerology Score. Expand any row for the full scoring audit.</span>
      </div>
      <div className={`${panel} overflow-hidden`}>
        <ExplorerFilters
          query={query}
          setQuery={setQuery}
          team={team}
          setTeam={setTeam}
          teams={teams}
          matchType={matchType}
          setMatchType={setMatchType}
          includedFields={includedFields}
          setIncludedFields={setIncludedFields}
          includedTypes={includedTypes}
          setIncludedTypes={setIncludedTypes}
          sinCityIncluded={sinCityIncluded}
          setSinCityIncluded={handleSinCityIncluded}
          sinCityFields={sinCityFields}
          setSinCityFields={setSinCityFields}
          sinCityListScope={sinCityListScope}
          setSinCityListScope={setSinCityListScope}
        />
        <p className="px-4 py-2 text-xs text-[#958ea0]">Showing {filtered.length} players</p>
        <ExplorerTable rows={filtered} hrBatters={batters} />
      </div>
    </section>
  );
}
