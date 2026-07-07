import {
  NFL_DIVISIONS,
  NFL_DIVISION_ORDER,
  NFL_POWER_RATINGS,
  type NflPowerTeam,
} from "@/data/nflPreseason2026";

import {
  computeMarketConfidence,
  computeMarketLean,
  computeModelVsMarketGap,
  computeRegressionSignal,
  computeScheduleLabel,
  computeUnitIdentity,
  type NflConfidenceLabel,
  type NflMarketLean,
  type NflRegressionSignal,
} from "@/lib/nfl/guideLabels";

export type { NflMarketLean, NflRegressionSignal };
export type NflGuideQuestion = { title: string; answer: string };

export type NflGuideTeam = NflPowerTeam & {
  powerRank: number;
  slug: string;
  division: string;
  conference: "AFC" | "NFC";
  wins2025: number;
  losses2025: number;
  scheduleRank: number | null;
  scheduleLabel: string;
  projectedWins: number;
  modelEdge: number | null;
  marketLean: NflMarketLean;
  marketConfidence: NflConfidenceLabel;
  regressionGap: number;
  regressionSignal: NflRegressionSignal;
  unitIdentity: string;
  headline: string;
  summary: string;
  strengths: string[];
  concerns: string[];
  questions: NflGuideQuestion[];
};

export type NflPlayoffProjection = {
  divisionWinners: NflGuideTeam[];
  wildCards: NflGuideTeam[];
  conferenceChampion: NflGuideTeam;
};

const divisionByAbbr = new Map<string, { division: string; scheduleRank: number | null }>();
for (const division of NFL_DIVISION_ORDER) {
  for (const team of NFL_DIVISIONS[division] ?? []) {
    divisionByAbbr.set(team.abbr.toLowerCase(), { division, scheduleRank: team.sos });
  }
}

export const NFL_GUIDE_TEAMS: NflGuideTeam[] = NFL_POWER_RATINGS.map(buildGuideTeam);
export const NFL_GUIDE_TEAM_BY_SLUG = new Map(NFL_GUIDE_TEAMS.map((team) => [team.slug, team]));
export const NFL_GUIDE_TEAM_BY_ABBR = new Map(NFL_GUIDE_TEAMS.map((team) => [team.abbr.toLowerCase(), team]));
export const NFL_GUIDE_DIVISIONS = NFL_DIVISION_ORDER.map((division) => ({
  division,
  teams: NFL_GUIDE_TEAMS.filter((team) => team.division === division).sort(sortProjection),
}));
export const NFL_GUIDE_PLAYOFFS = {
  AFC: buildConferenceProjection("AFC"),
  NFC: buildConferenceProjection("NFC"),
};
export const NFL_GUIDE_SUPER_BOWL_PICK = [
  NFL_GUIDE_PLAYOFFS.AFC.conferenceChampion,
  NFL_GUIDE_PLAYOFFS.NFC.conferenceChampion,
].sort(sortProjection)[0];
export const NFL_GUIDE_TOP_MARKET_EDGES = NFL_GUIDE_TEAMS
  .filter((team) => team.modelEdge != null)
  .sort((a, b) => Math.abs(b.modelEdge ?? 0) - Math.abs(a.modelEdge ?? 0));
export const NFL_GUIDE_BOUNCE_BACKS = NFL_GUIDE_TEAMS
  .filter((team) => team.regressionSignal === "Bounce Back")
  .sort((a, b) => b.regressionGap - a.regressionGap);
export const NFL_GUIDE_REGRESSION_CANDIDATES = NFL_GUIDE_TEAMS
  .filter((team) => team.regressionSignal === "Regression")
  .sort((a, b) => a.regressionGap - b.regressionGap);

export function slugifyNflTeam(team: string) {
  return team.toLowerCase().replace(/\./g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function formatSigned(value: number, digits = 1) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export function getScheduleDescription(scheduleRank: number | null) {
  if (scheduleRank == null) return "Schedule rank is not available yet.";
  if (scheduleRank <= 8) return `Schedule rank #${scheduleRank} is in the league's hardest quarter.`;
  if (scheduleRank >= 25) return `Schedule rank #${scheduleRank} is in the league's easiest quarter.`;
  return `Schedule rank #${scheduleRank} falls in the middle half of the league.`;
}

function buildGuideTeam(team: NflPowerTeam): NflGuideTeam {
  const divisionData = divisionByAbbr.get(team.abbr.toLowerCase());
  const division = divisionData?.division ?? "Unknown";
  const conference = division.startsWith("AFC") ? "AFC" : "NFC";
  const scheduleRank = divisionData?.scheduleRank ?? null;
  const [wins2025, losses2025] = parseRecord(team.record2025);
  const scheduleAdjustment = scheduleRank == null ? 0 : (scheduleRank - 16.5) * 0.04;
  const projectedWins = roundOne(clamp(8.5 + team.ovrPct * 0.35 + scheduleAdjustment, 3, 13));
  const modelEdge = computeModelVsMarketGap(projectedWins, team.winTotal);
  const marketLean = computeMarketLean(modelEdge);
  const marketConfidence = computeMarketConfidence(modelEdge);
  const regressionGap = roundOne(projectedWins - wins2025);
  const regressionSignal = computeRegressionSignal(regressionGap);
  const unitIdentity = computeUnitIdentity(team.offRank, team.defRank);

  return {
    ...team,
    powerRank: team.rank,
    slug: slugifyNflTeam(team.team),
    division,
    conference,
    wins2025,
    losses2025,
    scheduleRank,
    scheduleLabel: computeScheduleLabel(scheduleRank),
    projectedWins,
    modelEdge,
    marketLean,
    marketConfidence,
    regressionGap,
    regressionSignal,
    unitIdentity,
    headline: buildHeadline(team, regressionSignal, marketLean),
    summary: buildSummary(team, projectedWins, division, scheduleRank, regressionSignal, marketLean, modelEdge),
    strengths: buildStrengths(team, scheduleRank, projectedWins, marketLean),
    concerns: buildConcerns(team, scheduleRank, wins2025, projectedWins),
    questions: buildQuestions(team, projectedWins, scheduleRank, marketLean, modelEdge, regressionSignal, unitIdentity),
  };
}

function buildConferenceProjection(conference: "AFC" | "NFC"): NflPlayoffProjection {
  const divisionWinners = NFL_GUIDE_DIVISIONS
    .filter(({ division }) => division.startsWith(conference))
    .map(({ teams }) => teams[0])
    .filter((team): team is NflGuideTeam => Boolean(team))
    .sort(sortProjection);
  const winners = new Set(divisionWinners.map((team) => team.abbr));
  const wildCards = NFL_GUIDE_TEAMS
    .filter((team) => team.conference === conference && !winners.has(team.abbr))
    .sort(sortProjection)
    .slice(0, 3);
  return { divisionWinners, wildCards, conferenceChampion: divisionWinners[0] };
}

function buildHeadline(team: NflPowerTeam, signal: NflRegressionSignal, lean: NflMarketLean) {
  if (signal === "Bounce Back") return `${team.team} profiles as a 2026 bounce-back candidate`;
  if (signal === "Regression") return `${team.team} faces a meaningful regression test`;
  if (lean !== "Pass") return `${team.team} creates an early ${lean.toLowerCase()} lean`;
  return `${team.team} lands near the middle of the preseason market`;
}

function buildSummary(team: NflPowerTeam, projectedWins: number, division: string, scheduleRank: number | null, signal: NflRegressionSignal, lean: NflMarketLean, edge: number | null) {
  const marketSentence = team.winTotal == null
    ? "A widely available win total was not included in the current data snapshot."
    : lean === "Pass"
      ? `The model's ${projectedWins.toFixed(1)}-win baseline is close to the ${team.winTotal.toFixed(1)} market total.`
      : `The model's ${projectedWins.toFixed(1)}-win baseline creates a ${formatSigned(edge ?? 0)}-win ${lean.toLowerCase()} edge against a ${team.winTotal.toFixed(1)} total.`;
  const correction = projectedWins - parseRecord(team.record2025)[0];
  const regressionSentence = signal === "Bounce Back"
    ? `That forecast is ${formatSigned(correction)} wins above the 2025 finish, so improvement is built into our view.`
    : signal === "Regression"
      ? `That forecast is ${Math.abs(correction).toFixed(1)} wins below the 2025 finish, making sustainability the main question.`
      : "The model does not see an extreme year-over-year correction at this stage.";
  const scheduleSentence = scheduleRank == null ? "" : ` The ${division} schedule rank is #${scheduleRank}, with #1 hardest and #32 easiest.`;
  return `${marketSentence} ${regressionSentence}${scheduleSentence}`;
}

function buildStrengths(team: NflPowerTeam, scheduleRank: number | null, projectedWins: number, lean: NflMarketLean) {
  const strengths: string[] = [];
  if (team.offRank <= 8) strengths.push(`Top-eight offense in the 2025 performance model (#${team.offRank}).`);
  if (team.defRank <= 8) strengths.push(`Top-eight defense in the 2025 performance model (#${team.defRank}).`);
  if (team.rank <= 10) strengths.push(`Top-10 overall composite power rating (#${team.rank}).`);
  if (scheduleRank != null && scheduleRank >= 25) strengths.push(`Favorable schedule profile (#${scheduleRank}, where #32 is easiest).`);
  if (lean === "Over") strengths.push(`Model projection of ${projectedWins.toFixed(1)} wins is above the current total.`);
  if (!strengths.length) strengths.push("No single elite indicator; the case depends on balanced improvement across multiple areas.");
  return strengths.slice(0, 3);
}

function buildConcerns(team: NflPowerTeam, scheduleRank: number | null, wins2025: number, projectedWins: number) {
  const concerns: string[] = [];
  if (team.offRank >= 25) concerns.push(`Bottom-eight offense in the 2025 performance model (#${team.offRank}).`);
  if (team.defRank >= 25) concerns.push(`Bottom-eight defense in the 2025 performance model (#${team.defRank}).`);
  if (scheduleRank != null && scheduleRank <= 8) concerns.push(`Difficult schedule profile (#${scheduleRank}, where #1 is hardest).`);
  if (wins2025 - projectedWins >= 1.5) concerns.push(`The model expects ${Math.abs(projectedWins - wins2025).toFixed(1)} fewer wins than last season.`);
  if (team.winTotal != null && team.winTotal - projectedWins >= 0.75) concerns.push(`Market total is ${Math.abs(team.winTotal - projectedWins).toFixed(1)} wins above the model baseline.`);
  if (!concerns.length) concerns.push("The current projection is stable, so injuries and quarterback availability are the biggest swing variables.");
  return concerns.slice(0, 3);
}

function buildQuestions(team: NflPowerTeam, projectedWins: number, scheduleRank: number | null, lean: NflMarketLean, edge: number | null, signal: NflRegressionSignal, unitIdentity: string): NflGuideQuestion[] {
  const marketQuestion = team.winTotal == null
    ? { title: "Where should the market open?", answer: `Our current baseline is ${projectedWins.toFixed(1)} wins. Until a reliable total is available, compare ${team.team} with division rivals and monitor price discovery.` }
    : {
        title: `Is the ${team.winTotal.toFixed(1)} win total priced correctly?`,
        answer: lean === "Pass"
          ? `The projection is ${projectedWins.toFixed(1)} wins, close enough to the market that there is no automatic bet. A half-win move or major injury update could create the edge.`
          : `The projection is ${projectedWins.toFixed(1)} wins, producing a ${formatSigned(edge ?? 0)}-win gap and an early ${lean.toLowerCase()} lean. Price and injury news still matter.`,
      };

  const unitQuestion = team.offRank + 7 < team.defRank
    ? { title: "Can the defense become good enough for the offense?", answer: `${team.team} enters with offense #${team.offRank} and defense #${team.defRank}. The ceiling depends on narrowing that gap; an average defense would materially improve the full-team projection.` }
    : team.defRank + 7 < team.offRank
      ? { title: "Can the offense support an already strong defense?", answer: `${team.team} enters with defense #${team.defRank} but offense #${team.offRank}. Sustaining drives and improving early-down efficiency are the clearest paths to beating the baseline.` }
      : { title: "Is the balanced profile strong enough to separate?", answer: `${team.team} has a ${unitIdentity}, with offense #${team.offRank} and defense #${team.defRank}. Quarterback play, coaching and close-game execution become the main separators.` };

  const regressionQuestion = signal === "Regression"
    ? { title: "How much of last season is repeatable?", answer: `The model projects ${projectedWins.toFixed(1)} wins after a ${team.record2025} finish. That flags a team whose record was stronger than its current power-and-schedule baseline.` }
    : signal === "Bounce Back"
      ? { title: "What needs to change for the bounce back?", answer: `The model projects ${projectedWins.toFixed(1)} wins after a ${team.record2025} season. Better health, normal close-game variance and improvement from the weaker unit are the clearest paths.` }
      : { title: "Will the schedule create separation?", answer: scheduleRank == null ? "The current profile is close to neutral, so schedule sequencing and quarterback availability will determine the outcome." : `${getScheduleDescription(scheduleRank)} The model includes a modest schedule adjustment, but road clusters and division games can still create volatility.` };

  return [marketQuestion, unitQuestion, regressionQuestion];
}

function sortProjection(a: NflGuideTeam, b: NflGuideTeam) {
  return b.projectedWins - a.projectedWins || a.powerRank - b.powerRank;
}
function parseRecord(record: string): [number, number] {
  const [wins = 0, losses = 0] = record.split("-").map((value) => Number.parseInt(value, 10) || 0);
  return [wins, losses];
}
function roundOne(value: number) { return Math.round(value * 10) / 10; }
function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }
