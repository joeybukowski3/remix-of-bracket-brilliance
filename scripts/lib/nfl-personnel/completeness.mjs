import { COACHING_ROLES } from "./schema.mjs";
import { metricIsComplete } from "./returning-production.mjs";

const REQUIRED_OFFENSIVE_PRODUCTION = ["offensiveSnaps"];
const REQUIRED_DEFENSIVE_PRODUCTION = ["defensiveSnaps"];

function daysBetween(a, b) {
  return Math.floor((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

function hasCriticalConflict(dataset, team) {
  const conflicts = [...(dataset?.conflicts ?? []), ...(team?.conflicts ?? [])];
  return conflicts.some((conflict) => conflict?.severity === "critical");
}

function sourceFreshnessFailures(dataset, { asOfDate, maxSourceAgeDays }) {
  if (!maxSourceAgeDays || !asOfDate) return [];
  return (dataset.sources ?? [])
    .filter((source) => source.sourceUpdatedAt && daysBetween(asOfDate, source.sourceUpdatedAt) > maxSourceAgeDays)
    .map((source) => `${source.sourceId} is older than ${maxSourceAgeDays} days`);
}

function hasItemProvenance(team) {
  const qbRefs = team.quarterbackContinuity?.sourceRefs ?? [];
  const coachRefs = COACHING_ROLES.flatMap((role) => team.coachingContinuity?.[role]?.sourceRefs ?? []);
  const txRefs = (team.transactions ?? []).flatMap((tx) => tx.sourceRefs ?? []);
  const injuryRefs = (team.injuryReturns ?? []).flatMap((injury) => injury.sourceRefs ?? []);
  const productionRefs = Object.values(team.returningProduction?.metrics ?? {}).flatMap((metric) => metric?.sourceRefs ?? []);
  return [...qbRefs, ...coachRefs, ...txRefs, ...injuryRefs, ...productionRefs].every((ref) => ref?.sourceId);
}

export function evaluatePersonnelCompleteness(dataset, teamsJson, options = {}) {
  const canonicalTeams = Array.isArray(teamsJson?.teams) ? teamsJson.teams : [];
  const canonicalIds = new Set(canonicalTeams.map((team) => team.id));
  const teamRecords = dataset?.teams ?? [];
  const byTeamId = new Map(teamRecords.map((team) => [team.teamId, team]));
  const mandatoryFailures = [];
  const advisoryWarnings = [];
  const perTeamFailures = {};

  if (teamRecords.length !== 32 || canonicalTeams.some((team) => !byTeamId.has(team.id))) {
    mandatoryFailures.push(`expected all 32 canonical teams, received ${teamRecords.length}`);
  }

  for (const teamId of canonicalIds) {
    const team = byTeamId.get(teamId);
    const failures = [];
    if (!team) {
      perTeamFailures[teamId] = ["team missing"];
      continue;
    }
    if (!["returning_starter", "new_starter", "open_competition", "rookie_candidate", "veteran_acquisition"].includes(team.quarterbackContinuity?.status)) {
      failures.push("QB continuity is not known or explicitly open competition");
    }
    for (const role of COACHING_ROLES) {
      if (!["returning", "new", "changed_role", "vacancy"].includes(team.coachingContinuity?.[role]?.status)) {
        failures.push(`${role} coverage incomplete`);
      }
    }
    if (team.completeness?.transactionsThroughCutoff !== true) failures.push("transaction cutoff coverage incomplete");
    for (const key of REQUIRED_OFFENSIVE_PRODUCTION) {
      if (!metricIsComplete(team.returningProduction?.metrics?.[key])) failures.push(`returning offensive production incomplete: ${key}`);
    }
    for (const key of REQUIRED_DEFENSIVE_PRODUCTION) {
      if (!metricIsComplete(team.returningProduction?.metrics?.[key])) failures.push(`returning defensive production incomplete: ${key}`);
    }
    if (!hasItemProvenance(team)) failures.push("item-level provenance incomplete");
    if (hasCriticalConflict(dataset, team)) failures.push("unresolved critical conflict");

    if ((team.injuryReturns ?? []).length === 0) advisoryWarnings.push(`${teamId}: injury-return evidence unavailable`);
    if (!metricIsComplete(team.returningProduction?.metrics?.pressures)) advisoryWarnings.push(`${teamId}: pressure data incomplete`);
    if (!metricIsComplete(team.returningProduction?.metrics?.defensiveBackSnaps)) advisoryWarnings.push(`${teamId}: secondary snap breakdown incomplete`);
    if (Object.values(team.coachingContinuity ?? {}).some((coach) => coach?.schemeChange == null)) advisoryWarnings.push(`${teamId}: scheme-change evidence incomplete`);
    if ((team.transactions ?? []).some((tx) => tx.expectedRole == null)) advisoryWarnings.push(`${teamId}: expected-role coverage incomplete`);

    if (failures.length) perTeamFailures[teamId] = failures;
  }

  const freshnessFailures = sourceFreshnessFailures(dataset, options);
  mandatoryFailures.push(...freshnessFailures);

  const summary = {
    targetSeason: dataset?.targetSeason ?? null,
    teamCount: teamRecords.length,
    criticalConflictCount: [...(dataset?.conflicts ?? []), ...teamRecords.flatMap((team) => team.conflicts ?? [])].filter((conflict) => conflict?.severity === "critical").length,
    advisoryWarningCount: advisoryWarnings.length,
    mandatoryFailureCount: mandatoryFailures.length + Object.values(perTeamFailures).reduce((sum, failures) => sum + failures.length, 0),
  };

  return {
    readyForScoring: summary.mandatoryFailureCount === 0,
    mandatoryFailures,
    advisoryWarnings: [...new Set(advisoryWarnings)].sort(),
    perTeamFailures,
    summary,
  };
}
