import { MLB_LEAGUE_AVERAGES } from "@/lib/mlb/mlbLeagueAverages";
import type {
  MlbComparisonMetric,
  MlbGameDetail,
  MlbPropAngleData,
  MlbSummaryCardData,
} from "@/lib/mlb/mlbTypes";
import {
  computeHr9,
  computeK9,
  computePercent,
  formatFactor,
} from "@/lib/mlb/mlbFormatters";

export function getComparisonTone(value: number | null, average: number | null) {
  if (value == null || average == null) return "neutral";
  if (value > average) return "above";
  if (value < average) return "below";
  return "neutral";
}

function compareDelta(left: number | null, right: number | null) {
  if (left == null || right == null) return 0;
  return left - right;
}

function chooseEdgeLabel(leftName: string, rightName: string, delta: number, biggerIsBetter = true) {
  const effectiveDelta = biggerIsBetter ? delta : -delta;
  if (Math.abs(effectiveDelta) < 0.01) return "Even";
  return effectiveDelta > 0 ? `${leftName} edge` : `${rightName} edge`;
}

export function getPitcherComparisonMetrics(detail: MlbGameDetail): MlbComparisonMetric[] {
  const away = detail.starters.away;
  const home = detail.starters.home;

  return [
    {
      key: "era",
      label: "ERA",
      leftValue: Number(away.era) || null,
      rightValue: Number(home.era) || null,
      leagueAverage: MLB_LEAGUE_AVERAGES.era,
      format: "era",
      scaleKey: "era",
    },
    {
      key: "whip",
      label: "WHIP",
      leftValue: Number(away.whip) || null,
      rightValue: Number(home.whip) || null,
      leagueAverage: MLB_LEAGUE_AVERAGES.whip,
      format: "whip",
      scaleKey: "whip",
    },
    {
      key: "k9",
      label: "K/9",
      leftValue: computeK9(away.strikeOuts, away.inningsPitched),
      rightValue: computeK9(home.strikeOuts, home.inningsPitched),
      leagueAverage: MLB_LEAGUE_AVERAGES.k9,
      format: "k9",
      scaleKey: "k9",
    },
    {
      key: "kPct",
      label: "K%",
      leftValue: computePercent(away.strikeOuts, away.battersFaced),
      rightValue: computePercent(home.strikeOuts, home.battersFaced),
      leagueAverage: MLB_LEAGUE_AVERAGES.kPct,
      format: "percent",
      scaleKey: "percent",
    },
    {
      key: "bbPct",
      label: "BB%",
      leftValue: computePercent(away.baseOnBalls, away.battersFaced),
      rightValue: computePercent(home.baseOnBalls, home.battersFaced),
      leagueAverage: MLB_LEAGUE_AVERAGES.bbPct,
      format: "percent",
      scaleKey: "bbPercent",
    },
    {
      key: "hr9",
      label: "HR/9",
      leftValue: computeHr9(away.homeRuns, away.inningsPitched),
      rightValue: computeHr9(home.homeRuns, home.inningsPitched),
      leagueAverage: MLB_LEAGUE_AVERAGES.hr9,
      format: "rate3",
      scaleKey: "hr9",
    },
  ];
}

export function getSummaryCards(detail: MlbGameDetail): MlbSummaryCardData[] {
  const awayK9 = computeK9(detail.starters.away.strikeOuts, detail.starters.away.inningsPitched);
  const homeK9 = computeK9(detail.starters.home.strikeOuts, detail.starters.home.inningsPitched);
  const awayOps = detail.lineupSummaries.away.ops;
  const homeOps = detail.lineupSummaries.home.ops;
  const avgEra =
    detail.starters.home.era != null && detail.starters.away.era != null
      ? (Number(detail.starters.home.era) + Number(detail.starters.away.era)) / 2
      : null;

  return [
    {
      label: "Team Form Edge",
      value:
        detail.awayContext.lastFiveRecord === detail.homeContext.lastFiveRecord
          ? "Even"
          : `${detail.awayContext.lastFiveRecord} / ${detail.homeContext.lastFiveRecord}`,
      note: `${detail.game.away.abbreviation} last 5 vs ${detail.game.home.abbreviation} last 5`,
    },
    {
      label: "Pitching Edge",
      value: chooseEdgeLabel(detail.game.away.abbreviation, detail.game.home.abbreviation, compareDelta(awayK9, homeK9)),
      note: "Starting-pitcher strikeout ceiling",
    },
    {
      label: "Lineup Edge",
      value: chooseEdgeLabel(detail.game.away.abbreviation, detail.game.home.abbreviation, compareDelta(awayOps, homeOps)),
      note: "Projected lineup OPS profile",
    },
    {
      label: "Park Context",
      value: detail.game.venue,
      note: detail.weather,
    },
    {
      label: "Run Total Lean",
      value:
        avgEra != null && avgEra <= 3.6 ? "Under lean" : avgEra != null && avgEra >= 4.8 ? "Over lean" : "Neutral",
      note: avgEra != null ? `Combined starter ERA ${avgEra.toFixed(2)}` : "Starter context unavailable",
    },
    {
      label: "Strikeout Environment",
      value:
        awayK9 != null && homeK9 != null && (awayK9 + homeK9) / 2 >= 9
          ? "High-K spot"
          : "Contact-friendly",
      note: "Based on both starters' K/9",
    },
  ];
}

export function getPropAngles(detail: MlbGameDetail): MlbPropAngleData[] {
  const awayK9 = computeK9(detail.starters.away.strikeOuts, detail.starters.away.inningsPitched);
  const homeK9 = computeK9(detail.starters.home.strikeOuts, detail.starters.home.inningsPitched);
  const awayLineupK = detail.opponentSplits.homeBattingVsAwayStarter
    ? computePercent(
        detail.opponentSplits.homeBattingVsAwayStarter.strikeOuts ?? null,
        detail.opponentSplits.homeBattingVsAwayStarter.plateAppearances ?? null,
      )
    : null;
  const homeLineupK = detail.opponentSplits.awayBattingVsHomeStarter
    ? computePercent(
        detail.opponentSplits.awayBattingVsHomeStarter.strikeOuts ?? null,
        detail.opponentSplits.awayBattingVsHomeStarter.plateAppearances ?? null,
      )
    : null;

  return [
    {
      title: `K Props — ${detail.starters.away.name}`,
      rationale: awayK9 != null && awayK9 >= 9 ? "Swing-and-miss upside is live." : "More neutral strikeout profile.",
      signals: [
        `K/9: ${awayK9?.toFixed(1) ?? "—"}`,
        `${detail.game.home.abbreviation} split K%: ${homeLineupK?.toFixed(1) ?? "—"}%`,
      ],
      tag: awayK9 != null && awayK9 >= 9 ? "High K" : "Neutral",
    },
    {
      title: `K Props — ${detail.starters.home.name}`,
      rationale: homeK9 != null && homeK9 >= 9 ? "Strong punchout environment." : "Needs opponent help for ceiling.",
      signals: [
        `K/9: ${homeK9?.toFixed(1) ?? "—"}`,
        `${detail.game.away.abbreviation} split K%: ${awayLineupK?.toFixed(1) ?? "—"}%`,
      ],
      tag: homeK9 != null && homeK9 >= 9 ? "High K" : "Neutral",
    },
    {
      title: "Run Environment",
      rationale: "Use park and starter quality together instead of raw venue alone.",
      signals: [
        `Venue: ${detail.game.venue}`,
        `Weather: ${detail.weather}`,
      ],
      tag: "Game Total",
    },
    {
      title: "Lineup Pressure",
      rationale: "Projected lineup quality highlights which side creates more contact and slugging pressure.",
      signals: [
        `${detail.game.away.abbreviation} OPS: ${detail.lineupSummaries.away.ops?.toFixed(3) ?? "—"}`,
        `${detail.game.home.abbreviation} OPS: ${detail.lineupSummaries.home.ops?.toFixed(3) ?? "—"}`,
      ],
      tag: "Lineup",
    },
  ];
}

export function getParkContextValues(detail: MlbGameDetail) {
  const avgEra =
    detail.starters.home.era != null && detail.starters.away.era != null
      ? (Number(detail.starters.home.era) + Number(detail.starters.away.era)) / 2
      : null;

  return {
    venue: detail.game.venue,
    weather: detail.weather,
    combinedEra: avgEra,
    homeStarterEra: detail.starters.home.era != null ? Number(detail.starters.home.era) : null,
    awayStarterEra: detail.starters.away.era != null ? Number(detail.starters.away.era) : null,
    runFactor: MLB_LEAGUE_AVERAGES.runsFactor,
    hrFactor: MLB_LEAGUE_AVERAGES.hrFactor,
    totalLean:
      avgEra == null ? "Neutral" : avgEra <= 3.6 ? "Under lean" : avgEra >= 4.8 ? "Over lean" : "Neutral",
    parkType: "Neutral park",
    factorLabel: `${formatFactor(MLB_LEAGUE_AVERAGES.runsFactor)} avg run factor`,
  };
}
