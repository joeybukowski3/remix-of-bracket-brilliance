import { useEffect, useMemo, useState } from "react";
import { formatSigned, type NflGuideTeamNormalized } from "@/lib/nfl/guideData";
import {
  calculateRankGap,
  getRankGapSignal,
  type SuperBowlMarketTeam,
} from "@/lib/nfl/superBowlMarkets";
import { SectionHeading, ValueCard } from "./NflDashboardUi";

type LoadStatus = "loading" | "success" | "error";

type SuperBowlOddsResponse = {
  updatedAt: string;
  stale?: boolean;
  teams: SuperBowlMarketTeam[];
};

export default function NflMarketValueSection({ team }: { team: NflGuideTeamNormalized }) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [response, setResponse] = useState<SuperBowlOddsResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

    fetch(`${base}/api/nfl/super-bowl-odds`, { signal: controller.signal })
      .then(async (result) => {
        const payload = await result.json().catch(() => null);
        if (!result.ok || !Array.isArray(payload?.teams)) {
          throw new Error(payload?.error ?? "Super Bowl market data is unavailable.");
        }
        return payload as SuperBowlOddsResponse;
      })
      .then((payload) => {
        setResponse(payload);
        setStatus("success");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      });

    return () => controller.abort();
  }, []);

  const market = useMemo(
    () => response?.teams.find((entry) => entry.abbr.toLowerCase() === team.abbr) ?? null,
    [response, team.abbr],
  );
  const rankGap = calculateRankGap(market?.marketRank ?? null, team.powerRank);
  const rankSignal = getRankGapSignal(rankGap);

  return (
    <section>
      <SectionHeading
        eyebrow="Odds & value"
        title="Market comparison"
        description="Win-total value comes from the preseason model. Super Bowl value compares the live prediction-market rank with the Joe Knows Ball power rank."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <ValueCard label="Win total" value={team.marketWinTotal?.toFixed(1) ?? "—"} />
        <ValueCard label="Projected wins" value={team.projectedWins.toFixed(1)} tone="blue" />
        <ValueCard
          label="Win-total edge"
          value={team.modelVsMarketGap == null ? "—" : formatSigned(team.modelVsMarketGap)}
          tone={team.modelVsMarketGap == null ? "neutral" : team.modelVsMarketGap > 0 ? "good" : team.modelVsMarketGap < 0 ? "bad" : "neutral"}
        />
        <ValueCard
          label="Super Bowl probability"
          value={status === "loading" ? "Loading…" : market?.probability == null ? "—" : `${market.probability.toFixed(1)}%`}
        />
        <ValueCard
          label="Market rank gap"
          value={rankGap == null ? "—" : `${formatSigned(rankGap, 0)} spots`}
          detail={rankGap == null ? "No matched market" : rankSignal}
          tone={rankGap == null ? "neutral" : rankGap > 1 ? "good" : rankGap < -1 ? "bad" : "neutral"}
        />
      </div>
      {status === "error" && (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Live Super Bowl market data is unavailable; the team model and win-total value remain available.
        </p>
      )}
      {response?.stale && (
        <p className="mt-3 text-xs font-bold text-amber-700">
          Showing the most recent cached Super Bowl market response.
        </p>
      )}
    </section>
  );
}
