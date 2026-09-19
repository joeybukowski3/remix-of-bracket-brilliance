import { useState } from "react";
import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import MatchupComparisonCard from "@/components/nfl/matchups/MatchupComparisonCard";
import MatchupTabStrip, { type MatchupTabDef } from "@/components/nfl/matchups/MatchupTabStrip";
import type { MatchupMetricTableRow } from "@/components/nfl/matchups/MatchupMetricTable";
import MatchupPendingNote, { CONVENTIONAL_STATS_SOURCES } from "@/components/nfl/matchups/MatchupPendingNote";
import MatchupSegmentedControl from "@/components/nfl/matchups/MatchupSegmentedControl";
import MatchupTowerGrid from "@/components/nfl/matchups/MatchupTowerGrid";
import type { MatchupTowerMetricPresentation } from "@/components/nfl/matchups/matchupTowerPresentation";
import MatchupContextMetricGrid from "@/components/nfl/matchups/MatchupContextMetricGrid";
import { towerHeightFromRank } from "@/components/nfl/matchups/matchupVisualMath";
import {
  UNIT_BATTLE_GROUPS,
  getMetricDef,
  METRIC_NA,
  type NflMetricPairing,
  type NflMatchupMetricResolver,
} from "@/lib/nfl/matchupMetrics";
import { deriveMetricComparisonFromRanks } from "@/lib/nfl/matchupRailNormalization";

import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import { nflTeamColorFor } from "@/lib/nfl/nflTeamColor";
import { useIsCompactLayout } from "@/hooks/useIsCompactLayout";
import {
  SUCCESS_PERIOD_LABELS,
  collectPeriodValues,
  formatSuccessRate,
  isSuccessRateMetric,
} from "@/lib/nfl/successRateData";
import type { MatchupSuccessRateConfig } from "@/components/nfl/matchups/MatchupUnitComparison";
import { type MatchupTrenchConfig } from "@/components/nfl/matchups/MatchupTrenchRow";
import {
  collectTrenchPeriodValues,
  formatTrenchValue,
  isTrenchMetric,
  trenchPeriodLabel,
} from "@/lib/nfl/trenchMetricsData";

type PossessionSide = "away-ball" | "home-ball";

/**
 * Two-sided lever toggle between "{AWAY} OFFENSE" and "{HOME} OFFENSE".
 *
 * Replaces the former "{AWAY} Ball" / "{HOME} Ball" segmented control with a
 * single control that visually reads as a lever: the active side takes its
 * team's away/home tone, and the thumb slides to the selected side. Purely
 * presentational — it drives the same `PossessionSide` state the page
 * already reads to decide which offense-vs-defense panel is showing.
 */
function MatchupUnitLever({
  awayAbbr,
  homeAbbr,
  side,
  onChange,
  className = "",
}: {
  awayAbbr: string;
  homeAbbr: string;
  side: PossessionSide;
  onChange: (next: PossessionSide) => void;
  className?: string;
}) {
  const awayActive = side === "away-ball";
  return (
    <div className={`matchup-unit-lever ${className}`} role="tablist" aria-label="Possession view">
      <button
        type="button"
        role="tab"
        aria-selected={awayActive}
        onClick={() => onChange("away-ball")}
        className={`matchup-unit-lever__side matchup-unit-lever__side--away ${awayActive ? "is-active" : ""}`}
      >
        {awayAbbr.toUpperCase()} Offense
      </button>
      <span className="matchup-unit-lever__track" aria-hidden>
        <span className={`matchup-unit-lever__thumb ${awayActive ? "" : "is-home"}`} />
      </span>
      <button
        type="button"
        role="tab"
        aria-selected={!awayActive}
        onClick={() => onChange("home-ball")}
        className={`matchup-unit-lever__side matchup-unit-lever__side--home ${!awayActive ? "is-active" : ""}`}
      >
        {homeAbbr.toUpperCase()} Offense
      </button>
    </div>
  );
}

/**
 * A pairing is descriptive when either side is context-only, in which case the
 * row drops quality-tier colouring and asserts no winner. Ranks are already
 * direction-aware per side, so a quality pairing colours and compares correctly
 * even though the two sides read in opposite directions (e.g. yards/play gained
 * vs yards/play allowed).
 */
function pairingIsDescriptive(offenseKey: string, defenseKey: string): boolean {
  return (
    getMetricDef(offenseKey)?.direction === "context-only" ||
    getMetricDef(defenseKey)?.direction === "context-only"
  );
}

/**
 * Every comparison row for one attacking-vs-defending pairing.
 *
 * The two sides of a pairing measure opposing sides of the same matchup and do
 * not share a raw unit, so their values are never compared directly and the
 * Edge names only the advantaged side. Each side's league rank is
 * direction-normalized, so the better league position is the stronger side —
 * that is the comparison the row expresses. When a rank is unavailable the row
 * stays neutral rather than inventing a winner. Descriptive pairings (a
 * context-only metric on either side) assert no winner at all.
 *
 * Period-based sources (success rate, trench win rates) contribute one row per
 * visible period with the period carried in the row's context sub-label.
 */
function buildPairingRows({
  pairing,
  awayTeam,
  homeTeam,
  awayMetricKey,
  homeMetricKey,
  resolver,
  successRate,
  trench,
}: {
  pairing: NflMetricPairing;
  awayTeam: NflMatchupTeam;
  homeTeam: NflMatchupTeam;
  awayMetricKey: string;
  homeMetricKey: string;
  resolver: NflMatchupMetricResolver;
  successRate?: MatchupSuccessRateConfig;
  trench?: MatchupTrenchConfig;
}): MatchupMetricTableRow[] {
  const common = { label: pairing.label, help: pairing.help, direction: "higher-is-better" as const };

  if (trench && isTrenchMetric(pairing.offenseKey)) {
    const awayValues = collectTrenchPeriodValues(trench.resolve, awayTeam.abbr, awayMetricKey, trench.periods);
    const homeValues = collectTrenchPeriodValues(trench.resolve, homeTeam.abbr, homeMetricKey, trench.periods);
    return trench.periods.map((period) => {
      const away = awayValues[period] ?? null;
      const home = homeValues[period] ?? null;
      const leftRank = away?.espnRank ?? null;
      const rightRank = home?.espnRank ?? null;
      return {
        ...common,
        key: `${pairing.id}-${period}`,
        contextLabel: trenchPeriodLabel(trench.artifact, period).label,
        away: { value: away?.valuePct ?? null, rank: leftRank, formatted: formatTrenchValue(away) },
        home: { value: home?.valuePct ?? null, rank: rightRank, formatted: formatTrenchValue(home) },
        comparison: deriveMetricComparisonFromRanks(leftRank, rightRank),
      };
    });
  }

  if (successRate && isSuccessRateMetric(pairing.offenseKey)) {
    const awayValues = collectPeriodValues(successRate.resolve, awayTeam.abbr, awayMetricKey, successRate.periods);
    const homeValues = collectPeriodValues(successRate.resolve, homeTeam.abbr, homeMetricKey, successRate.periods);
    return successRate.periods.map((period) => {
      const away = awayValues[period] ?? null;
      const home = homeValues[period] ?? null;
      const leftRank = away?.rank ?? null;
      const rightRank = home?.rank ?? null;
      return {
        ...common,
        key: `${pairing.id}-${period}`,
        contextLabel: SUCCESS_PERIOD_LABELS[period].short,
        away: { value: away?.pct ?? null, rank: leftRank, formatted: formatSuccessRate(away) },
        home: { value: home?.pct ?? null, rank: rightRank, formatted: formatSuccessRate(home) },
        comparison: deriveMetricComparisonFromRanks(leftRank, rightRank),
      };
    });
  }

  const away = resolver(awayTeam.slug, awayMetricKey);
  const home = resolver(homeTeam.slug, homeMetricKey);
  const leftRank = away?.rank ?? null;
  const rightRank = home?.rank ?? null;
  const descriptive = pairingIsDescriptive(pairing.offenseKey, pairing.defenseKey);
  return [
    {
      ...common,
      key: pairing.id,
      direction: descriptive ? "context-only" : "higher-is-better",
      away: { value: away?.value ?? null, rank: leftRank, formatted: away?.formattedValue ?? METRIC_NA },
      home: { value: home?.value ?? null, rank: rightRank, formatted: home?.formattedValue ?? METRIC_NA },
      comparison: descriptive ? "not-comparable" : deriveMetricComparisonFromRanks(leftRank, rightRank),
    },
  ];
}

/**
 * One possession view: away team left, home team right, grouped Overall /
 * Passing / Rushing. Which side has the ball decides the roles the two columns
 * play, never which column they occupy.
 *
 * Straight comparison only — no aggregate matchup score, projected advantage or
 * weighted grade is derived from these pairings.
 */
function PossessionPanel({
  awayTeam,
  homeTeam,
  ballSide,
  matchup,
  resolver,
  successRate,
  trench,
  activeGroup,
  view,
}: {
  matchup: NflMatchup;
  awayTeam: NflMatchupTeam;
  homeTeam: NflMatchupTeam;
  /** Which side has the ball in this panel. Decides roles, never columns. */
  ballSide: "away" | "home";
  resolver: NflMatchupMetricResolver;
  successRate?: MatchupSuccessRateConfig;
  trench?: MatchupTrenchConfig;
  /** Which UNIT_BATTLE_GROUPS id the group tabs currently show. */
  activeGroup: string;
  view: "comparison" | "towers";
}) {
  /**
   * Columns are keyed by SIDE, not by role: the away team is always the left
   * column and the home team always the right, in both panels, matching every
   * other table on this page. Only the roles flip between panels — panel one
   * reads away Offense vs home Defense, panel two away Defense vs home Offense.
   */
  const awayHasBall = ballSide === "away";
  const awayUnit = awayHasBall ? "Offense" : "Defense";
  const homeUnit = awayHasBall ? "Defense" : "Offense";
  const awayRole = awayHasBall ? "offense" : "defense";
  const homeRole = awayHasBall ? "defense" : "offense";

  /** The metric key each column reads, which is what the role actually selects. */
  const awayKey = (pairing: NflMetricPairing) =>
    awayHasBall ? pairing.offenseKey : pairing.defenseKey;
  const homeKey = (pairing: NflMetricPairing) =>
    awayHasBall ? pairing.defenseKey : pairing.offenseKey;

  return (
    <div>
      {UNIT_BATTLE_GROUPS.filter((group) => group.id === activeGroup).map((group) => {
          const rows = group.pairings.flatMap((pairing) =>
            buildPairingRows({
              pairing,
              awayTeam,
              homeTeam,
              awayMetricKey: awayKey(pairing),
              homeMetricKey: homeKey(pairing),
              resolver,
              successRate,
              trench,
            })
          );
        if (view === "towers") {
          const awayIdentity = `${awayTeam.abbr.toUpperCase()} ${awayUnit === "Offense" ? "OFF" : "DEF"}`;
          const homeIdentity = `${homeTeam.abbr.toUpperCase()} ${homeUnit === "Offense" ? "OFF" : "DEF"}`;
          const pairingLabel = `${awayIdentity} vs ${homeIdentity}`;
          const comparableRows = rows.filter((row) => row.direction !== "context-only" && row.direction !== "none");
          const contextRows = rows.filter((row) => row.direction === "context-only" || row.direction === "none");
          const awayColor = nflTeamColorFor(awayTeam) ?? "#94a3b8";
          const homeColor = nflTeamColorFor(homeTeam) ?? "#94a3b8";
          const towerMetrics: MatchupTowerMetricPresentation[] = comparableRows.map((row) => ({
            id: `${ballSide}-${group.id}-${row.key}`,
            label: row.label,
            shortLabel: row.shortLabel ?? row.label,
            contextLabel: row.contextLabel,
            pairingLabel,
            away: {
              team: awayTeam, color: awayColor, identityLabel: awayIdentity,
              formatted: row.away.formatted, rank: row.away.rank,
              heightPercent: towerHeightFromRank(row.away.rank),
            },
            home: {
              team: homeTeam, color: homeColor, identityLabel: homeIdentity,
              formatted: row.home.formatted, rank: row.home.rank,
              heightPercent: towerHeightFromRank(row.home.rank),
            },
          }));
          return (
            <div key={group.id} className="space-y-3">
              <MatchupTowerGrid metrics={towerMetrics} title={group.label} subtitle={pairingLabel} />
              <MatchupContextMetricGrid
                metrics={contextRows}
                matchup={matchup}
                headingId={`${ballSide}-${group.id}-context-heading`}
                awayIdentityLabel={awayIdentity}
                homeIdentityLabel={homeIdentity}
              />
            </div>
          );
        }
        return (
            <MatchupComparisonCard
              key={group.id}
              title={group.label}
              matchup={matchup}
              metrics={rows}
              variant="detail"
              edgeDifference={false}
              stickyHeader
              unit={{ away: awayUnit, home: homeUnit }}
              caption={`${group.label}: ${awayTeam.teamName} ${awayRole} versus ${homeTeam.teamName} ${homeRole}`}
            />
        );
      })}
    </div>
  );
}

export default function MatchupUnitBattles({
  matchup,
  resolver,
  successRate,
  trench,
}: {
  matchup: NflMatchup;
  resolver: NflMatchupMetricResolver;
  successRate?: MatchupSuccessRateConfig;
  trench?: MatchupTrenchConfig;
}) {
  const [side, setSide] = useState<PossessionSide>("away-ball");
  const [activeGroup, setActiveGroup] = useState<string>(UNIT_BATTLE_GROUPS[0].id);
  const [mobileView, setMobileView] = useState<"comparison" | "towers">("comparison");
  const isMobile = useIsCompactLayout("(max-width: 767px)");
  const { away, home } = matchup;

  const groupTabs: MatchupTabDef[] = UNIT_BATTLE_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
  }));

  return (
    <MatchupSection
      id="matchups"
      eyebrow="Unit by unit"
      titleAlign="center"
      subtitle="Direct unit comparison, ranked by league position. No matchup score or projected advantage is derived."
      bodyClassName="matchup-dense-section-body"
      className="matchup-telemetry-section"
      headerAside={
        <MatchupUnitLever
          awayAbbr={away.abbr}
          homeAbbr={home.abbr}
          side={side}
          onChange={setSide}
          className="md:hidden"
        />
      }
    >
      {isMobile && (
        <div className="matchup-mobile-view-control">
          <MatchupSegmentedControl
            options={[{ value: "comparison", label: "Comparison" }, { value: "towers", label: "Towers" }]}
            value={mobileView}
            onChange={setMobileView}
            ariaLabel="Unit by Unit view"
            size="sm"
          />
        </div>
      )}
      <MatchupTabStrip
        tabs={groupTabs}
        activeId={activeGroup}
        onSelect={setActiveGroup}
        ariaLabel="Unit by unit groups"
        className="mb-2"
      />

      <div className="space-y-2">
        <div className={side === "away-ball" ? "" : "hidden md:block"}>
          <PossessionPanel
            matchup={matchup}
            awayTeam={away}
            homeTeam={home}
            ballSide="away"
            resolver={resolver}
            successRate={successRate}
            trench={trench}
            activeGroup={activeGroup}
            view={isMobile ? mobileView : "towers"}
          />
        </div>
        <div className={side === "home-ball" ? "" : "hidden md:block"}>
          <PossessionPanel
            matchup={matchup}
            awayTeam={away}
            homeTeam={home}
            ballSide="home"
            resolver={resolver}
            successRate={successRate}
            trench={trench}
            activeGroup={activeGroup}
            view={isMobile ? mobileView : "towers"}
          />
        </div>
      </div>
      <MatchupPendingNote>{CONVENTIONAL_STATS_SOURCES}</MatchupPendingNote>
    </MatchupSection>
  );
}
