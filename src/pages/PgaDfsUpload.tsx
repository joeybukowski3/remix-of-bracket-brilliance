import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Search, Upload, X } from "lucide-react";
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
  EMPTY_MESSAGE,
  type CourseWeightSet,
  type RawPlayerStat,
  type SidebarFilter,
  findCourseWeightEntry,
  findDefaultWeightEntry,
  getCurrentAndNextEvents,
  getSavedCustomWeights,
  getThisWeekOverride,
  rankPlayers,
  PgaScheduleRail,
  usePgaHubData,
} from "@/components/pga/PgaHubShared";
import { cn } from "@/lib/utils";

type DfsPlatform = "DraftKings" | "FanDuel";
type SortDirection = "asc" | "desc";
type CompareMode = "model" | "tournament" | "custom";
type SortKey =
  | "salaryRank"
  | "player"
  | "salary"
  | "modelRank"
  | "tournamentRank"
  | "customRank"
  | "vsModel"
  | "vsTournament"
  | "vsCustom";

type UploadedSalaryPlayer = {
  player: string;
  salary: number;
  normalizedName: string;
  lastName: string;
};

type ComparisonRow = {
  salaryRank: number;
  player: string;
  salary: number;
  modelRank: number;
  tournamentRank: number;
  customRank: number;
  vsModel: number;
  vsTournament: number;
  vsCustom: number;
};

const compareOptions: Array<{ key: CompareMode; label: string }> = [
  { key: "model", label: "Model Rank" },
  { key: "tournament", label: "Tournament Rank" },
  { key: "custom", label: "Custom Rank" },
];

const headerConfig: Array<{ key: SortKey; label: string; tooltip?: string }> = [
  { key: "salaryRank", label: "Salary Rank" },
  { key: "player", label: "Player" },
  { key: "salary", label: "Salary" },
  { key: "modelRank", label: "Model Rank" },
  { key: "tournamentRank", label: "Tournament Rank" },
  { key: "customRank", label: "Custom Rank" },
  { key: "vsModel", label: "vs Model", tooltip: "Positive means undervalued by DFS salary compared with the selected ranking." },
  { key: "vsTournament", label: "vs Tournament", tooltip: "Positive means undervalued by DFS salary compared with the selected ranking." },
  { key: "vsCustom", label: "vs Custom", tooltip: "Positive means undervalued by DFS salary compared with the selected ranking." },
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

function normalizePlayerName(value: string) {
  return value
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLastNameKey(value: string) {
  const normalized = normalizePlayerName(value);
  const parts = normalized.split(" ").filter(Boolean);
  return parts.at(-1) ?? normalized;
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

function formatDifference(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function getDifferenceTone(value: number) {
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

function sortRows(rows: ComparisonRow[], sortKey: SortKey, sortDirection: SortDirection) {
  const multiplier = sortDirection === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const leftValue = left[sortKey];
    const rightValue = right[sortKey];

    if (typeof leftValue === "string" && typeof rightValue === "string") {
      return leftValue.localeCompare(rightValue) * multiplier;
    }

    if (leftValue === rightValue) {
      return left.player.localeCompare(right.player);
    }

    return ((leftValue as number) - (rightValue as number)) * multiplier;
  });
}

export default function PgaDfsUpload() {
  const { schedule, courseWeights, playerStats, loading } = usePgaHubData();
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>("all");
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<DfsPlatform | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedPlayers, setParsedPlayers] = useState<UploadedSalaryPlayer[]>([]);
  const [search, setSearch] = useState("");
  const [salaryBounds, setSalaryBounds] = useState<[number, number]>([0, 0]);
  const [showValueOnly, setShowValueOnly] = useState(false);
  const [compareMode, setCompareMode] = useState<CompareMode>("model");
  const [sortKey, setSortKey] = useState<SortKey>("salaryRank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  usePageSeo({
    title: "PGA DFS Upload",
    description: "Upload DraftKings or FanDuel PGA salaries and compare DFS salary rank against Joe Knows Ball model rankings.",
    path: "/pga/dfs",
  });

  const { current: currentEvent } = useMemo(() => getCurrentAndNextEvents(schedule), [schedule]);
  const selectedEvent = useMemo(
    () => schedule.find((entry) => entry.id === selectedScheduleId) ?? currentEvent ?? null,
    [currentEvent, schedule, selectedScheduleId],
  );

  const defaultWeightEntry = useMemo(() => findDefaultWeightEntry(courseWeights), [courseWeights]);
  const currentOverride = useMemo(() => getThisWeekOverride(), []);
  const customWeights = useMemo(
    () => getSavedCustomWeights() ?? defaultWeightEntry?.weights ?? null,
    [defaultWeightEntry],
  );
  const tournamentWeightEntry = useMemo(() => {
    if (!selectedEvent) return null;
    const matched = findCourseWeightEntry(courseWeights, selectedEvent.name, selectedEvent.courseName);
    return currentOverride && matched && selectedEvent.id === currentEvent?.id
      ? { ...matched, weights: currentOverride }
      : matched;
  }, [courseWeights, currentEvent?.id, currentOverride, selectedEvent]);

  const modelRows = useMemo(
    () => (defaultWeightEntry ? rankPlayers(playerStats, defaultWeightEntry.weights) : []),
    [defaultWeightEntry, playerStats],
  );
  const tournamentRows = useMemo(
    () => (tournamentWeightEntry ? rankPlayers(playerStats, tournamentWeightEntry.weights) : []),
    [playerStats, tournamentWeightEntry],
  );
  const customRows = useMemo(
    () => (customWeights ? rankPlayers(playerStats, customWeights) : modelRows),
    [customWeights, modelRows, playerStats],
  );

  const modelRankMap = useMemo(() => new Map(modelRows.map((row) => [row.player, row.rank])), [modelRows]);
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

  const comparisonData = useMemo(() => {
    if (!parsedPlayers.length) return { rows: [] as ComparisonRow[], unmatched: [] as string[] };

    const exactMap = new Map<string, RawPlayerStat>();
    const lastNameMap = new Map<string, RawPlayerStat[]>();

    playerStats.forEach((player) => {
      const normalized = normalizePlayerName(player.player);
      const lastName = getLastNameKey(player.player);
      exactMap.set(normalized, player);
      const lastNameMatches = lastNameMap.get(lastName) ?? [];
      lastNameMatches.push(player);
      lastNameMap.set(lastName, lastNameMatches);
    });

    const matchedRows: ComparisonRow[] = [];
    const unmatched: string[] = [];

    parsedPlayers.forEach((player, index) => {
      let matchedPlayer = exactMap.get(player.normalizedName) ?? null;

      if (!matchedPlayer) {
        const fallbackMatches = lastNameMap.get(player.lastName) ?? [];
        matchedPlayer = fallbackMatches.length === 1 ? fallbackMatches[0] : null;
      }

      if (!matchedPlayer) {
        unmatched.push(player.player);
        return;
      }

      const modelRank = modelRankMap.get(matchedPlayer.player);
      const tournamentRank = tournamentRankMap.get(matchedPlayer.player);
      const customRank = customRankMap.get(matchedPlayer.player);

      if (!modelRank || !tournamentRank || !customRank) {
        unmatched.push(player.player);
        return;
      }

      matchedRows.push({
        salaryRank: index + 1,
        player: matchedPlayer.player,
        salary: player.salary,
        modelRank,
        tournamentRank,
        customRank,
        vsModel: index + 1 - modelRank,
        vsTournament: index + 1 - tournamentRank,
        vsCustom: index + 1 - customRank,
      });
    });

    return { rows: matchedRows, unmatched };
  }, [customRankMap, modelRankMap, parsedPlayers, playerStats, tournamentRankMap]);

  const comparisonRows = comparisonData.rows;
  const unmatchedPlayers = comparisonData.unmatched;

  const filteredRows = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return comparisonRows.filter((row) => {
      const matchesSearch = !searchValue || row.player.toLowerCase().includes(searchValue);
      const matchesSalary = row.salary >= salaryBounds[0] && row.salary <= salaryBounds[1];
      const matchesValueOnly = !showValueOnly || row.vsModel >= 3 || row.vsTournament >= 3;
      return matchesSearch && matchesSalary && matchesValueOnly;
    });
  }, [comparisonRows, salaryBounds, search, showValueOnly]);

  const sortedRows = useMemo(() => sortRows(filteredRows, sortKey, sortDirection), [filteredRows, sortDirection, sortKey]);

  const handleSort = (key: SortKey) => {
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
          normalizedName: normalizePlayerName(player),
          lastName: getLastNameKey(player),
        } satisfies UploadedSalaryPlayer;
      })
      .filter((player): player is UploadedSalaryPlayer => Boolean(player))
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
        row.modelRank,
        row.tournamentRank,
        row.customRank,
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

  return (
    <SiteShell>
      <main className="site-page bg-[#eef3f8] pb-16 pt-4 text-slate-900">
        <div className="site-container">
          <div className="grid gap-4 md:grid-cols-[292px_minmax(0,1fr)]">
            <PgaScheduleRail
              schedule={schedule}
              currentEvent={currentEvent}
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
                      <div><span className="font-semibold text-slate-900">Matched Players:</span> {comparisonRows.length}</div>
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

                  {unmatchedPlayers.length > 0 ? (
                    <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-3">
                      <div className="text-sm font-semibold text-amber-900">Unmatched Players</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {unmatchedPlayers.map((player) => (
                          <span key={player} className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs text-amber-800">
                            {player}
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
                    <Select value={compareMode} onValueChange={(value) => setCompareMode(value as CompareMode)}>
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
                      Show Value Plays Only
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                {loading ? (
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
                          {sortedRows.map((row) => (
                            <TableRow key={`${row.player}-${row.salary}`} className="border-slate-100 hover:bg-slate-50">
                              <TableCell className="px-2 py-2 text-center font-semibold text-slate-700">{row.salaryRank}</TableCell>
                              <TableCell className="px-2 py-2 font-medium text-slate-900">{row.player}</TableCell>
                              <TableCell className="px-2 py-2 text-center font-semibold text-slate-900">{formatCurrency(row.salary)}</TableCell>
                              <TableCell className="px-2 py-2 text-center">{row.modelRank}</TableCell>
                              <TableCell className="px-2 py-2 text-center">{row.tournamentRank}</TableCell>
                              <TableCell className="px-2 py-2 text-center">{row.customRank}</TableCell>
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
                          ))}
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
