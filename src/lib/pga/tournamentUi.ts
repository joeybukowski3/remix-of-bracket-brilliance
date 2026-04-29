import { getTournamentModelPath, getTournamentPicksPath, type PgaTournamentConfig } from "@/lib/pga/tournamentConfig";
import type { PgaHubBoardContext, PgaModelTableConfig, PgaWeightKey, PlayerModelRow } from "@/lib/pga/pgaTypes";
import type { PgaScheduleEntry } from "@/lib/pga/pgaSchedule";

const PREVIEW_SLIDER_LABELS: Record<PgaWeightKey, string> = {
  sgApproach: "SG: Approach",
  par4: "Par 4 Scoring",
  drivingAccuracy: "Driving Accuracy",
  bogeyAvoidance: "Bogey Avoidance",
  sgAroundGreen: "Short Game",
  trendRank: "TrendRank",
  birdie125150: "125-150",
  sgPutting: "Putting",
  birdieUnder125: "<125",
  courseTrueSg: "Course History",
};

export function buildPgaModelTableConfig(tournament: PgaTournamentConfig): PgaModelTableConfig {
  return {
    title: `${tournament.model.courseHistoryDisplay} Model - Full Field`,
    subtitle: "Ranked by composite score · lower stat rank = better · hover column headers for full name",
    historySectionTitle: `${tournament.model.courseHistoryDisplay} History`,
    statsSectionTitle: "Weighted Stats - Field Rank (lower = better)",
    scoreSectionTitle: "Score",
    statColumns: tournament.model.statColumns,
    historyLabels: {
      trendLabel: "DG Rank",
      trendTooltip: "DataGolf Trend Rank - current global player ranking per the DataGolf model.",
      courseRoundsLabel: `${tournament.model.courseHistoryDisplay} Rnds`,
      courseRoundsTooltip: `Rounds played at ${tournament.courseName}.`,
      cutsLabel: "Prior Cuts",
      cutsTooltip: `Cuts made in the last five recorded ${tournament.shortName} appearances when that history is available.`,
      courseHistoryScoreLabel: `${tournament.model.courseHistoryDisplay} SG`,
      courseHistoryScoreTooltip: `Historical strokes gained at ${tournament.courseName}.`,
    },
    mobileCourseHistoryLabel: `${tournament.model.courseHistoryDisplay} rounds`,
    mobileNoCourseHistoryLabel: `No ${tournament.model.courseHistoryDisplay} history`,
  };
}

export function buildPreviewSliders(tournament: PgaTournamentConfig, previewThemeKey: string) {
  const previewTheme =
    tournament.model.previewThemes.find((theme) => theme.key === previewThemeKey) ?? tournament.model.previewThemes[0];

  return tournament.model.previewSliderKeys.map((key) => ({
    label: PREVIEW_SLIDER_LABELS[key],
    value: previewTheme.weights[key],
    max: 30,
  }));
}

export function getTournamentNavLinks(tournament: PgaTournamentConfig) {
  return {
    picksPath: getTournamentPicksPath(tournament),
    modelPath: getTournamentModelPath(tournament),
  };
}

const PGA_SCAFFOLD_PATTERNS = [
  "override file",
  "manual override",
  "baseline page can go live",
  "baseline package",
  "generated",
  "weekly shell",
  "without rebuilding",
  "manual adjustments are added",
] as const;

export function isPgaScaffoldCopy(value?: string | null) {
  if (!value) return true;
  const normalized = value.toLowerCase();
  return PGA_SCAFFOLD_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function buildPgaHubBoardContext(
  tournament: PgaTournamentConfig,
  scheduleEntry?: PgaScheduleEntry | null,
): PgaHubBoardContext {
  const contextBody = firstUsablePgaCopy(
    scheduleEntry?.modelFocus,
    tournament.manual?.modelFocusNote,
    tournament.summary?.modelFocus,
    scheduleEntry?.summaryBlurb,
    tournament.summary?.blurb,
  ) ?? `${tournament.courseName} is the active PGA board this week, so the hub is centered on the live rankings, course-fit leaders, and the stat mix that should matter most for ${tournament.shortName}.`;

  const contextBullets = firstUsablePgaBulletSet(
    scheduleEntry?.courseTraits,
    tournament.summary?.bullets,
    tournament.manual?.courseFitNotes,
  ) ?? [
    `Start with the live ${tournament.shortName} leaderboard before moving into written picks.`,
    "Use the full model room when you want to push the board toward a different course-fit angle.",
    "Keep the tournament page separate for outrights, fades, and event-specific betting notes.",
  ];

  return {
    eyebrow: "This week's PGA board",
    headline: `Current rankings and course-fit leaders for ${tournament.shortName}`,
    intro: `Start with the live leaderboard, scan the strongest fits for ${tournament.courseName}, then branch into the full model room or this week's written picks card.`,
    statCards: [
      { label: "Event", value: tournament.shortName },
      { label: "Course", value: tournament.courseName },
      { label: "Week", value: tournament.schedule?.weekLabel ?? scheduleEntry?.startDate ?? "Current week" },
    ],
    contextTitle: `${tournament.courseName} board context`,
    contextBody,
    contextBullets: contextBullets.slice(0, 3),
    leaderboardTitle: `Live ${tournament.shortName} leaderboard preview`,
    leaderboardBody: `The main PGA page leads with the active board for ${tournament.shortName}, using the current featured dataset to surface the top-ranked players and the stat profile driving the week.`,
  };
}

export function getPlayerModelStatRank(row: PlayerModelRow, statKey: PgaTournamentConfig["model"]["statColumns"][number]["key"]) {
  switch (statKey) {
    case "sgApproachRank":
      return row.sgApproachRank;
    case "par4Rank":
      return row.par4Rank;
    case "drivingAccuracyRank":
      return row.drivingAccuracyRank;
    case "bogeyAvoidanceRank":
      return row.bogeyAvoidanceRank;
    case "sgAroundGreenRank":
      return row.sgAroundGreenRank;
    case "birdie125150Rank":
      return row.birdie125150Rank;
    case "sgPuttingRank":
      return row.sgPuttingRank;
    case "birdieUnder125Rank":
      return row.birdieUnder125Rank;
    default:
      return null;
  }
}

function firstUsablePgaCopy(...values: Array<string | undefined | null>) {
  return values.find((value) => value && !isPgaScaffoldCopy(value)) ?? null;
}

function firstUsablePgaBulletSet(...values: Array<readonly string[] | undefined>) {
  return values.find((items) => items?.length && items.some((item) => !isPgaScaffoldCopy(item)))?.filter((item) => !isPgaScaffoldCopy(item)) ?? null;
}
