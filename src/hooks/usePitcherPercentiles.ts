import { useEffect, useState } from "react";

export type PitcherPercentileEntry = {
  id: number;
  name: string;
  ip: number | null;
  era: number | null;
  whip: number | null;
  k9: number | null;
  kPct: number | null;
  bb9: number | null;
  bbPct: number | null;
  hr9: number | null;
  eraPct:   number | null;
  whipPct:  number | null;
  k9Pct:    number | null;
  kPctPct:  number | null;
  bb9Pct:   number | null;
  bbPctPct: number | null;
  hr9Pct:   number | null;
};

export type PitcherPercentilesData = {
  generatedAt: string;
  season: number;
  pitcherCount: number;
  leagueAvg: Record<string, number | null>;
  pitchers: Record<string, PitcherPercentileEntry>;
};

let _cache: PitcherPercentilesData | null = null;
let _promise: Promise<PitcherPercentilesData | null> | null = null;

async function fetchPercentiles(): Promise<PitcherPercentilesData | null> {
  if (_cache) return _cache;
  if (_promise) return _promise;
  _promise = fetch("/data/mlb/pitcher-percentiles.json", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { _cache = d; return d; })
    .catch(() => null);
  return _promise;
}

export function usePitcherPercentiles() {
  const [data, setData] = useState<PitcherPercentilesData | null>(_cache);

  useEffect(() => {
    if (_cache) { setData(_cache); return; }
    fetchPercentiles().then(setData);
  }, []);

  function getPercentiles(pitcherId: number | null | undefined): PitcherPercentileEntry | null {
    if (!pitcherId || !data) return null;
    return data.pitchers[String(pitcherId)] ?? null;
  }

  return { data, getPercentiles };
}
