/** Read-only WU8 generated-lineup audit. Optional --output writes this report only. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { parseDraftKingsNflClassicCsv } from "../src/lib/nfl/dfs/draftKingsCsv";
import { buildDfsSlateAnalysis, enrichDfsSlateAnalysis } from "../src/lib/nfl/dfs/slateAnalyzer";
import { assessDfsSlateCompatibility } from "../src/lib/nfl/dfs/artifactCompatibility";
import { assessDfsResearch } from "../src/lib/nfl/dfs/research";
import { resolveOffensiveIdentity, isDraftKingsOffensiveRow } from "../src/lib/nfl/dfs/identity";
import { attachDfsLineupContext, lineupContextSchema } from "../src/lib/nfl/dfs/lineupContext";
import { weeklyFantasyProjectionProductionArtifactSchema } from "../src/lib/fantasy/weekly/projections/production/artifactContract";
import { weeklyFantasyResearchArtifactSchema } from "../src/lib/fantasy/weekly/researchArtifact";
import { generateLineups } from "../src/lib/nfl/dfs/optimizer/generateLineups";
import { LINEUP_STRATEGY_WEIGHTS } from "../src/lib/nfl/dfs/policies/lineupObjectivesV1";
import type { CanonicalNflTeam, NflGameRecord } from "../src/lib/nfl/standings";

const { values } = parseArgs({
  options: {
    csv: { type: "string" },
    context: { type: "string", default: "public/data/nfl/dfs/2026/week-01.json" },
    "as-of": { type: "string", default: "2026-09-07T23:55:00Z" },
    output: { type: "string" },
  },
});
if (!values.csv) throw new Error("--csv required");

const text = readFileSync(values.csv, "utf8");
const parsed = parseDraftKingsNflClassicCsv(text);
if (!parsed.accepted) throw new Error(JSON.stringify(parsed.diagnostics));

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const projectionArtifact = weeklyFantasyProjectionProductionArtifactSchema.parse(
  read("public/data/fantasy/projections/2026/week-01.json"),
);
const researchArtifact = weeklyFantasyResearchArtifactSchema.parse(
  read("public/data/fantasy/weekly-research/2026/week-01.json"),
);
const projections = Object.values(projectionArtifact.rows).flat();
const games = read("public/data/nfl/2026/games.json").games as NflGameRecord[];
const teams = read("public/data/nfl/teams.json").teams as CanonicalNflTeam[];

const baseline = buildDfsSlateAnalysis({ dkRows: parsed.rows, projectionRows: projections, teams });
const compatibility = assessDfsSlateCompatibility({
  dkRows: parsed.rows,
  selectedSeason: 2026,
  selectedWeek: 1,
  projectionArtifact,
  researchArtifact,
  canonicalGames: games,
  offensiveIdentityResolutions: parsed.rows.filter(isDraftKingsOffensiveRow).map((row) => resolveOffensiveIdentity(row, projections)),
});
const enriched = enrichDfsSlateAnalysis(
  baseline,
  assessDfsResearch(projections, researchArtifact, 2026, 1),
  compatibility,
);
const analysis = attachDfsLineupContext(enriched, lineupContextSchema.parse(read(values.context!)), {
  season: 2026,
  week: 1,
  asOf: values["as-of"]!,
});

// Regression guard: WU8 must not change any pre-existing analyzer field or hide a row.
const unchanged = baseline.rows.every((before) => {
  const after = analysis.rows.find((row) => row.dkId === before.dkId)!;
  return Object.keys(before).every((key) => JSON.stringify(before[key]) === JSON.stringify(after[key]));
});
if (!unchanged || baseline.rows.length !== analysis.rows.length) throw new Error("Baseline metric/visibility regression");

const first = generateLineups({ rows: analysis.rows, projectionRows: projections, asOf: values["as-of"]! });
const second = generateLineups({ rows: analysis.rows, projectionRows: projections, asOf: values["as-of"]! });
const deterministic =
  JSON.stringify(first.lineups.map((lineup) => lineup.slots.map((slot) => slot.dkId))) ===
  JSON.stringify(second.lineups.map((lineup) => lineup.slots.map((slot) => slot.dkId)));

const f = (value: number | null | undefined, digits = 2) => (value == null ? "N/A" : value.toFixed(digits));
const lines: string[] = [
  "# WU8 Week 1 Generated-Lineup Validation",
  "",
  `Audit as-of: ${values["as-of"]}. Input: ${values.csv}.`,
  `CSV SHA-256: ${createHash("sha256").update(text).digest("hex")}.`,
  `Uploaded rows: ${baseline.rows.length}; all baseline fields and rows preserved: ${unchanged}.`,
  `Salary cap: $${first.salaryCap.toLocaleString("en-US")} (${first.rulesVersion}). Objective: ${first.objectiveVersion}.`,
  `Status: ${first.status}. Deterministic across two runs: ${deterministic}. Total generation time: ${first.elapsedMs} ms.`,
  "",
  "## Candidate Pool",
  "",
  `Offense eligible ${first.candidatePool.offenseEligible}; ineligible ${first.candidatePool.offenseIneligible}; unknown ${first.candidatePool.offenseUnknown}.`,
  `DST with usable WU6C context ${first.candidatePool.dstWithUsableContext}; without ${first.candidatePool.dstWithoutUsableContext}.`,
  `Scorable candidates by position: ${Object.entries(first.candidatePool.byPosition).map(([k, v]) => `${k} ${v}`).join("; ")}.`,
];
if (first.warnings.length > 0) lines.push("", ...first.warnings.map((warning) => `- ${warning}`));

for (const lineup of first.lineups) {
  lines.push(
    "",
    `## ${lineup.strategyLabel}`,
    "",
    `Weights: ${Object.entries(LINEUP_STRATEGY_WEIGHTS[lineup.strategy]).map(([k, v]) => `${k} ${Math.round((v as number) * 100)}%`).join("; ")}.`,
    `Salary used $${lineup.salaryUsed.toLocaleString("en-US")}; remaining $${lineup.salaryRemaining.toLocaleString("en-US")}.`,
    `JKB offense projected subtotal ${f(lineup.jkbOffenseProjectionSubtotal)} over ${lineup.jkbOffensePlayerCount} offensive slots (DST has no JKB projection).`,
    `DK Avg PPG benchmark subtotal ${f(lineup.dkBenchmarkSubtotal)} over ${lineup.dkBenchmarkPlayerCount} slots (DraftKings benchmark, not consensus).`,
    `Objective score ${f(lineup.objectiveScore, 3)}. Distinct games ${lineup.constraintStatus.distinctGames}. FLEX: ${lineup.slots.find((slot) => slot.slot === "FLEX")?.position}.`,
    `Constraints: ${Object.entries(lineup.constraintStatus).map(([k, v]) => `${k}=${v}`).join("; ")}.`,
    "",
    "| Slot | Player | Team | Opp | Salary | JKB Proj | DK Avg PPG | Rank Diff | Role | Matchup pct | Strategy score | Coverage |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |",
  );
  for (const slot of lineup.slots) {
    const matchup = slot.strategyScore.components.find((entry) => entry.component === "matchup");
    const role = slot.roleContext ? `${slot.roleContext.roleClass}/${slot.roleContext.roleCertainty}` : slot.dstMatchup ? `DST rank ${slot.dstMatchup.dstMatchupRank}` : "N/A";
    lines.push(
      `| ${slot.slot} | ${slot.playerName} | ${slot.team} | ${slot.opponent ?? "N/A"} | ${slot.salary} | ${f(slot.projectedFantasyPoints)} | ${f(slot.dkAvgPointsPerGame)} | ${slot.posRankDiff ?? "N/A"} | ${role} | ${f(matchup?.normalized, 1)} | ${f(slot.strategyScore.score, 2)} | ${Math.round(slot.strategyScore.componentCoverage * 100)}% |`,
    );
  }
  lines.push("", "Top reasons:", ...lineup.topReasons.map((reason) => `- **${reason.label}** -- ${reason.detail}`));
  if (lineup.warnings.length > 0) lines.push("", ...lineup.warnings.map((warning) => `- ${warning}`));
}

for (const entry of first.infeasible) {
  lines.push("", `## ${entry.strategyLabel} -- infeasible`, "", ...entry.reasons.map((reason) => `- ${reason}`));
}

// Cross-lineup comparison.
if (first.lineups.length > 1) {
  lines.push("", "## Lineup Comparison", "", "| Pair | Overlap | Differing players |", "| --- | ---: | --- |");
  for (let i = 0; i < first.lineups.length; i += 1) {
    for (let j = i + 1; j < first.lineups.length; j += 1) {
      const a = first.lineups[i];
      const b = first.lineups[j];
      const setB = new Set(b.slots.map((slot) => slot.dkId));
      const shared = a.slots.filter((slot) => setB.has(slot.dkId));
      const differing = [
        ...a.slots.filter((slot) => !setB.has(slot.dkId)).map((slot) => `${a.strategy}: ${slot.playerName}`),
        ...b.slots.filter((slot) => !new Set(a.slots.map((s) => s.dkId)).has(slot.dkId)).map((slot) => `${b.strategy}: ${slot.playerName}`),
      ];
      lines.push(`| ${a.strategy} vs ${b.strategy} | ${shared.length}/9 | ${differing.join("; ") || "none"} |`);
    }
  }

  lines.push(
    "",
    "| Strategy | Avg role ordinal | Avg matchup pct | Avg usage pct | Avg salary efficiency pct | Avg salary |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const lineup of first.lineups) {
    const offense = lineup.slots.filter((slot) => slot.position !== "DST");
    const meanOf = (component: string) => {
      const values = offense
        .map((slot) => slot.strategyScore.components.find((entry) => entry.component === component)?.normalized)
        .filter((value): value is number => value != null);
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    };
    const roles = offense.map((slot) => slot.roleContext?.roleClass ?? "unknown");
    const rolePoints = { primary: 100, committee: 70, secondary: 45, unknown: 20, backup: 15 } as const;
    const avgRole = roles.reduce((sum, role) => sum + rolePoints[role], 0) / roles.length;
    lines.push(
      `| ${lineup.strategy} | ${f(avgRole, 1)} | ${f(meanOf("matchup"), 1)} | ${f(meanOf("usageRole"), 1)} | ${f(meanOf("salaryEfficiency"), 1)} | ${f(lineup.salaryUsed / 9, 0)} |`,
    );
  }
}

// Sanity checks a human would otherwise do by eye.
lines.push("", "## Automated Nonsense Checks", "");
for (const lineup of first.lineups) {
  const offense = lineup.slots.filter((slot) => slot.position !== "DST");
  const problems = [
    ...offense.filter((slot) => slot.optimizerEligibility !== "eligible").map((slot) => `non-eligible ${slot.playerName}`),
    ...offense.filter((slot) => slot.roleContext?.availability === "out" || slot.roleContext?.availability === "reserve").map((slot) => `OUT/IR ${slot.playerName}`),
    ...offense.filter((slot) => slot.roleContext?.roleClass === "backup").map((slot) => `backup role ${slot.playerName}`),
    ...(lineup.salaryUsed > lineup.salaryCap ? ["salary cap violation"] : []),
    ...(new Set(lineup.slots.map((slot) => slot.dkId)).size !== 9 ? ["duplicate DK ID"] : []),
    ...(lineup.constraintStatus.flexPositionLegal ? [] : ["illegal FLEX"]),
    ...(lineup.constraintStatus.minimumGamesSatisfied ? [] : ["minimum games violated"]),
  ];
  lines.push(`- ${lineup.strategyLabel}: ${problems.length === 0 ? "no issues found" : problems.join("; ")}`);
}

const report = lines.join("\n") + "\n";
if (values.output) {
  mkdirSync(dirname(values.output), { recursive: true });
  writeFileSync(values.output, report, "utf8");
}
process.stdout.write(report);
