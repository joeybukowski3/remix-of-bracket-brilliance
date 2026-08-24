import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CFB_RESEARCH_NORMALIZED_DIR } from "../config/researchConfig";
import { computeIterativeAdjustment } from "../phase2/iterativeAdjustment";
import { buildSeasonObservations, loadSeasonGames, loadSeasonTeamGames } from "../phase2/loadTeamGameObservations";
import type { GameObservation } from "../phase2/types";
import type { PreseasonRawInputs } from "./types";
import type { CfbResearchTeamSeason } from "../types";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function loadTeamSeason(season: number): CfbResearchTeamSeason[] {
  return readJson<CfbResearchTeamSeason[]>(
    resolve(REPO_ROOT, CFB_RESEARCH_NORMALIZED_DIR, String(season), "team-season.json"),
  );
}

/**
 * Section 3: previous-season opponent-adjusted offense/defense, computed
 * with the SAME Iterative recurrence as Phase 2 but run on ONLY the prior
 * season's own games (a fresh, single-season network — teams' opponent
 * sets differ year to year, so seasons are never pooled into one network
 * here). Uses the Phase 2 "tuned" config (strength=1.0, iterations=20)
 * established as Phase 2's overall-best Iterative setting; YPP+PPP
 * (Phase 2's winning metric set — "V1") is used as the underlying metric,
 * standardized the same way Phase 2's compositeRating does.
 */
export function computePrevSeasonRatings(prevSeason: number): Map<string, { offense: number; defense: number }> {
  const teamGames = loadSeasonTeamGames(prevSeason);
  const games = loadSeasonGames(prevSeason);
  const teamIds = [...new Set(teamGames.map((g) => g.teamExternalId))];

  const metricResults = (["ypp", "ppp"] as const).map((metric) => {
    const observations: GameObservation[] = buildSeasonObservations(teamGames, games, metric, "NONE", "gameWeighted");
    return computeIterativeAdjustment(teamIds, observations, { strength: 1.0, iterations: 20, minimumGames: 1 });
  });

  // Standardize each metric's offense/defense across teams, then average —
  // identical blending convention to phase2/compositeRating.ts.
  const standardize = (values: (number | null)[]) => {
    const finite = values.filter((v): v is number => v !== null);
    const mean = finite.length === 0 ? 0 : finite.reduce((s, v) => s + v, 0) / finite.length;
    const variance = finite.length === 0 ? 1 : finite.reduce((s, v) => s + (v - mean) ** 2, 0) / finite.length;
    const std = Math.sqrt(variance) || 1;
    return (v: number | null) => (v === null ? null : (v - mean) / std);
  };

  const result = new Map<string, { offense: number; defense: number }>();
  const offenseStdFns = metricResults.map((r) => standardize(r.teams.map((t) => t.offense)));
  const defenseStdFns = metricResults.map((r) => standardize(r.teams.map((t) => t.defense)));

  for (const teamId of teamIds) {
    const offenseParts: number[] = [];
    const defenseParts: number[] = [];
    metricResults.forEach((r, i) => {
      const team = r.teams.find((t) => t.teamExternalId === teamId);
      const off = offenseStdFns[i](team?.offense ?? null);
      const def = defenseStdFns[i](team?.defense ?? null);
      if (off !== null) offenseParts.push(off);
      if (def !== null) defenseParts.push(def);
    });
    if (offenseParts.length === 0 || defenseParts.length === 0) continue;
    result.set(teamId, {
      offense: offenseParts.reduce((s, v) => s + v, 0) / offenseParts.length,
      defense: defenseParts.reduce((s, v) => s + v, 0) / defenseParts.length,
    });
  }
  return result;
}

/**
 * Loads raw preseason inputs for `season`, using ONLY: `season - 1`'s full
 * final rating (prior-year performance) and `season`'s own team-season.json
 * (returning production / talent — CFBD snapshots published preseason;
 * see Section 8 assumption noted in the Phase 3 final report). Returns one
 * row per FBS team present in `season`'s roster; missing fields stay null
 * (never imputed).
 */
export function loadPreseasonRawInputs(season: number): PreseasonRawInputs[] {
  const teamSeason = loadTeamSeason(season).filter((row) => (row.classification ?? "").toLowerCase() === "fbs");
  const prevRatings = computePrevSeasonRatings(season - 1);

  return teamSeason.map((row) => {
    const prev = prevRatings.get(row.externalTeamId);
    return {
      teamExternalId: row.externalTeamId,
      season,
      classification: row.classification,
      prevSeasonOffense: prev?.offense ?? null,
      prevSeasonDefense: prev?.defense ?? null,
      returningProductionOffense: row.returningProductionPercentPpa,
      talent: row.talentComposite,
    };
  });
}
