import { useState, useMemo } from "react";

// ── TYPES ──────────────────────────────────────────────────────────────
interface Player {
  "Player Name": string;
  Salary: number | null;
  "DK Avg PPG": number | null;
  "HT # Rounds": number | null;
  "Course True SG": number | null;
  "2021": string | null;
  "2022": string | null;
  "2023": string | null;
  "2024": string | null;
  "2025": string | null;
  "SG: Approach the Green": number | null;
  "SG: Around the Green": number | null;
  "SG: Putting": number | null;
  "Par 4 Scoring Average": number | null;
  "Driving Accuracy %": number | null;
  "Bogey Avoidance": number | null;
  "Birdie or Better 125-150 yds": number | null;
  "Birdie or Better <125 yds": number | null;
  TrendRank: number | null;
  "Masters 2026": string | null;
  "Masters Group": string | null;
  "Adj Proj Score": number | null;
  "Adj Value": number | null;
  "Model Rank": number | null;
  "SG: Approach the Green_rank": number | null;
  "SG: Around the Green_rank": number | null;
  "SG: Putting_rank": number | null;
  "Par 4 Scoring Average_rank": number | null;
  "Driving Accuracy %_rank": number | null;
  "Bogey Avoidance_rank": number | null;
  "Birdie or Better 125-150 yds_rank": number | null;
  "Birdie or Better <125 yds_rank": number | null;
}

// ── WEIGHTED STAT COLUMNS ──────────────────────────────────────────────
const STAT_COLS = [
  { key: "SG: Approach the Green", label: "SG: App", rankKey: "SG: Approach the Green_rank", defaultWeight: 20 },
  { key: "Par 4 Scoring Average",  label: "Par 4",   rankKey: "Par 4 Scoring Average_rank",  defaultWeight: 15 },
  { key: "Driving Accuracy %",     label: "Drive Acc",rankKey: "Driving Accuracy %_rank",     defaultWeight: 10 },
  { key: "Bogey Avoidance",        label: "Bogey Av", rankKey: "Bogey Avoidance_rank",        defaultWeight: 10 },
  { key: "SG: Around the Green",   label: "SG: ARG",  rankKey: "SG: Around the Green_rank",  defaultWeight: 10 },
  { key: "Birdie or Better 125-150 yds", label: "BB 125-150", rankKey: "Birdie or Better 125-150 yds_rank", defaultWeight: 10 },
  { key: "SG: Putting",            label: "SG: Putt", rankKey: "SG: Putting_rank",            defaultWeight: 10 },
  { key: "Birdie or Better <125 yds", label: "BB <125", rankKey: "Birdie or Better <125 yds_rank", defaultWeight: 10 },
] as const;

const COURSE_SG_WEIGHT_DEFAULT = 5;
const N_PLAYERS = 83;

// ── COLOR HELPERS ──────────────────────────────────────────────────────
function rankColor(rank: number | null, n = N_PLAYERS): string {
  if (rank == null) return "text-gray-400";
  const pct = rank / n;
  if (pct <= 0.25) return "text-emerald-400 font-semibold";
  if (pct <= 0.5)  return "text-yellow-300";
  if (pct <= 0.75) return "text-orange-400";
  return "text-red-400";
}

function finishColor(val: string | null): string {
  if (!val || val === "—") return "text-gray-500";
  if (val === "CUT") return "text-red-400";
  try {
    const n = parseInt(val.replace("T", ""));
    if (n <= 5)  return "text-emerald-400 font-bold";
    if (n <= 20) return "text-sky-400";
    return "text-gray-300";
  } catch { return "text-gray-300"; }
}

function mastersGroupBadge(group: string | null) {
  if (!group) return null;
  const styles: Record<string, string> = {
    "T6-15":  "bg-emerald-900/60 text-emerald-300 border-emerald-700",
    "MC":     "bg-sky-900/60 text-sky-300 border-sky-700",
    "DNP":    "bg-slate-700/60 text-slate-300 border-slate-600",
    "T16-25": "bg-yellow-900/60 text-yellow-300 border-yellow-700",
    "T26-54": "bg-orange-900/60 text-orange-300 border-orange-700",
    "T1-5":   "bg-red-900/60 text-red-300 border-red-700",
  };
  const style = styles[group] ?? "bg-gray-700 text-gray-300 border-gray-600";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${style}`}>
      {group}
    </span>
  );
}

function sgColor(v: number | null): string {
  if (v == null) return "text-gray-400";
  if (v > 0.5)  return "text-emerald-400 font-semibold";
  if (v > 0)    return "text-emerald-300";
  if (v > -0.3) return "text-gray-400";
  return "text-red-400";
}

function csgColor(v: number | null): string {
  if (v == null) return "text-gray-400";
  if (v > 1.0)  return "text-emerald-400 font-bold";
  if (v > 0.3)  return "text-emerald-300";
  if (v > -0.2) return "text-gray-400";
  return "text-red-400";
}

function compositeColor(score: number, max: number): string {
  const pct = score / max;
  if (pct > 0.8)  return "text-emerald-400 font-bold";
  if (pct > 0.6)  return "text-yellow-300";
  if (pct > 0.4)  return "text-orange-400";
  return "text-red-400";
}

// ── PLAYER DATA (paste generated JSON here) ────────────────────────────
// In production, fetch from /api/rbc-model or import from a JSON file
// For now, data is imported via the rbc_data.json file you drop in /public
// and fetched client-side, OR you can paste the array directly.

// ── MAIN COMPONENT ─────────────────────────────────────────────────────
export default function RBCHeritageModel({ players }: { players: Player[] }) {
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries([
      ...STAT_COLS.map((c) => [c.key, c.defaultWeight]),
      ["Course True SG", COURSE_SG_WEIGHT_DEFAULT],
    ])
  );
  const [sortCol, setSortCol] = useState<"composite" | "name" | "trend" | "csg" | "salary">("composite");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState("");

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  function setWeight(key: string, val: number) {
    setWeights((prev) => ({ ...prev, [key]: Math.max(0, Math.min(100, val)) }));
  }

  // Composite score calculation
  function computeComposite(p: Player): number {
    let score = 0;
    const total = totalWeight || 1;

    STAT_COLS.forEach(({ key, rankKey }) => {
      const rank = p[rankKey as keyof Player] as number | null;
      const w = weights[key] ?? 0;
      if (rank != null && w > 0) {
        const pctScore = (N_PLAYERS + 1 - rank) / N_PLAYERS; // 1 = best
        score += pctScore * (w / total);
      }
    });

    // Course SG component
    const csg = p["Course True SG"];
    const csgW = weights["Course True SG"] ?? 0;
    if (csg != null && csgW > 0) {
      // Normalize CSG to 0-1: typical range is -2 to +3
      const csgNorm = Math.min(Math.max((csg + 2) / 5, 0), 1);
      score += csgNorm * (csgW / total);
    }

    return score;
  }

  const enriched = useMemo(() => {
    return players.map((p) => ({ ...p, composite: computeComposite(p) }));
  }, [players, weights, totalWeight]);

  const maxComposite = Math.max(...enriched.map((p) => p.composite));

  const filtered = useMemo(() => {
    let rows = enriched;
    if (filter.trim()) {
      const q = filter.toLowerCase();
      rows = rows.filter((p) => p["Player Name"].toLowerCase().includes(q));
    }
    rows = [...rows].sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      if (sortCol === "composite") { av = a.composite; bv = b.composite; }
      if (sortCol === "name")      { av = a["Player Name"]; bv = b["Player Name"]; }
      if (sortCol === "trend")     { av = a.TrendRank ?? 999; bv = b.TrendRank ?? 999; }
      if (sortCol === "csg")       { av = a["Course True SG"] ?? -99; bv = b["Course True SG"] ?? -99; }
      if (sortCol === "salary")    { av = a.Salary ?? 0; bv = b.Salary ?? 0; }
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortDir === "asc" ? av - (bv as number) : (bv as number) - av;
    });
    return rows;
  }, [enriched, filter, sortCol, sortDir]);

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  }

  const SortIcon = ({ col }: { col: typeof sortCol }) => (
    <span className="ml-0.5 opacity-50 text-[10px]">
      {sortCol === col ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );

  const weightOk = Math.abs(totalWeight - 100) < 0.5;

  return (
    <div className="bg-gray-950 text-gray-100 min-h-screen font-sans">
      {/* Header */}
      <div className="px-4 pt-6 pb-2">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">⛳</span>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Harbour Town Model
          </h1>
          <span className="text-xs bg-emerald-900/60 text-emerald-300 border border-emerald-700 px-2 py-0.5 rounded font-mono">
            RBC Heritage 2026
          </span>
        </div>
        <p className="text-xs text-gray-400 ml-9">
          Adjust category weights below — composite score auto-updates. Lower rank = better.
        </p>
      </div>

      {/* Weight Controls */}
      <div className="px-4 py-3">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Category Weights
            </span>
            <span
              className={`text-xs font-mono px-2 py-0.5 rounded border ${
                weightOk
                  ? "bg-emerald-900/50 text-emerald-300 border-emerald-700"
                  : "bg-red-900/50 text-red-300 border-red-700"
              }`}
            >
              Total: {totalWeight}% {weightOk ? "✓" : "← must = 100%"}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {STAT_COLS.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-400 font-medium leading-tight">{label}</label>
                <div className="flex items-center gap-1">
                  <input
                    type="range"
                    min={0}
                    max={50}
                    value={weights[key] ?? 0}
                    onChange={(e) => setWeight(key, Number(e.target.value))}
                    className="flex-1 h-1.5 accent-emerald-500 cursor-pointer"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={weights[key] ?? 0}
                    onChange={(e) => setWeight(key, Number(e.target.value))}
                    className="w-10 text-xs text-center bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-white focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-gray-500">%</span>
                </div>
              </div>
            ))}
            {/* Course True SG */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-400 font-medium leading-tight">Course SG</label>
              <div className="flex items-center gap-1">
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={weights["Course True SG"] ?? 0}
                  onChange={(e) => setWeight("Course True SG", Number(e.target.value))}
                  className="flex-1 h-1.5 accent-emerald-500 cursor-pointer"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={weights["Course True SG"] ?? 0}
                  onChange={(e) => setWeight("Course True SG", Number(e.target.value))}
                  className="w-10 text-xs text-center bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-white focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-gray-500">%</span>
              </div>
            </div>
          </div>

          {/* Reset button */}
          <button
            onClick={() =>
              setWeights(
                Object.fromEntries([
                  ...STAT_COLS.map((c) => [c.key, c.defaultWeight]),
                  ["Course True SG", COURSE_SG_WEIGHT_DEFAULT],
                ])
              )
            }
            className="mt-3 text-xs text-gray-500 hover:text-emerald-400 transition-colors underline underline-offset-2"
          >
            Reset to defaults
          </button>
        </div>
      </div>

      {/* Search + count */}
      <div className="px-4 pb-2 flex items-center gap-3">
        <input
          type="text"
          placeholder="Search player..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 w-48"
        />
        <span className="text-xs text-gray-500">{filtered.length} players</span>
      </div>

      {/* Table */}
      <div className="px-4 pb-8 overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[1200px]">
          <thead>
            {/* Section header row */}
            <tr>
              <th colSpan={2} className="bg-gray-900 border border-gray-700 text-gray-400 text-[10px] py-1 text-center uppercase tracking-wider">Player Info</th>
              <th colSpan={7} className="bg-emerald-950/80 border border-emerald-900 text-emerald-400 text-[10px] py-1 text-center uppercase tracking-wider">Harbour Town History</th>
              <th colSpan={8} className="bg-sky-950/80 border border-sky-900 text-sky-400 text-[10px] py-1 text-center uppercase tracking-wider">Weighted Stats (Field Rank)</th>
              <th colSpan={2} className="bg-purple-950/80 border border-purple-900 text-purple-400 text-[10px] py-1 text-center uppercase tracking-wider">Output</th>
            </tr>
            {/* Column headers */}
            <tr className="bg-gray-900">
              {/* Player Info */}
              <th
                className="border border-gray-700 px-2 py-2 text-left text-gray-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap"
                onClick={() => toggleSort("name")}
              >
                Player <SortIcon col="name" />
              </th>
              <th
                className="border border-gray-700 px-2 py-2 text-center text-gray-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap"
                onClick={() => toggleSort("trend")}
              >
                DG Rank <SortIcon col="trend" />
              </th>
              {/* HT History */}
              <th className="border border-gray-700 px-2 py-2 text-center text-emerald-300 font-semibold whitespace-nowrap">HT Rnds</th>
              <th className="border border-gray-700 px-2 py-2 text-center text-emerald-300 font-semibold whitespace-nowrap">Masters</th>
              <th className="border border-gray-700 px-2 py-2 text-center text-emerald-300 font-semibold whitespace-nowrap">2021</th>
              <th className="border border-gray-700 px-2 py-2 text-center text-emerald-300 font-semibold whitespace-nowrap">2022</th>
              <th className="border border-gray-700 px-2 py-2 text-center text-emerald-300 font-semibold whitespace-nowrap">2023</th>
              <th className="border border-gray-700 px-2 py-2 text-center text-emerald-300 font-semibold whitespace-nowrap">2024</th>
              <th
                className="border border-gray-700 px-2 py-2 text-center text-emerald-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap"
                onClick={() => toggleSort("csg")}
              >
                Course SG <SortIcon col="csg" />
              </th>
              {/* Weighted Stats */}
              {STAT_COLS.map(({ key, label }) => (
                <th
                  key={key}
                  className="border border-gray-700 px-2 py-2 text-center font-semibold whitespace-nowrap"
                  title={key}
                >
                  <div className="text-sky-300">{label}</div>
                  <div className="text-[9px] text-sky-600 font-normal">{weights[key]}%</div>
                </th>
              ))}
              {/* Output */}
              <th
                className="border border-gray-700 px-2 py-2 text-center text-purple-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap"
                onClick={() => toggleSort("composite")}
              >
                Score <SortIcon col="composite" />
              </th>
              <th className="border border-gray-700 px-2 py-2 text-center text-purple-300 font-semibold whitespace-nowrap">Rank</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              const isEven = i % 2 === 0;
              const rowBg = isEven ? "bg-gray-950" : "bg-gray-900/50";
              const composite = p.composite;
              // Model rank by composite
              const modelRank = [...enriched]
                .sort((a, b) => b.composite - a.composite)
                .findIndex((x) => x["Player Name"] === p["Player Name"]) + 1;

              return (
                <tr key={p["Player Name"]} className={`${rowBg} hover:bg-gray-800/60 transition-colors`}>
                  {/* Player */}
                  <td className="border border-gray-800 px-2 py-1.5 text-left font-medium text-white whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {p["Masters Group"] && mastersGroupBadge(p["Masters Group"])}
                      <span>{p["Player Name"]}</span>
                    </div>
                  </td>
                  {/* DG Rank */}
                  <td className="border border-gray-800 px-2 py-1.5 text-center text-gray-300">
                    {p.TrendRank ?? "—"}
                  </td>
                  {/* HT Rounds */}
                  <td className="border border-gray-800 px-2 py-1.5 text-center text-emerald-300">
                    {p["HT # Rounds"] ?? "—"}
                  </td>
                  {/* Masters 2026 */}
                  <td className={`border border-gray-800 px-2 py-1.5 text-center font-mono ${finishColor(p["Masters 2026"])}`}>
                    {p["Masters 2026"] || "—"}
                  </td>
                  {/* Year results */}
                  {(["2021","2022","2023","2024"] as const).map((yr) => (
                    <td key={yr} className={`border border-gray-800 px-2 py-1.5 text-center font-mono ${finishColor(p[yr])}`}>
                      {p[yr] || "—"}
                    </td>
                  ))}
                  {/* Course True SG */}
                  <td className={`border border-gray-800 px-2 py-1.5 text-center font-mono ${csgColor(p["Course True SG"])}`}>
                    {p["Course True SG"] != null ? p["Course True SG"].toFixed(3) : "—"}
                  </td>
                  {/* Weighted stat ranks */}
                  {STAT_COLS.map(({ rankKey }) => {
                    const rank = p[rankKey as keyof typeof p] as number | null;
                    return (
                      <td key={rankKey} className={`border border-gray-800 px-2 py-1.5 text-center font-mono ${rankColor(rank)}`}>
                        {rank ?? "—"}
                      </td>
                    );
                  })}
                  {/* Composite */}
                  <td className={`border border-gray-800 px-2 py-1.5 text-center font-mono font-bold ${compositeColor(composite, maxComposite)}`}>
                    {(composite * 100).toFixed(1)}
                  </td>
                  {/* Rank */}
                  <td className="border border-gray-800 px-2 py-1.5 text-center font-bold text-purple-300">
                    {modelRank}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="px-4 pb-6">
        <div className="flex flex-wrap gap-4 text-[10px] text-gray-500">
          <span>Rank colors: <span className="text-emerald-400">■</span> Top 25% &nbsp; <span className="text-yellow-300">■</span> 26-50% &nbsp; <span className="text-orange-400">■</span> 51-75% &nbsp; <span className="text-red-400">■</span> Bottom 25%</span>
          <span>Masters group: <span className="text-emerald-300">T6-15</span> = sweet spot &nbsp; <span className="text-red-300">T1-5</span> = historically weak at RBC &nbsp; <span className="text-sky-300">MC/DNP</span> = neutral</span>
        </div>
      </div>
    </div>
  );
}
