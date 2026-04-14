import { useMemo, useState } from "react";

interface Player {
  "Player Name": string;
  Salary: number | null;
  "HT # Rounds": number | null;
  "Course True SG": number | null;
  "2021": string | null;
  "2022": string | null;
  "2023": string | null;
  "2024": string | null;
  "2025": string | null;
  TrendRank: number | null;
  "Masters 2026": string | null;
  "SG: Approach the Green_rank": number | null;
  "SG: Around the Green_rank": number | null;
  "SG: Putting_rank": number | null;
  "Par 4 Scoring Average_rank": number | null;
  "Driving Accuracy %_rank": number | null;
  "Bogey Avoidance_rank": number | null;
  "Birdie or Better 125-150 yds_rank": number | null;
  "Birdie or Better <125 yds_rank": number | null;
}

type SortColumn =
  | "composite"
  | "rank"
  | "name"
  | "trend"
  | "rounds"
  | "course"
  | "approach"
  | "par4"
  | "accuracy"
  | "bogey"
  | "around"
  | "bb125150"
  | "putting"
  | "bb125";

const STAT_COLS = [
  { key: "SG: Approach the Green", label: "SG: Approach Rank", rankKey: "SG: Approach the Green_rank", defaultWeight: 20, sortCol: "approach" },
  { key: "Par 4 Scoring Average", label: "Par 4 Scoring Rank", rankKey: "Par 4 Scoring Average_rank", defaultWeight: 15, sortCol: "par4" },
  { key: "Driving Accuracy %", label: "Driving Accuracy Rank", rankKey: "Driving Accuracy %_rank", defaultWeight: 10, sortCol: "accuracy" },
  { key: "Bogey Avoidance", label: "Bogey Avoidance Rank", rankKey: "Bogey Avoidance_rank", defaultWeight: 10, sortCol: "bogey" },
  { key: "SG: Around the Green", label: "SG: Around the Green Rank", rankKey: "SG: Around the Green_rank", defaultWeight: 10, sortCol: "around" },
  { key: "Birdie or Better 125-150 yds", label: "Birdie or Better 125-150 Rank", rankKey: "Birdie or Better 125-150 yds_rank", defaultWeight: 10, sortCol: "bb125150" },
  { key: "SG: Putting", label: "SG: Putting Rank", rankKey: "SG: Putting_rank", defaultWeight: 10, sortCol: "putting" },
  { key: "Birdie or Better <125 yds", label: "Birdie or Better <125 Rank", rankKey: "Birdie or Better <125 yds_rank", defaultWeight: 10, sortCol: "bb125" },
] as const;

const COURSE_SG_WEIGHT_DEFAULT = 5;
const FALLBACK_FIELD_SIZE = 83;

function displayValue(value: string | number | null | undefined) {
  return value ?? "—";
}

function formatCompositeScore(score: number) {
  return score.toFixed(1);
}

function finishTone(value: string | null) {
  if (!value || value === "—") return "text-slate-400";
  if (value === "CUT") return "text-rose-500";
  try {
    const parsed = parseInt(value.replace("T", ""));
    if (parsed <= 5) return "text-[hsl(var(--success))] font-semibold";
    if (parsed <= 20) return "text-primary font-medium";
    return "text-slate-600";
  } catch {
    return "text-slate-600";
  }
}

function courseTone(value: number | null) {
  if (value == null) return "text-slate-400";
  if (value > 1.0) return "text-[hsl(var(--success))] font-semibold";
  if (value > 0.3) return "text-primary font-medium";
  if (value > -0.2) return "text-slate-500";
  return "text-rose-500";
}

function compositeTone(score: number, max: number) {
  const pct = max > 0 ? score / max : 0;
  if (pct > 0.8) return "text-[hsl(var(--success))] font-semibold";
  if (pct > 0.6) return "text-primary font-semibold";
  if (pct > 0.4) return "text-amber-600 font-semibold";
  return "text-rose-500 font-semibold";
}

function getHeatmapStyle(rank: number | null, maxRank: number) {
  if (rank == null || maxRank <= 1) {
    return {
      backgroundColor: "hsl(var(--secondary))",
      color: "hsl(var(--muted-foreground))",
    };
  }

  const normalized = (rank - 1) / Math.max(1, maxRank - 1);
  const hue = 140 - normalized * 140;
  const saturation = 42;
  const lightness = 96 - normalized * 10;
  const textHue = normalized < 0.5 ? 152 : normalized < 0.75 ? 215 : 8;

  return {
    backgroundColor: `hsl(${hue} ${saturation}% ${lightness}%)`,
    color: normalized < 0.5 ? `hsl(${textHue} 43% 32%)` : normalized < 0.75 ? `hsl(${textHue} 40% 38%)` : `hsl(${textHue} 58% 45%)`,
  };
}

export default function RBCHeritageModel({ players }: { players: Player[] }) {
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries([...STAT_COLS.map((c) => [c.key, c.defaultWeight]), ["Course True SG", COURSE_SG_WEIGHT_DEFAULT]]),
  );
  const [sortCol, setSortCol] = useState<SortColumn>("composite");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState("");

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  function setWeight(key: string, value: number) {
    setWeights((prev) => ({ ...prev, [key]: Math.max(0, Math.min(100, value)) }));
  }

  function computeComposite(player: Player) {
    let score = 0;
    const total = totalWeight || 1;

    STAT_COLS.forEach(({ key, rankKey }) => {
      const rank = player[rankKey as keyof Player] as number | null;
      const weight = weights[key] ?? 0;
      if (rank != null && weight > 0) {
        score += ((FALLBACK_FIELD_SIZE + 1 - rank) / FALLBACK_FIELD_SIZE) * (weight / total);
      }
    });

    const courseValue = player["Course True SG"];
    const courseWeight = weights["Course True SG"] ?? 0;
    if (courseValue != null && courseWeight > 0) {
      score += Math.min(Math.max((courseValue + 2) / 5, 0), 1) * (courseWeight / total);
    }

    return score;
  }

  const enriched = useMemo(() => players.map((player) => ({ ...player, composite: computeComposite(player) })), [players, weights, totalWeight]);

  const scoreboard = useMemo(() => {
    const sorted = [...enriched].sort((a, b) => {
      if (b.composite !== a.composite) return b.composite - a.composite;
      return a["Player Name"].localeCompare(b["Player Name"]);
    });

    let lastScore: number | null = null;
    let lastRank = 0;

    return sorted.map((player, index) => {
      const rank = lastScore !== null && player.composite === lastScore ? lastRank : index + 1;
      lastScore = player.composite;
      lastRank = rank;
      return { name: player["Player Name"], rank };
    });
  }, [enriched]);

  const rankLookup = useMemo(() => new Map(scoreboard.map((entry) => [entry.name, entry.rank])), [scoreboard]);
  const maxComposite = scoreboard.length > 0 ? Math.max(...scoreboard.map((entry) => enriched.find((player) => player["Player Name"] === entry.name)?.composite ?? 0)) : 1;

  const filtered = useMemo(() => {
    let rows = enriched.map((player) => ({ ...player, modelRank: rankLookup.get(player["Player Name"]) ?? scoreboard.length + 1 }));
    if (filter.trim()) {
      const q = filter.toLowerCase();
      rows = rows.filter((player) => player["Player Name"].toLowerCase().includes(q));
    }

    return [...rows].sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;

      if (sortCol === "composite") { av = a.composite; bv = b.composite; }
      if (sortCol === "rank") { av = a.modelRank; bv = b.modelRank; }
      if (sortCol === "name") { av = a["Player Name"]; bv = b["Player Name"]; }
      if (sortCol === "trend") { av = a.TrendRank ?? Number.MAX_SAFE_INTEGER; bv = b.TrendRank ?? Number.MAX_SAFE_INTEGER; }
      if (sortCol === "rounds") { av = a["HT # Rounds"] ?? -1; bv = b["HT # Rounds"] ?? -1; }
      if (sortCol === "course") { av = a["Course True SG"] ?? -99; bv = b["Course True SG"] ?? -99; }

      STAT_COLS.forEach((col) => {
        if (sortCol === col.sortCol) {
          av = (a[col.rankKey as keyof typeof a] as number | null) ?? Number.MAX_SAFE_INTEGER;
          bv = (b[col.rankKey as keyof typeof b] as number | null) ?? Number.MAX_SAFE_INTEGER;
        }
      });

      if (typeof av === "string") {
        return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      }

      return sortDir === "asc" ? av - (bv as number) : (bv as number) - av;
    });
  }, [enriched, filter, rankLookup, scoreboard.length, sortCol, sortDir]);

  const visibleRankMax = useMemo(() => {
    const ranks = filtered.flatMap((player) => [
      player.TrendRank,
      ...STAT_COLS.map((col) => player[col.rankKey as keyof typeof player] as number | null),
    ]).filter((rank): rank is number => typeof rank === "number");

    return ranks.length > 0 ? Math.max(...ranks) : FALLBACK_FIELD_SIZE;
  }, [filtered]);

  function toggleSort(column: SortColumn) {
    if (sortCol === column) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }

    setSortCol(column);
    setSortDir(column === "name" ? "asc" : "desc");
  }

  const weightOk = Math.abs(totalWeight - 100) < 0.5;

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <div className="mx-auto max-w-7xl px-4 pb-6 pt-8 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Harbour Town Model</h1>
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-primary">RBC Heritage 2026</span>
        </div>
        <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
          Adjust category weights below and the composite score updates automatically. Lower category ranks remain better, while score and field rank are generated from the weighted model output.
        </p>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-5 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Category Weights</span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${weightOk ? "border-[hsl(var(--success)/0.22)] bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))]" : "border-rose-200 bg-rose-50 text-rose-600"}`}>
              Total: {totalWeight}% {weightOk ? "OK" : "Adjust to 100%"}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {STAT_COLS.map(({ key, label }) => (
              <div key={key} className="rounded-2xl border border-border bg-secondary p-3">
                <label className="mb-2 block text-xs font-medium text-muted-foreground">{label}</label>
                <div className="flex items-center gap-2">
                  <input type="range" min={0} max={50} value={weights[key] ?? 0} onChange={(e) => setWeight(key, Number(e.target.value))} className="h-1.5 flex-1 accent-primary" />
                  <input type="number" min={0} max={100} value={weights[key] ?? 0} onChange={(e) => setWeight(key, Number(e.target.value))} className="w-14 rounded-lg border border-border bg-card px-2 py-1 text-center text-xs text-foreground focus:border-primary focus:outline-none" />
                </div>
              </div>
            ))}
            <div className="rounded-2xl border border-border bg-secondary p-3">
              <label className="mb-2 block text-xs font-medium text-muted-foreground">Course SG</label>
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={50} value={weights["Course True SG"] ?? 0} onChange={(e) => setWeight("Course True SG", Number(e.target.value))} className="h-1.5 flex-1 accent-primary" />
                <input type="number" min={0} max={100} value={weights["Course True SG"] ?? 0} onChange={(e) => setWeight("Course True SG", Number(e.target.value))} className="w-14 rounded-lg border border-border bg-card px-2 py-1 text-center text-xs text-foreground focus:border-primary focus:outline-none" />
              </div>
            </div>
          </div>

          <button
            onClick={() => setWeights(Object.fromEntries([...STAT_COLS.map((c) => [c.key, c.defaultWeight]), ["Course True SG", COURSE_SG_WEIGHT_DEFAULT]]))}
            className="mt-4 text-sm font-medium text-primary transition hover:text-primary/80"
          >
            Reset to defaults
          </button>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 pb-4 sm:px-6 lg:px-8">
        <input
          type="text"
          placeholder="Search player..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none sm:max-w-xs"
        />
        <span className="text-sm text-muted-foreground">{filtered.length} players</span>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:hidden">
          {filtered.map((player) => (
            <article key={player["Player Name"]} className="rounded-3xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{player["Player Name"]}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">TrendRank</p>
                  <div
                    className="mt-1 inline-flex rounded-lg px-2 py-1 text-sm font-medium"
                    style={getHeatmapStyle(player.TrendRank, visibleRankMax)}
                  >
                    {displayValue(player.TrendRank)}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-right">
                  <div className="rounded-2xl border border-border bg-secondary px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Score</div>
                    <div className={`mt-1 text-base ${compositeTone(player.composite, maxComposite)}`}>{formatCompositeScore(player.composite)}</div>
                  </div>
                  <div className="rounded-2xl border border-border bg-secondary px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Rank</div>
                    <div className="mt-1 text-base font-semibold text-primary">{player.modelRank}</div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-border bg-secondary p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">HT Rounds</div>
                  <div className="mt-1 text-foreground">{displayValue(player["HT # Rounds"])}</div>
                </div>
                <div className="rounded-2xl border border-border bg-secondary p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Course SG</div>
                  <div className={`mt-1 ${courseTone(player["Course True SG"])}`}>
                    {player["Course True SG"] != null ? player["Course True SG"].toFixed(3) : "—"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-secondary p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">2025</div>
                  <div className={`mt-1 ${finishTone(player["2025"])}`}>{player["2025"] || "—"}</div>
                </div>
                <div className="rounded-2xl border border-border bg-secondary p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Masters</div>
                  <div className={`mt-1 ${finishTone(player["Masters 2026"])}`}>{player["Masters 2026"] || "—"}</div>
                </div>
                {(["2024", "2023", "2022", "2021"] as const).map((year) => (
                  <div key={year} className="rounded-2xl border border-border bg-secondary p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{year}</div>
                    <div className={`mt-1 ${finishTone(player[year])}`}>{player[year] || "—"}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {STAT_COLS.map(({ label, rankKey }) => {
                  const rank = player[rankKey as keyof typeof player] as number | null;
                  return (
                    <div key={rankKey} className="rounded-xl border border-border bg-card px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
                      <div className="mt-1 inline-flex rounded-lg px-2 py-1 text-sm font-medium" style={getHeatmapStyle(rank, visibleRankMax)}>
                        {rank ?? "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>

        <div className="hidden overflow-hidden rounded-3xl border border-border bg-card shadow-sm md:block">
          <div className="overflow-x-auto">
            <table className="min-w-[1480px] w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="px-3 py-3 cursor-pointer" onClick={() => toggleSort("name")}>Player</th>
                  <th className="px-3 py-3 text-right cursor-pointer" onClick={() => toggleSort("composite")}>Score</th>
                  <th className="px-3 py-3 text-right cursor-pointer" onClick={() => toggleSort("rank")}>Rank</th>
                  <th className="px-3 py-3 text-center cursor-pointer" onClick={() => toggleSort("trend")}>TrendRank</th>
                  <th className="px-3 py-3 text-center cursor-pointer" onClick={() => toggleSort("rounds")}>HT # Rounds</th>
                  <th className="px-3 py-3 text-center">Cuts Last 5</th>
                  <th className="px-3 py-3 text-center">2025</th>
                  <th className="px-3 py-3 text-center">2024</th>
                  <th className="px-3 py-3 text-center">2023</th>
                  <th className="px-3 py-3 text-center">2022</th>
                  <th className="px-3 py-3 text-center">2021</th>
                  {STAT_COLS.map((col) => (
                    <th key={col.rankKey} className="px-3 py-3 text-center cursor-pointer" onClick={() => toggleSort(col.sortCol as SortColumn)}>
                      {col.label}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center cursor-pointer" onClick={() => toggleSort("course")}>Course True SG</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((player, index) => {
                  const cutsLast5 = [player["2025"], player["2024"], player["2023"], player["2022"], player["2021"]].filter((finish) => finish && finish !== "CUT").length;

                  return (
                    <tr key={player["Player Name"]} className={`border-b border-border/70 last:border-0 ${index % 2 === 0 ? "bg-card" : "bg-secondary/35"} hover:bg-secondary/60`}>
                      <td className="px-3 py-3 font-semibold text-foreground">{player["Player Name"]}</td>
                      <td className={`px-3 py-3 text-right tabular-nums ${compositeTone(player.composite, maxComposite)}`}>{formatCompositeScore(player.composite)}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold text-primary">{player.modelRank}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-flex min-w-[3rem] justify-center rounded-lg px-2 py-1 font-medium" style={getHeatmapStyle(player.TrendRank, visibleRankMax)}>
                          {player.TrendRank ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center tabular-nums text-foreground">{displayValue(player["HT # Rounds"])}</td>
                      <td className="px-3 py-3 text-center tabular-nums text-foreground">{cutsLast5}/5</td>
                      {(["2025", "2024", "2023", "2022", "2021"] as const).map((year) => (
                        <td key={year} className={`px-3 py-3 text-center tabular-nums ${finishTone(player[year])}`}>{player[year] || "—"}</td>
                      ))}
                      {STAT_COLS.map((col) => {
                        const rank = player[col.rankKey as keyof typeof player] as number | null;
                        return (
                          <td key={col.rankKey} className="px-3 py-3 text-center">
                            <span className="inline-flex min-w-[3rem] justify-center rounded-lg px-2 py-1 font-medium" style={getHeatmapStyle(rank, visibleRankMax)}>
                              {rank ?? "—"}
                            </span>
                          </td>
                        );
                      })}
                      <td className={`px-3 py-3 text-center tabular-nums ${courseTone(player["Course True SG"])}`}>
                        {player["Course True SG"] != null ? player["Course True SG"].toFixed(3) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 text-xs text-muted-foreground">
          Rank-based columns use a subtle heatmap: better ranks shade green, middle ranks stay neutral, and weaker ranks shift softly toward red.
        </div>
      </div>
    </div>
  );
}
