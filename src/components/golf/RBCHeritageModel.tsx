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

const STAT_COLS = [
  { key: "SG: Approach the Green", label: "SG: App", rankKey: "SG: Approach the Green_rank", defaultWeight: 20 },
  { key: "Par 4 Scoring Average", label: "Par 4", rankKey: "Par 4 Scoring Average_rank", defaultWeight: 15 },
  { key: "Driving Accuracy %", label: "Drive Acc", rankKey: "Driving Accuracy %_rank", defaultWeight: 10 },
  { key: "Bogey Avoidance", label: "Bogey Av", rankKey: "Bogey Avoidance_rank", defaultWeight: 10 },
  { key: "SG: Around the Green", label: "SG: ARG", rankKey: "SG: Around the Green_rank", defaultWeight: 10 },
  { key: "Birdie or Better 125-150 yds", label: "BB 125-150", rankKey: "Birdie or Better 125-150 yds_rank", defaultWeight: 10 },
  { key: "SG: Putting", label: "SG: Putt", rankKey: "SG: Putting_rank", defaultWeight: 10 },
  { key: "Birdie or Better <125 yds", label: "BB <125", rankKey: "Birdie or Better <125 yds_rank", defaultWeight: 10 },
] as const;

const COURSE_SG_WEIGHT_DEFAULT = 5;
const N_PLAYERS = 83;

function rankTone(rank: number | null, n = N_PLAYERS): string {
  if (rank == null) return "text-slate-400";
  const pct = rank / n;
  if (pct <= 0.25) return "text-[#2e7d5b] font-semibold";
  if (pct <= 0.5) return "text-[#3b6ea5]";
  if (pct <= 0.75) return "text-amber-600";
  return "text-rose-500";
}

function finishTone(val: string | null): string {
  if (!val || val === "—") return "text-slate-400";
  if (val === "CUT") return "text-rose-500";
  try {
    const n = parseInt(val.replace("T", ""));
    if (n <= 5) return "text-[#2e7d5b] font-semibold";
    if (n <= 20) return "text-[#3b6ea5]";
    return "text-slate-600";
  } catch {
    return "text-slate-600";
  }
}

function courseTone(v: number | null): string {
  if (v == null) return "text-slate-400";
  if (v > 1.0) return "text-[#2e7d5b] font-semibold";
  if (v > 0.3) return "text-[#3b6ea5]";
  if (v > -0.2) return "text-slate-500";
  return "text-rose-500";
}

function compositeTone(score: number, max: number): string {
  const pct = score / max;
  if (pct > 0.8) return "text-[#2e7d5b] font-semibold";
  if (pct > 0.6) return "text-[#3b6ea5] font-semibold";
  if (pct > 0.4) return "text-amber-600 font-semibold";
  return "text-rose-500 font-semibold";
}

function displayValue(value: string | number | null | undefined) {
  return value ?? "—";
}

export default function RBCHeritageModel({ players }: { players: Player[] }) {
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries([...STAT_COLS.map((c) => [c.key, c.defaultWeight]), ["Course True SG", COURSE_SG_WEIGHT_DEFAULT]]),
  );
  const [sortCol, setSortCol] = useState<"composite" | "name" | "trend" | "csg" | "salary">("composite");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState("");

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  function setWeight(key: string, val: number) {
    setWeights((prev) => ({ ...prev, [key]: Math.max(0, Math.min(100, val)) }));
  }

  function computeComposite(p: Player): number {
    let score = 0;
    const total = totalWeight || 1;

    STAT_COLS.forEach(({ key, rankKey }) => {
      const rank = p[rankKey as keyof Player] as number | null;
      const w = weights[key] ?? 0;
      if (rank != null && w > 0) {
        score += ((N_PLAYERS + 1 - rank) / N_PLAYERS) * (w / total);
      }
    });

    const csg = p["Course True SG"];
    const csgWeight = weights["Course True SG"] ?? 0;
    if (csg != null && csgWeight > 0) {
      score += Math.min(Math.max((csg + 2) / 5, 0), 1) * (csgWeight / total);
    }

    return score;
  }

  const enriched = useMemo(() => players.map((p) => ({ ...p, composite: computeComposite(p) })), [players, weights, totalWeight]);
  const rankedPlayers = useMemo(() => [...enriched].sort((a, b) => b.composite - a.composite), [enriched]);
  const maxComposite = rankedPlayers[0]?.composite ?? 1;

  const filtered = useMemo(() => {
    let rows = enriched;
    if (filter.trim()) {
      const q = filter.toLowerCase();
      rows = rows.filter((p) => p["Player Name"].toLowerCase().includes(q));
    }

    return [...rows].sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      if (sortCol === "composite") { av = a.composite; bv = b.composite; }
      if (sortCol === "name") { av = a["Player Name"]; bv = b["Player Name"]; }
      if (sortCol === "trend") { av = a.TrendRank ?? 999; bv = b.TrendRank ?? 999; }
      if (sortCol === "csg") { av = a["Course True SG"] ?? -99; bv = b["Course True SG"] ?? -99; }
      if (sortCol === "salary") { av = a.Salary ?? 0; bv = b.Salary ?? 0; }
      if (typeof av === "string") {
        return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      }
      return sortDir === "asc" ? av - (bv as number) : (bv as number) - av;
    });
  }, [enriched, filter, sortCol, sortDir]);

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  const weightOk = Math.abs(totalWeight - 100) < 0.5;

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <div className="mx-auto max-w-7xl px-4 pb-6 pt-8 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Harbour Town Model</h1>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-primary">RBC Heritage 2026</span>
        </div>
        <p className="max-w-2xl text-sm leading-7 text-slate-600">
          Adjust category weights below and the composite score updates automatically. The model is tuned to keep the board readable on both desktop and mobile.
        </p>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-5 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Category Weights</span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${weightOk ? "border-emerald-200 bg-emerald-50 text-[#2e7d5b]" : "border-rose-200 bg-rose-50 text-rose-600"}`}>
              Total: {totalWeight}% {weightOk ? "OK" : "Adjust to 100%"}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {STAT_COLS.map(({ key, label }) => (
              <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <label className="mb-2 block text-xs font-medium text-slate-600">{label}</label>
                <div className="flex items-center gap-2">
                  <input type="range" min={0} max={50} value={weights[key] ?? 0} onChange={(e) => setWeight(key, Number(e.target.value))} className="h-1.5 flex-1 accent-primary" />
                  <input type="number" min={0} max={100} value={weights[key] ?? 0} onChange={(e) => setWeight(key, Number(e.target.value))} className="w-14 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-xs text-slate-700 focus:border-primary focus:outline-none" />
                </div>
              </div>
            ))}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <label className="mb-2 block text-xs font-medium text-slate-600">Course SG</label>
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={50} value={weights["Course True SG"] ?? 0} onChange={(e) => setWeight("Course True SG", Number(e.target.value))} className="h-1.5 flex-1 accent-primary" />
                <input type="number" min={0} max={100} value={weights["Course True SG"] ?? 0} onChange={(e) => setWeight("Course True SG", Number(e.target.value))} className="w-14 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-xs text-slate-700 focus:border-primary focus:outline-none" />
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
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary focus:outline-none sm:max-w-xs"
        />
        <span className="text-sm text-slate-500">{filtered.length} players</span>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:hidden">
          {filtered.map((p) => {
            const composite = p.composite;
            const modelRank = rankedPlayers.findIndex((x) => x["Player Name"] === p["Player Name"]) + 1;
            return (
              <article key={p["Player Name"]} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{p["Player Name"]}</h2>
                    <p className="mt-1 text-sm text-slate-500">DG Rank: {displayValue(p.TrendRank)}</p>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg ${compositeTone(composite, maxComposite)}`}>{(composite * 100).toFixed(1)}</div>
                    <div className="text-xs font-semibold text-primary">#{modelRank}</div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Course SG</div>
                    <div className={`mt-1 ${courseTone(p["Course True SG"])}`}>{p["Course True SG"] != null ? p["Course True SG"].toFixed(3) : "—"}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">HT Rounds</div>
                    <div className="mt-1 text-slate-700">{displayValue(p["HT # Rounds"])}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Masters</div>
                    <div className={`mt-1 ${finishTone(p["Masters 2026"])}`}>{p["Masters 2026"] || "—"}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Recent HT</div>
                    <div className="mt-1 text-slate-700">{[p["2024"], p["2023"], p["2022"], p["2021"]].filter(Boolean).join(" / ") || "—"}</div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {STAT_COLS.map(({ label, rankKey }) => {
                    const rank = p[rankKey as keyof Player] as number | null;
                    return (
                      <div key={rankKey} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
                        <div className={`mt-1 text-sm ${rankTone(rank)}`}>{rank ?? "—"}</div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>

        <div className="hidden overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm md:block">
          <div className="overflow-x-auto">
            <table className="min-w-[1080px] w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-3 py-3 cursor-pointer" onClick={() => toggleSort("composite")}>Score / Rank</th>
                  <th className="px-3 py-3 cursor-pointer" onClick={() => toggleSort("name")}>Player</th>
                  <th className="px-3 py-3 cursor-pointer" onClick={() => toggleSort("trend")}>DG Rank</th>
                  <th className="px-3 py-3">HT Rnds</th>
                  <th className="px-3 py-3">Masters</th>
                  <th className="px-3 py-3">2021</th>
                  <th className="px-3 py-3">2022</th>
                  <th className="px-3 py-3">2023</th>
                  <th className="px-3 py-3">2024</th>
                  <th className="px-3 py-3 cursor-pointer" onClick={() => toggleSort("csg")}>Course SG</th>
                  {STAT_COLS.map(({ key, label }) => (
                    <th key={key} className="px-3 py-3 text-center">
                      <div>{label}</div>
                      <div className="mt-1 text-[10px] font-medium normal-case tracking-normal text-slate-400">{weights[key]}%</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, index) => {
                  const composite = p.composite;
                  const modelRank = rankedPlayers.findIndex((x) => x["Player Name"] === p["Player Name"]) + 1;
                  return (
                    <tr key={p["Player Name"]} className={`border-b border-slate-100 last:border-0 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/60"} hover:bg-slate-50`}>
                      <td className="px-3 py-3">
                        <div className={compositeTone(composite, maxComposite)}>{(composite * 100).toFixed(1)}</div>
                        <div className="text-xs font-semibold text-primary">#{modelRank}</div>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-900">{p["Player Name"]}</td>
                      <td className="px-3 py-3 text-slate-600">{displayValue(p.TrendRank)}</td>
                      <td className="px-3 py-3 text-slate-600">{displayValue(p["HT # Rounds"])}</td>
                      <td className={`px-3 py-3 ${finishTone(p["Masters 2026"])}`}>{p["Masters 2026"] || "—"}</td>
                      {(["2021", "2022", "2023", "2024"] as const).map((yr) => (
                        <td key={yr} className={`px-3 py-3 ${finishTone(p[yr])}`}>{p[yr] || "—"}</td>
                      ))}
                      <td className={`px-3 py-3 ${courseTone(p["Course True SG"])}`}>{p["Course True SG"] != null ? p["Course True SG"].toFixed(3) : "—"}</td>
                      {STAT_COLS.map(({ rankKey }) => {
                        const rank = p[rankKey as keyof Player] as number | null;
                        return <td key={rankKey} className={`px-3 py-3 text-center ${rankTone(rank)}`}>{rank ?? "—"}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          Rank colors: <span className="text-[#2e7d5b]">top quartile</span>, <span className="text-[#3b6ea5]">upper middle</span>, <span className="text-amber-600">lower middle</span>, <span className="text-rose-500">bottom quartile</span>.
        </div>
      </div>
    </div>
  );
}
