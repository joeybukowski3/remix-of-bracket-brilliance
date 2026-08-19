import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cap } from "./NumerologyAuditCard";
import {
  DEFAULT_INCLUDED_FIELDS,
  DEFAULT_INCLUDED_SIGNAL_TYPES,
  type FieldInclusion,
  type NumerologyScoringField,
  type NumerologySignalTypeKey,
  type SignalTypeInclusion,
} from "@/lib/numerology/mlbScoreAudit";
import {
  DEFAULT_SIN_CITY_FIELDS,
  DEFAULT_SIN_CITY_SIGNAL_TYPES,
  type SinCityFieldInclusion,
  type SinCityFieldKey,
  type SinCitySignalTypeInclusion,
  type SinCitySignalTypeKey,
} from "@/lib/numerology/sinCityMasonic";
import type { ExplorerRankingMode } from "./ExplorerTable";

const FIELDS: Array<[NumerologyScoringField, string]> = [
  ["personalDay", "Personal Day"],
  ["jersey", "Jersey"],
  ["battingOrder", "Batting Order"],
  ["lifePath", "Life Path"],
  ["birthDay", "Birth Day"],
  ["expression", "Expression"],
  ["repeatedDigit", "Repeated Digit"],
];

const TYPES: Array<[NumerologySignalTypeKey, string]> = [
  ["exact", "Exact"],
  ["root", "Root"],
  ["family", "Family Support"],
  ["context", "Contextual Echo"],
  ["countercurrent", "Countercurrent"],
];

const SIN_CITY_FIELDS: Array<[SinCityFieldKey, string]> = [
  ["jersey", "Jersey #"],
  ["battingOrder", "Lineup Spot / Batting Order"],
  ["birthDay", "Birthday"],
  ["lifePath", "Life Path"],
  ["currentHrCount", "Current HR Count"],
];

const SIN_CITY_TYPES: Array<[SinCitySignalTypeKey, string]> = [
  ["exact", "Exact"],
  ["root", "Root"],
  ["family", "Family Support"],
];

const includeChip = (on: boolean) =>
  `rounded-full border px-2 py-1 text-[10px] font-semibold ${on ? "border-[#a078ff] bg-[#a078ff] text-[#26005d]" : "border-[#494454] text-[#cbc3d7]"}`;

function IncludeExclude({
  label,
  included,
  onChange,
  disabled = false,
  name,
}: {
  label: string;
  included: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  name: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded-lg border border-[#2a304d] bg-[#10131f] px-2 py-1.5">
      <span className="min-w-0 break-words text-[11px] font-semibold text-[#e2e1ee]">{label}</span>
      <span className="ml-auto flex shrink-0 gap-1">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={included}
          aria-label={`${name} Include`}
          onClick={() => onChange(true)}
          className={includeChip(included)}
        >
          Include
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={!included}
          aria-label={`${name} Exclude`}
          onClick={() => onChange(false)}
          className={includeChip(!included)}
        >
          Exclude
        </button>
      </span>
    </div>
  );
}

function FilterSettingsPanel({
  label,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          aria-label={label}
          className="flex min-h-10 w-full min-w-0 items-center justify-between rounded-lg border border-[#2a304d] bg-[#10131f] px-3 py-2 text-left text-sm font-semibold text-[#e2e1ee] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a078ff]"
        >
          <span>Filter Settings</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[#958ea0] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-3 overflow-x-hidden">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ExplorerFilters({
  query,
  setQuery,
  team,
  setTeam,
  teams,
  matchType,
  setMatchType,
  rankingMode,
  includedFields = DEFAULT_INCLUDED_FIELDS,
  setIncludedFields,
  includedTypes = DEFAULT_INCLUDED_SIGNAL_TYPES,
  setIncludedTypes,
  sinCityFields = DEFAULT_SIN_CITY_FIELDS,
  setSinCityFields,
  sinCityTypes = DEFAULT_SIN_CITY_SIGNAL_TYPES,
  setSinCityTypes,
}: {
  query: string;
  setQuery: (v: string) => void;
  team: string;
  setTeam: (v: string) => void;
  teams: string[];
  matchType: string;
  setMatchType: (v: string) => void;
  rankingMode: ExplorerRankingMode;
  includedFields: FieldInclusion;
  setIncludedFields: (next: FieldInclusion | ((prev: FieldInclusion) => FieldInclusion)) => void;
  includedTypes: SignalTypeInclusion;
  setIncludedTypes: (next: SignalTypeInclusion | ((prev: SignalTypeInclusion) => SignalTypeInclusion)) => void;
  sinCityFields: SinCityFieldInclusion;
  setSinCityFields: (next: SinCityFieldInclusion | ((prev: SinCityFieldInclusion) => SinCityFieldInclusion)) => void;
  sinCityTypes: SinCitySignalTypeInclusion;
  setSinCityTypes: (next: SinCitySignalTypeInclusion | ((prev: SinCitySignalTypeInclusion) => SinCitySignalTypeInclusion)) => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setSettingsOpen(false);
  }, [rankingMode]);

  const settingsLabel = rankingMode === "sinCity" ? "Sin City Filter Settings" : "Numerology Filter Settings";

  return (
    <div className="space-y-3 overflow-x-hidden border-b border-[#494454] bg-[#191b24] px-3 py-3 sm:px-4">
      <div className="flex min-w-0 flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players"
          aria-label="Search players"
          className="min-w-0 flex-1 rounded-lg border border-[#494454] bg-[#1d1f28] px-3 py-1.5 text-sm"
        />
        <select
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          aria-label="Team"
          className="min-w-0 max-w-full rounded-lg border border-[#494454] bg-[#1d1f28] px-3 py-1.5 text-sm"
        >
          <option value="all">All Teams</option>
          {teams.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select
          value={matchType}
          onChange={(e) => setMatchType(e.target.value)}
          aria-label="Match Type"
          className="min-w-0 max-w-full rounded-lg border border-[#494454] bg-[#1d1f28] px-3 py-1.5 text-sm"
        >
          <option value="all">All Match Types</option>
          <option>Exact Match</option>
          <option>Root Match</option>
        </select>
      </div>

      <FilterSettingsPanel label={settingsLabel} open={settingsOpen} onOpenChange={setSettingsOpen}>
        {rankingMode === "sinCity" ? (
          <>
            <div>
              <p className={`${cap} mb-1.5 text-[#e9c349]`}>Sin City fields — Include / Exclude</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {SIN_CITY_FIELDS.map(([key, label]) => (
                  <IncludeExclude
                    key={key}
                    label={label}
                    name={label}
                    included={sinCityFields[key]}
                    onChange={(next) => setSinCityFields((prev) => ({ ...prev, [key]: next }))}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className={`${cap} mb-1.5 text-[#e9c349]`}>Sin City signal types — Include / Exclude</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {SIN_CITY_TYPES.map(([key, label]) => (
                  <IncludeExclude
                    key={key}
                    label={label}
                    name={`Sin City ${label}`}
                    included={sinCityTypes[key]}
                    onChange={(next) => setSinCityTypes((prev) => ({ ...prev, [key]: next }))}
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className={`${cap} mb-1.5 text-[#958ea0]`}>Signal fields — Include / Exclude</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {FIELDS.map(([key, label]) => (
                  <IncludeExclude
                    key={key}
                    label={label}
                    name={label}
                    included={includedFields[key]}
                    onChange={(next) => setIncludedFields((prev) => ({ ...prev, [key]: next }))}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className={`${cap} mb-1.5 text-[#958ea0]`}>Signal types — Include / Exclude</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {TYPES.map(([key, label]) => (
                  <IncludeExclude
                    key={key}
                    label={label}
                    name={label}
                    included={includedTypes[key]}
                    onChange={(next) => setIncludedTypes((prev) => ({ ...prev, [key]: next }))}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </FilterSettingsPanel>
    </div>
  );
}
