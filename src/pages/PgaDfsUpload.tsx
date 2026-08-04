import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Download, Search, Upload, X } from "lucide-react";
import SiteShell from "@/components/layout/SiteShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  buildPgaDfsCanonicalPlayers,
  buildPgaDfsComparisonData,
  filterPgaDfsRows,
  PGA_DFS_VALUE_THRESHOLD,
  sortPgaDfsRows,
  type PgaDfsCanonicalPlayer,
  type PgaDfsCompareMode,
  type PgaDfsSalaryRow,
  type PgaDfsSortDirection,
  type PgaDfsSortKey,
  type PgaDfsTableRow,
} from "@/lib/pga/dfsUpload";
import { normalizePgaPlayerExactName, normalizePgaPlayerName } from "@/lib/pga/playerIdentity";
import { usePgaCurrentField } from "@/hooks/usePgaCurrentField";
import { usePgaPlayerHistory } from "@/hooks/usePgaPlayerHistory";
import { useJkbTrendRankings } from "@/hooks/useJkbTrendRankings";
import {
  buildPgaCurrentFieldKeys,
  buildPgaCurrentFieldPlayerIdMap,
  isPgaCurrentFieldUsable,
} from "@/lib/pga/currentField";
import { buildCurrentPgaModelRows, normalizePlayerKey } from "@/lib/pga/historyModel";
import { countryCodeToFlagEmojiUrl } from "@/lib/pga/playerNationality";
import {
  EMPTY_MESSAGE,
  type SidebarFilter,
  findCourseWeightEntry,
  findDefaultWeightEntry,
  getCurrentAndNextEvents,
  getSavedCustomWeights,
  getThisWeekOverride,
  normalizeCustomWeights,
  rankPlayers,
  PgaScheduleRail,
  usePgaHubData,
} from "@/components/pga/PgaHubShared";
import { getSeoMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";

type DfsPlatform = "DraftKings" | "FanDuel";

const compareOptions: Array<{ key: PgaDfsCompareMode; label: string }> = [
  { key: "model", label: "Model Rank" },
  { key: "tournament", label: "Tournament Rank" },
  { key: "custom", label: "Custom Rank" },
];

const headerConfig: Array<{ key: PgaDfsSortKey; label: string; tooltip?: string }> = [
  { key: "salaryRank", label: "Salary Rank" },
  { key: "player", label: "Player" },
  { key: "salary", label: "Salary" },
  { key: "modelRank", label: "Model Rank", tooltip: "The same current official-field model rank shown on /pga." },
  { key: "tournamentRank", label: "Tournament Rank", tooltip: "Course-weight rank among modeled players in the current official field." },
  { key: "customRank", label: "Custom Rank" },
  { key: "vsModel", label: "Model Value", tooltip: "Salary Rank minus Model Rank. Positive means underpriced." },
  { key: "vsTournament", label: "Tournament Value", tooltip: "Salary Rank minus Tournament Rank. Positive means underpriced." },
  { key: "vsCustom", label: "Custom Value", tooltip: "Salary Rank minus Custom Rank. Positive means underpriced." },
];

function parseCsvText(text: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        currentValue += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      currentRow.push(currentValue);
      if (currentRow.some((value) => value.trim().length > 0)) {
        rows.push(currentRow.map((value) => value.trim()));
      }
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    if (currentRow.some((value) => value.trim().length > 0)) {
      rows.push(currentRow.map((value) => value.trim()));
    }
  }

  return rows;
}

function detectPlatform(headers: string[]) {
  const normalized = headers.map((header) => header.toLowerCase().trim());
  if (normalized.includes("salary") && normalized.includes("name")) {
    return { platform: "DraftKings" as const, salaryKey: headers[normalized.indexOf("salary")], nameKey: headers[normalized.indexOf("name")] };
  }
  if (normalized.includes("salary") && normalized.includes("nickname")) {
    return { platform: "FanDuel" as const, salaryKey: headers[normalized.indexOf("salary")], nameKey: headers[normalized.indexOf("nickname")] };
  }
  return null;
}

function parseSalary(value: string) {
  const numeric = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDifference(value: number | null) {
  if (value == null) return "—";
  return value > 0 ? `+${value}` : `${value}`;
}

function getDifferenceTone(value: number | null) {
  if (value == null) return "bg-slate-50 text-slate-400";
  if (value >= 5) return "bg-emerald-700 text-emerald-50";
  if (value >= 2) return "bg-emerald-100 text-emerald-900";
  if (value <= -5) return "bg-rose-700 text-rose-50";
  if (value <= -2) return "bg-rose-100 text-rose-900";
  return "bg-slate-100 text-slate-700";
}

function escapeCsvValue(value: string | number) {
  const stringValue = String(value);
  if (!/[",\n]/.test(stringValue)) return stringValue;
  return `"${stringValue.replace(/"/g, "\"\"")}"`;
}

export default function PgaDfsUpload() {
  const seo = getSeoMeta("pga-dfs");
  const { schedule, courseWeights, playerStats, loading } = usePgaHubData();
  const { playerHistoryMap, majorHistoryMap, loading: historyLoading } = usePgaPlayerHistory();
  const { rankingMap: jkbTrendMap, loading: trendLoading } = useJkbTrendRankings();
  const { field: currentField, loaded: fieldLoaded } = usePgaCurrentField();
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>("all");
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<DfsPlatform | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedPlayers, setParsedPlayers] = useState<PgaDfsSalaryRow[]>([]);
  const [search, setSearch] = useState("");
  const [salaryBounds, setSalaryBounds] = useState<[number, number]>([0, 0]);
  const [showValueOnly, setShowValueOnly] = useState(false);
  const [compareMode, setCompareMode] = useState<PgaDfsCompareMode>("model");
  const [sortKey, setSortKey] = useState<PgaDfsSortKey>("salaryRank");
  const [sortDirection, setSortDirection] = useState<PgaDfsSortDirection>("asc");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [expandedPlayerKey, setExpandedPlayerKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  usePageSeo({
    title: seo.title,
    description: seo.description,
    path: seo.path,
  });

  const { active: activeEvent, current: currentEvent } = useMemo(() => getCurrentAndNextEvents(schedule), [schedule]);
  const selectedEvent = useMemo(
    () => schedule.find((entry) => entry.id === selectedScheduleId) ?? currentEvent ?? null,
    [currentEvent, schedule, selectedScheduleId],
  );

  const fieldUsable = isPgaCurrentFieldUsable(currentField, currentEvent);
  const fieldKeys = useMemo(
    () => buildPgaCurrentFieldKeys(currentField, fieldUsable, playerStats),
    [currentField, fieldUsable, playerStats],
  );
  const currentFieldPlayerStats = useMemo(
    () => fieldUsable ? playerStats.filter((player) => fieldKeys.has(normalizePlayerKey(player.player))) : playerStats,
    [fieldKeys, fieldUsable, playerStats],
  );
  const currentModelWeightEntry = useMemo(
    () => currentEvent ? findCourseWeightEntry(courseWeights, currentEvent.name, currentEvent.courseName) : null,
    [courseWeights, currentEvent],
  );
  const canonicalModelRows = useMemo(
    () => currentEvent ? buildCurrentPgaModelRows({
      players: playerStats,
      playerHistoryMap,
      majorHistoryMap,
      activeWeights: currentModelWeightEntry?.weights ?? null,
      event: {
        slug: currentEvent.slug,
        name: currentEvent.shortName || currentEvent.name,
        category: currentEvent.category,
        yardage: currentEvent.yardage,
      },
      fieldKeys,
    }) : [],
    [currentEvent, currentModelWeightEntry, fieldKeys, majorHistoryMap, playerHistoryMap, playerStats],
  );
  const currentFieldPlayerIdMap = useMemo(
    () => buildPgaCurrentFieldPlayerIdMap(currentField, canonicalModelRows),
    [canonicalModelRows, currentField],
  );
  const canonicalPlayers = useMemo(
    () => buildPgaDfsCanonicalPlayers(canonicalModelRows, currentFieldPlayerIdMap, jkbTrendMap),
    [canonicalModelRows, currentFieldPlayerIdMap, jkbTrendMap],
  );

  const defaultWeightEntry = useMemo(() => findDefaultWeightEntry(courseWeights), [courseWeights]);
  const normalizedDefaultWeights = useMemo(
    () => (defaultWeightEntry ? normalizeCustomWeights(defaultWeightEntry.weights) : null),
    [defaultWeightEntry],
  );
  const currentOverride = useMemo(() => getThisWeekOverride(), []);
  const customWeights = useMemo(
    () => getSavedCustomWeights(normalizedDefaultWeights) ?? normalizedDefaultWeights,
    [normalizedDefaultWeights],
  );
  const tournamentWeightEntry = useMemo(() => {
    if (!selectedEvent) return null;
    const matched = findCourseWeightEntry(courseWeights, selectedEvent.name, selectedEvent.courseName);
    return currentOverride && matched && selectedEvent.id === currentEvent?.id
      ? { ...matched, weights: normalizeCustomWeights(currentOverride, matched.weights) }
      : matched
        ? { ...matched, weights: normalizeCustomWeights(matched.weights, normalizedDefaultWeights) }
        : null;
  }, [courseWeights, currentEvent?.id, currentOverride, normalizedDefaultWeights, selectedEvent]);

  const tournamentPlayerStats = useMemo(
    () => selectedEvent?.id === currentEvent?.id ? currentFieldPlayerStats : playerStats,
    [currentEvent?.id, currentFieldPlayerStats, playerStats, selectedEvent?.id],
  );
  const tournamentRows = useMemo(
    () => (tournamentWeightEntry ? rankPlayers(tournamentPlayerStats, tournamentWeightEntry.weights) : []),
    [tournamentPlayerStats, tournamentWeightEntry],
  );
  const customRows = useMemo(
    () => (customWeights ? rankPlayers(currentFieldPlayerStats, customWeights) : []),
    [customWeights, currentFieldPlayerStats],
  );

  const tournamentRankMap = useMemo(() => new Map(tournamentRows.map((row) => [row.player, row.rank])), [tournamentRows]);
  const customRankMap = useMemo(() => new Map(customRows.map((row) => [row.player, row.rank])), [customRows]);

  const salaryLimits = useMemo(() => {
    if (!parsedPlayers.length) return [0, 0] as [number, number];
    const salaries = parsedPlayers.map((player) => player.salary);
    return [Math.min(...salaries), Math.max(...salaries)] as [number, number];
  }, [parsedPlayers]);

  useEffect(() => {
    setSalaryBounds(salaryLimits);
  }, [salaryLimits]);

  const comparisonData = useMemo(
    () => buildPgaDfsComparisonData(parsedPlayers, canonicalPlayers, tournamentRankMap, customRankMap),
    [canonicalPlayers, customRankMap, parsedPlayers, tournamentRankMap],
  );

  const comparisonRows = useMemo(
    () =>
      comparisonData.entries
        .map((entry): PgaDfsTableRow => ({
          salaryRank: entry.salaryRank,
          player: entry.matchedPlayer ?? entry.uploadedPlayer,
          salary: entry.salary,
          modelRank: entry.modelRank,
          tournamentRank: entry.tournamentRank,
          customRank: entry.customRank,
          vsModel: entry.vsModel,
          vsTournament: entry.vsTournament,
          vsCustom: entry.vsCustom,
          coverageState: entry.coverageState,
          canonicalPlayer: entry.canonicalPlayer,
        })),
    [comparisonData.entries],
  );

  const unmatchedPlayers = comparisonData.summary.unmatchedPlayers;
  const missingRankPlayers = comparisonData.summary.missingRankPlayers;

  const filteredRows = useMemo(() => {
    return filterPgaDfsRows(comparisonRows, {
      search,
      salaryBounds,
      compareMode,
      showValueOnly,
    });
  }, [compareMode, comparisonRows, salaryBounds, search, showValueOnly]);

  const sortedRows = useMemo(() => sortPgaDfsRows(filteredRows, sortKey, sortDirection), [filteredRows, sortDirection, sortKey]);

  const handleSort = (key: PgaDfsSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection(key === "player" ? "asc" : "desc");
  };

  const resetUpload = () => {
    setPlatform(null);
    setFileName(null);
    setParsedPlayers([]);
    setUploadError(null);
    setSearch("");
    setShowValueOnly(false);
    setSortKey("salaryRank");
    setSortDirection("asc");
    setCompareMode("model");
    setExpandedPlayerKey(null);
    setSalaryBounds([0, 0]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setUploadError(null);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setUploadError("Upload a CSV export from DraftKings or FanDuel.");
      return;
    }

    const text = await file.text();
    const rows = parseCsvText(text);
    const headers = rows[0];

    if (!headers?.length) {
      setUploadError("The uploaded CSV is empty.");
      return;
    }

    const platformConfig = detectPlatform(headers);
    if (!platformConfig) {
      setUploadError("Could not detect DraftKings or FanDuel headers in this CSV.");
      return;
    }

    const headerIndexMap = new Map(headers.map((header, index) => [header, index]));
    const nameIndex = headerIndexMap.get(platformConfig.nameKey);
    const salaryIndex = headerIndexMap.get(platformConfig.salaryKey);

    if (nameIndex === undefined || salaryIndex === undefined) {
      setUploadError("Missing required name or salary columns.");
      return;
    }

    const players = rows
      .slice(1)
      .map((row) => {
        const player = row[nameIndex] ?? "";
        const salary = parseSalary(row[salaryIndex] ?? "");
        if (!player.trim() || salary === null) return null;

        return {
          player: player.trim(),
          salary,
          normalizedName: normalizePgaPlayerExactName(player),
          canonicalName: normalizePgaPlayerName(player),
        } satisfies PgaDfsSalaryRow;
      })
      .filter((player): player is PgaDfsSalaryRow => Boolean(player))
      .sort((left, right) => right.salary - left.salary || left.player.localeCompare(right.player));

    setPlatform(platformConfig.platform);
    setFileName(file.name);
    setParsedPlayers(players);
    setSortKey("salaryRank");
    setSortDirection("asc");
  };

  const exportRows = () => {
    const header = ["Salary Rank", "Player", "Salary", "Model Rank", "Tournament Rank", "Custom Rank", "vs Model", "vs Tournament", "vs Custom"];
    const lines = [
      header.join(","),
      ...sortedRows.map((row) => ([
        row.salaryRank,
        row.player,
        row.salary,
        formatRank(row.modelRank),
        formatRank(row.tournamentRank),
        formatRank(row.customRank),
        formatDifference(row.vsModel),
        formatDifference(row.vsTournament),
        formatDifference(row.vsCustom),
      ].map(escapeCsvValue).join(","))),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `joeknowsball-dfs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!import.meta.env.DEV || !parsedPlayers.length) return;

    console.info("[PgaDfsUpload] match summary", {
      uploadedRows: comparisonData.summary.uploadedRows,
      matchedRows: comparisonData.summary.matchedRows,
      unmatchedRows: comparisonData.summary.unmatchedRows,
      missingRankRows: comparisonData.summary.missingRankRows,
      matchMethods: comparisonData.summary.matchMethods,
      unmatchedPlayers: comparisonData.summary.unmatchedPlayers,
      missingRankPlayers: comparisonData.summary.missingRankPlayers,
    });

    if (comparisonData.summary.resolvedPlayers.length > 0) {
      console.table(comparisonData.summary.resolvedPlayers);
    }
  }, [comparisonData.summary, parsedPlayers.length]);

  return (
    <SiteShell>
      <main className="site-page bg-[#eef3f8] pb-16 pt-4 text-slate-900">
        <div className="site-container">
          <div className="grid gap-4 md:grid-cols-[292px_minmax(0,1fr)]">
            <PgaScheduleRail
              schedule={schedule}
              activeEvent={activeEvent}
              resolvedEvent={currentEvent}
              sidebarFilter={sidebarFilter}
              setSidebarFilter={setSidebarFilter}
              selectedScheduleId={selectedScheduleId}
              onSelect={setSelectedScheduleId}
            />

            <section className="space-y-4">
              <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">PGA DFS Upload</div>
                      <div className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">Salary vs Model Comparison</div>
                      <div className="text-sm text-slate-500">
                        {selectedEvent ? `${selectedEvent.name} | ${selectedEvent.courseName} | ${selectedEvent.dateLabel}` : EMPTY_MESSAGE}
                      </div>
                    </div>

                    <div className="inline-flex w-full rounded-full border border-slate-200 bg-slate-100 p-1 xl:w-auto">
                      <Link to="/pga" className="flex-1 rounded-full px-4 py-2 text-center text-sm font-semibold text-slate-500 transition hover:text-slate-900 xl:flex-none">
                        Tournament
                      </Link>
                      <Link to="/pga/custom" className="flex-1 rounded-full px-4 py-2 text-center text-sm font-semibold text-slate-500 transition hover:text-slate-900 xl:flex-none">
                        Custom
                      </Link>
                      <Link to="/pga" className="flex-1 rounded-full px-4 py-2 text-center text-sm font-semibold text-slate-500 transition hover:text-slate-900 xl:flex-none">
                        Standard
                      </Link>
                      <span className="flex-1 rounded-full bg-white px-4 py-2 text-center text-sm font-semibold text-slate-900 shadow-sm xl:flex-none">
                        DFS Upload
                      </span>
                    </div>
                  </div>

                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => inputRef.current?.click()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        inputRef.current?.click();
                      }
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setIsDragging(false);
                      const file = event.dataTransfer.files[0];
                      if (file) void handleFile(file);
                    }}
                    className={cn(
                      "rounded-[24px] border border-dashed px-5 py-8 text-center transition",
                      isDragging ? "border-slate-900 bg-slate-100" : "border-slate-300 bg-slate-50 hover:border-slate-400",
                    )}
                  >
                    <Upload className="mx-auto h-8 w-8 text-slate-500" />
                    <div className="mt-3 text-sm font-semibold text-slate-900">Drop a DraftKings or FanDuel CSV here</div>
                    <div className="mt-1 text-xs text-slate-500">or click to browse a salary export</div>
                    <input
                      ref={inputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handleFile(file);
                      }}
                    />
                  </div>

                  <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1 text-sm text-slate-600">
                      <div><span className="font-semibold text-slate-900">Platform:</span> {platform ?? "No file uploaded"}</div>
                      <div><span className="font-semibold text-slate-900">File:</span> {fileName ?? "--"}</div>
                      <div><span className="font-semibold text-slate-900">Matched Players:</span> {comparisonData.summary.matchedRows}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        className="border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                        onClick={resetUpload}
                      >
                        <X className="h-4 w-4" />
                        Clear
                      </Button>
                      <Button
                        className="bg-slate-900 text-white hover:bg-slate-800"
                        onClick={exportRows}
                        disabled={!sortedRows.length}
                      >
                        <Download className="h-4 w-4" />
                        Export CSV
                      </Button>
                    </div>
                  </div>

                  {uploadError ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {uploadError}
                    </div>
                  ) : null}

                  {parsedPlayers.length > 0 ? (
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-3">
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Uploaded</div>
                          <div className="mt-1 text-lg font-semibold text-slate-900">{comparisonData.summary.uploadedRows}</div>
                        </div>
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Matched</div>
                          <div className="mt-1 text-lg font-semibold text-emerald-950">{comparisonData.summary.matchedRows}</div>
                        </div>
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Unmatched</div>
                          <div className="mt-1 text-lg font-semibold text-amber-950">{comparisonData.summary.unmatchedRows}</div>
                        </div>
                        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">Missing Rank Data</div>
                          <div className="mt-1 text-lg font-semibold text-sky-950">{comparisonData.summary.missingRankRows}</div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {Object.entries(comparisonData.summary.matchMethods).map(([method, count]) => (
                          <span key={method} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
                            {method}: {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {unmatchedPlayers.length > 0 || missingRankPlayers.length > 0 ? (
                    <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-3">
                      <div className="text-sm font-semibold text-amber-900">Players Requiring Review</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {unmatchedPlayers.map((player) => (
                          <span key={`unmatched-${player}`} className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs text-amber-800">
                            {player} <span className="text-amber-600">(none)</span>
                          </span>
                        ))}
                        {missingRankPlayers.map((player) => (
                          <span key={`missing-${player}`} className="rounded-full border border-sky-200 bg-white px-2.5 py-1 text-xs text-sky-800">
                            {player} <span className="text-sky-600">(missing ranks)</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px_240px_200px]">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Search Player</label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Filter by player name"
                        className="border-slate-200 bg-white pl-9 text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Salary Range</label>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span>{formatCurrency(salaryBounds[0])}</span>
                        <span>{formatCurrency(salaryBounds[1])}</span>
                      </div>
                      <Slider
                        value={salaryBounds}
                        min={salaryLimits[0]}
                        max={salaryLimits[1] || salaryLimits[0] + 1}
                        step={100}
                        onValueChange={(value) => {
                          if (value.length === 2) setSalaryBounds([value[0] ?? salaryLimits[0], value[1] ?? salaryLimits[1]]);
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ranking to Compare</label>
                    <Select
                      value={compareMode}
                      onValueChange={(value) => {
                        const mode = value as PgaDfsCompareMode;
                        setCompareMode(mode);
                        setSortKey(mode === "model" ? "vsModel" : mode === "tournament" ? "vsTournament" : "vsCustom");
                        setSortDirection("desc");
                      }}
                    >
                      <SelectTrigger className="border-slate-200 bg-white text-slate-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {compareOptions.map((option) => (
                          <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Value Filter</label>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full border-slate-200 bg-white text-slate-700 hover:bg-slate-100",
                        showValueOnly && "border-emerald-300 bg-emerald-50 text-emerald-900",
                      )}
                      onClick={() => setShowValueOnly((current) => !current)}
                    >
                      Show Value Plays Only (+{PGA_DFS_VALUE_THRESHOLD})
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                {loading || historyLoading || trendLoading || !fieldLoaded ? (
                  <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                    Loading PGA data...
                  </div>
                ) : !parsedPlayers.length ? (
                  <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                    Upload a DFS CSV to compare salary rank against Joe Knows Ball model rankings.
                  </div>
                ) : !sortedRows.length ? (
                  <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                    No matched players meet the current filters.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
                    <div className="overflow-x-auto">
                      <Table className="min-w-[1120px] text-xs text-slate-700">
                        <TableHeader>
                          <TableRow className="border-slate-200 hover:bg-transparent">
                            {headerConfig.map((header) => {
                              const highlighted =
                                (compareMode === "model" && header.key === "vsModel")
                                || (compareMode === "tournament" && header.key === "vsTournament")
                                || (compareMode === "custom" && header.key === "vsCustom");

                              return (
                                <TableHead key={header.key} className={cn("px-2 py-2 text-center text-[10px] uppercase tracking-[0.16em] text-slate-500", header.key === "player" && "text-left", highlighted && "text-slate-900")}>
                                  <button
                                    type="button"
                                    onClick={() => handleSort(header.key)}
                                    className={cn("inline-flex items-center gap-1 transition hover:text-slate-900", header.key === "player" ? "justify-start" : "justify-center")}
                                  >
                                    {header.tooltip ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="cursor-help underline decoration-dotted underline-offset-4">{header.label}</span>
                                        </TooltipTrigger>
                                        <TooltipContent>{header.tooltip}</TooltipContent>
                                      </Tooltip>
                                    ) : (
                                      <span>{header.label}</span>
                                    )}
                                    <span>{sortKey === header.key ? (sortDirection === "asc" ? "▲" : "▼") : ""}</span>
                                  </button>
                                </TableHead>
                              );
                            })}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedRows.map((row) => {
                            const playerKey = row.canonicalPlayer?.canonicalKey ?? `salary-${row.salaryRank}-${row.player.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                            const isExpanded = expandedPlayerKey === playerKey;
                            const detailsId = `pga-dfs-details-${playerKey}`;
                            const flagUrl = row.canonicalPlayer?.nationality
                              ? countryCodeToFlagEmojiUrl(row.canonicalPlayer.nationality.countryCode)
                              : null;

                            return (
                              <Fragment key={`${row.player}-${row.salary}`}>
                                <TableRow className="border-slate-100 hover:bg-slate-50">
                                  <TableCell className="px-2 py-2 text-center font-semibold text-slate-700">{row.salaryRank}</TableCell>
                                  <TableCell className="px-2 py-2 font-medium text-slate-900">
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 text-left"
                                      aria-expanded={isExpanded}
                                      aria-controls={detailsId}
                                      onClick={() => setExpandedPlayerKey(isExpanded ? null : playerKey)}
                                    >
                                      {flagUrl ? <img src={flagUrl} alt="" aria-hidden="true" className="h-[13px] w-[13px] object-contain" /> : null}
                                      <span className="min-w-0 flex-1 truncate">{row.player}</span>
                                      <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition", isExpanded && "rotate-180")} />
                                      <span className="sr-only">{isExpanded ? "Hide player details" : "View player details"}</span>
                                    </button>
                                  </TableCell>
                                  <TableCell className="px-2 py-2 text-center font-semibold text-slate-900">{formatCurrency(row.salary)}</TableCell>
                                  <TableCell className="px-2 py-2 text-center">{formatRank(row.modelRank)}</TableCell>
                                  <TableCell className="px-2 py-2 text-center">{formatRank(row.tournamentRank)}</TableCell>
                                  <TableCell className="px-2 py-2 text-center">{formatRank(row.customRank)}</TableCell>
                                  <TableCell className={cn("px-2 py-2 text-center font-semibold", getDifferenceTone(row.vsModel), compareMode === "model" && "ring-1 ring-inset ring-slate-900/20")}>
                                    {formatDifference(row.vsModel)}
                                  </TableCell>
                                  <TableCell className={cn("px-2 py-2 text-center font-semibold", getDifferenceTone(row.vsTournament), compareMode === "tournament" && "ring-1 ring-inset ring-slate-900/20")}>
                                    {formatDifference(row.vsTournament)}
                                  </TableCell>
                                  <TableCell className={cn("px-2 py-2 text-center font-semibold", getDifferenceTone(row.vsCustom), compareMode === "custom" && "ring-1 ring-inset ring-slate-900/20")}>
                                    {formatDifference(row.vsCustom)}
                                  </TableCell>
                                </TableRow>
                                {isExpanded ? (
                                  <TableRow className="border-slate-200 bg-slate-50/80 hover:bg-slate-50/80">
                                    <TableCell id={detailsId} colSpan={9} className="p-3">
                                      <PgaDfsPlayerDetails row={row} />
                                    </TableCell>
                                  </TableRow>
                                ) : null}
                              </Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </SiteShell>
  );
}

function PgaDfsPlayerDetails({ row }: { row: PgaDfsTableRow }) {
  const player = row.canonicalPlayer;
  const model = player?.model ?? null;
  const jkbTrend = player?.jkbTrend ?? null;
  const nationality = player?.nationality ?? null;
  const flagUrl = nationality ? countryCodeToFlagEmojiUrl(nationality.countryCode) : null;
  const historyResults = model
    ? model.eventResults.length > 0
      ? model.eventResults
      : model.specificMajorResults.length > 0
        ? model.specificMajorResults
        : model.allMajorResults
    : [];

  return (
    <div className="grid gap-3 text-left xl:grid-cols-[1.1fr_1fr_1.4fr]">
      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Canonical Player</div>
        <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
          {flagUrl ? <img src={flagUrl} alt="" aria-hidden="true" className="h-[13px] w-[13px] object-contain" /> : null}
          <span>{row.player}</span>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {nationality?.countryName ?? "—"}
          {player?.playerId ? ` · PGA ID ${player.playerId}` : " · PGA ID —"}
        </div>
        <div className="mt-2 text-[10px] font-semibold text-slate-500">Coverage: {row.coverageState}</div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <DetailMetric label="Salary rank" value={`#${row.salaryRank}`} />
          <DetailMetric label="Model rank" value={formatRank(row.modelRank)} />
          <DetailMetric label="Tournament rank" value={formatRank(row.tournamentRank)} />
          <DetailMetric label="Model value" value={formatDifference(row.vsModel)} />
          <DetailMetric label="Tournament value" value={formatDifference(row.vsTournament)} />
          <DetailMetric label="Custom value" value={formatDifference(row.vsCustom)} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Model Components</div>
        {model ? (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <DetailMetric label="Model score" value={model.modelScore.toFixed(1)} />
              <DetailMetric label="Base" value={model.baseScore.toFixed(1)} />
              <DetailMetric label="Recent" value={formatOptionalScore(model.recentScore)} />
              <DetailMetric label="Course fit" value={formatOptionalScore(model.courseFit)} />
              <DetailMetric label="History" value={formatOptionalScore(model.eventHistoryScore ?? model.specificMajorScore)} />
              <DetailMetric label="JKB trend" value={jkbTrend?.rank != null ? `#${jkbTrend.rank}` : model.trend.label} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <DetailMetric label="SG total" value={formatSignedStat(model.sgTotal)} />
              <DetailMetric label="SG approach" value={formatSignedStat(model.sgApp)} />
              <DetailMetric label="SG putting" value={formatSignedStat(model.sgPutt)} />
            </div>
          </>
        ) : <div className="mt-2 text-xs text-slate-400">—</div>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Recent Starts</div>
            <ResultChips results={model?.recentResults ?? []} emptyLabel="—" />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Tournament History</div>
            <ResultChips results={historyResults} emptyLabel="—" />
          </div>
        </div>
      </section>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 px-2 py-1.5"><div className="text-[9px] font-semibold uppercase text-slate-500">{label}</div><div className="mt-0.5 text-xs font-bold text-slate-900">{value}</div></div>;
}

function ResultChips({ results, emptyLabel }: { results: PgaDfsCanonicalPlayer["model"]["recentResults"]; emptyLabel: string }) {
  if (!results.length) return <div className="mt-2 text-xs text-slate-400">{emptyLabel}</div>;
  return <div className="mt-2 flex flex-wrap gap-1.5">{results.map((result, index) => <span key={`${result.eventSlug ?? result.eventName ?? "event"}-${result.season ?? index}`} title={result.eventName ?? undefined} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-700">{result.finishText}</span>)}</div>;
}

function formatOptionalScore(value: number | null) {
  return value == null ? "—" : value.toFixed(1);
}

function formatRank(value: number | null) {
  return value == null ? "—" : `#${value}`;
}

function formatSignedStat(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}
