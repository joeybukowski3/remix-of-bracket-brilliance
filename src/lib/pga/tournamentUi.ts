import { getTournamentModelPath, getTournamentPicksPath, type PgaTournamentConfig } from "@/lib/pga/tournamentConfig";
import type { PgaModelTableConfig, PgaWeightKey } from "@/lib/pga/pgaTypes";

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
      relatedEventLabel: tournament.model.relatedEventLabel,
      relatedEventTooltip: `Most relevant recent finish marker for ${tournament.shortName}.`,
      cutsLabel: "Cuts/5",
      cutsTooltip: `Cuts made in the last five ${tournament.shortName} appearances.`,
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
