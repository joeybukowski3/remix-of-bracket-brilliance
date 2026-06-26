import { useEffect, useState } from "react";
import type { NumerologyDailyData } from "@/types/mlbNumerology";

type Match = { field?: string; value?: number; root?: number; label?: string };
type Player = Record<string, unknown> & {
  playerName?: string;
  team?: string;
  numerologyScore?: number;
  matches?: Match[];
  exactNumberMatches?: Match[];
  rootNumberMatches?: Match[];
};

type ExtendedData = NumerologyDailyData & {
  exactNumberMatches?: Player[];
  rootNumberMatches?: Player[];
  bestAvailable?: Player[];
};

function getEtDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeName(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function allMatches(player: Player) {
  return [
    ...(Array.isArray(player.matches) ? player.matches : []),
    ...(Array.isArray(player.exactNumberMatches) ? player.exactNumberMatches : []),
    ...(Array.isArray(player.rootNumberMatches) ? player.rootNumberMatches : []),
  ].filter((match, index, matches) =>
    matches.findIndex((other) => other.field === match.field && other.label === match.label) === index,
  );
}

function fieldPriority(field: unknown) {
  const order = ["personalDay", "jersey", "birthDay", "lifePath", "age", "battingOrder", "expression"];
  const index = order.indexOf(String(field ?? ""));
  return index === -1 ? 99 : index;
}

function transformNumerologyData(input: NumerologyDailyData): NumerologyDailyData {
  const data = input as ExtendedData;
  const compound = Number(data.dailyProfile?.universalDayCompound ?? data.dailyProfile?.universalDayRawSum ?? 0);
  const root = Number(data.dailyProfile?.universalDayRoot ?? 0);
  const merged = new Map<string, Player>();

  const add = (player: Player) => {
    const key = `${normalizeName(player.playerName)}|${String(player.team ?? "")}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...player });
      return;
    }
    merged.set(key, {
      ...existing,
      ...player,
      matches: [...(existing.matches ?? []), ...(player.matches ?? [])],
      exactNumberMatches: [...(existing.exactNumberMatches ?? []), ...(player.exactNumberMatches ?? [])],
      rootNumberMatches: [...(existing.rootNumberMatches ?? []), ...(player.rootNumberMatches ?? [])],
    });
  };

  (data.exactNumberMatches ?? []).forEach(add);
  (data.rootNumberMatches ?? []).forEach(add);

  const classified = [...merged.values()].map((player) => {
    const matches = allMatches(player);
    const directCompound = matches.filter((match) => Number(match.value) === compound);
    const directRoot = matches.filter((match) => Number(match.value) === root);
    const strongFamily = matches.filter((match) =>
      Number(match.root) === root &&
      Number(match.value) !== compound &&
      Number(match.value) !== root &&
      ["personalDay", "jersey", "birthDay", "lifePath", "age"].includes(String(match.field ?? "")),
    );
    return { player, matches, directCompound, directRoot, strongFamily };
  });

  const sortDirect = (a: typeof classified[number], b: typeof classified[number]) => {
    if (b.directCompound.length !== a.directCompound.length) return b.directCompound.length - a.directCompound.length;
    if (b.directRoot.length !== a.directRoot.length) return b.directRoot.length - a.directRoot.length;
    const aBest = Math.min(...a.matches.map((match) => fieldPriority(match.field)), 99);
    const bBest = Math.min(...b.matches.map((match) => fieldPriority(match.field)), 99);
    if (aBest !== bBest) return aBest - bBest;
    if (b.strongFamily.length !== a.strongFamily.length) return b.strongFamily.length - a.strongFamily.length;
    return Number(b.player.numerologyScore ?? 0) - Number(a.player.numerologyScore ?? 0);
  };

  const directCompound = classified.filter((entry) => entry.directCompound.length > 0).sort(sortDirect);
  const directRoot = classified.filter((entry) => entry.directCompound.length === 0 && entry.directRoot.length > 0).sort(sortDirect);
  const strongFamily = classified.filter((entry) => entry.directCompound.length === 0 && entry.directRoot.length === 0 && entry.strongFamily.length > 0).sort(sortDirect);
  const used = new Set([...directCompound, ...directRoot, ...strongFamily].map((entry) => `${normalizeName(entry.player.playerName)}|${String(entry.player.team ?? "")}`));
  const highScore = classified
    .filter((entry) => !used.has(`${normalizeName(entry.player.playerName)}|${String(entry.player.team ?? "")}`))
    .sort((a, b) => Number(b.player.numerologyScore ?? 0) - Number(a.player.numerologyScore ?? 0));

  return {
    ...data,
    exactNumberMatches: directCompound.map((entry) => ({ ...entry.player, matches: entry.directCompound })),
    rootNumberMatches: [...directRoot, ...strongFamily].map((entry) => ({ ...entry.player, matches: [...entry.directRoot, ...entry.strongFamily] })),
    bestAvailable: [...strongFamily, ...highScore].slice(0, 20).map((entry) => entry.player),
  } as NumerologyDailyData;
}

function replaceVisibleLabels() {
  const replacements: Array<[string, string]> = [
    ["Baseball Model Stats", "Model Rating"],
    ["Baseball context", "Model Rating"],
    ["Exact Number Matches", "Direct Compound / Master Matches"],
    ["Reduced-Root Matches", "Direct Root & Strong Family Matches"],
    ["Direct daily-number matches", "Exact daily compound/master matches"],
    ["Reduced-root matches", "Exact root and strong root-family matches"],
  ];

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.nodeValue ?? "";
    let next = text;
    for (const [from, to] of replacements) next = next.replaceAll(from, to);
    if (next !== text) node.nodeValue = next;
    node = walker.nextNode();
  }
}

interface UseMLBNumerologyResult {
  data: NumerologyDailyData | null;
  loading: boolean;
  error: string | null;
  isStale: boolean;
}

export function useMLBNumerology(): UseMLBNumerologyResult {
  const [data, setData] = useState<NumerologyDailyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/data/mlb/numerology-daily.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((json: NumerologyDailyData) => {
        if (!cancelled) {
          setData(transformNumerologyData(json));
          setError(null);
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(reason.message ?? "Failed to load numerology data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    replaceVisibleLabels();
    const observer = new MutationObserver(replaceVisibleLabels);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [data]);

  const isStale = data != null && data.date !== getEtDate();
  return { data, loading, error, isStale };
}
