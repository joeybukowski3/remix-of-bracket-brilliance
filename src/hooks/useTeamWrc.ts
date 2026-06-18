import { useCallback, useEffect, useState } from "react";
import type { MlbTeamWrcData, MlbTeamWrcEntry } from "@/lib/mlb/mlbTypes";

let _cache: MlbTeamWrcData | null = null;
let _promise: Promise<MlbTeamWrcData | null> | null = null;

async function fetchTeamWrc(): Promise<MlbTeamWrcData | null> {
  if (_cache) return _cache;
  if (_promise) return _promise;
  _promise = fetch("/data/mlb/team-wrc-plus.json", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { _cache = d; return d; })
    .catch(() => null);
  return _promise;
}

export function useTeamWrc() {
  const [data, setData] = useState<MlbTeamWrcData | null>(_cache);

  useEffect(() => {
    if (_cache) { setData(_cache); return; }
    fetchTeamWrc().then(setData);
  }, []);

  const getTeam = useCallback(
    (abbreviation: string): MlbTeamWrcEntry | null => {
      if (!data) return null;
      return data.teams.find((t) => t.abbreviation === abbreviation) ?? null;
    },
    [data],
  );

  return { data, getTeam };
}
