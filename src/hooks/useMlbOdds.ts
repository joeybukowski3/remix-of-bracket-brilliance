import { useEffect, useState } from "react";

export type MlbMoneyline = {
  away: { team: string; american: string | null; implied: number | null };
  home: { team: string; american: string | null; implied: number | null };
};

export type MlbOddsData = {
  fetchedAt: string;
  moneylines: Record<string, MlbMoneyline>; // key = "DET@TB"
  hrOdds: Record<string, { yes?: string | null; no?: string | null; impliedYes?: number | null }>;
  kOdds: Record<string, { line?: number | null; over?: string | null; under?: string | null; impliedOver?: number | null }>;
};

export function useMlbOdds() {
  const [data, setData] = useState<MlbOddsData | null>(null);

  useEffect(() => {
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    fetch(`${base}/data/mlb/mlb-odds.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {/* odds unavailable — silent */});
  }, []);

  return data;
}
