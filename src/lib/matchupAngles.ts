import type { Team, TeamStats } from "@/data/ncaaTeams";
import { getTop50Average } from "@/data/ncaaTeams";

export interface MatchupAngle {
  id: string;
  title: string;
  description: string;
  favors: "teamA" | "teamB";
  severity: "major" | "moderate" | "minor";
  category: "offense" | "defense" | "efficiency" | "pace" | "shooting" | "rebounding";
}

interface StatMeta {
  key: keyof TeamStats;
  label: string;
  higherIsBetter: boolean;
  category: MatchupAngle["category"];
}

const STAT_META: StatMeta[] = [
  { key: "ppg", label: "Points Per Game", higherIsBetter: true, category: "offense" },
  { key: "oppPpg", label: "Opponent PPG", higherIsBetter: false, category: "defense" },
  { key: "fgPct", label: "FG%", higherIsBetter: true, category: "shooting" },
  { key: "threePct", label: "3PT%", higherIsBetter: true, category: "shooting" },
  { key: "ftPct", label: "FT%", higherIsBetter: true, category: "shooting" },
  { key: "rpg", label: "Rebounds/Game", higherIsBetter: true, category: "rebounding" },
  { key: "apg", label: "Assists/Game", higherIsBetter: true, category: "offense" },
  { key: "spg", label: "Steals/Game", higherIsBetter: true, category: "defense" },
  { key: "bpg", label: "Blocks/Game", higherIsBetter: true, category: "defense" },
  { key: "tpg", label: "Turnovers/Game", higherIsBetter: false, category: "offense" },
  { key: "adjOE", label: "Adj. Offensive Efficiency", higherIsBetter: true, category: "efficiency" },
  { key: "adjDE", label: "Adj. Defensive Efficiency", higherIsBetter: false, category: "efficiency" },
  { key: "tempo", label: "Tempo", higherIsBetter: true, category: "pace" },
  { key: "sos", label: "Strength of Schedule", higherIsBetter: true, category: "offense" },
];

function pctDiff(a: number, b: number): number {
  if (b === 0) return 0;
  return ((a - b) / b) * 100;
}

function getSeverity(pct: number): MatchupAngle["severity"] {
  const abs = Math.abs(pct);
  if (abs >= 10) return "major";
  if (abs >= 5) return "moderate";
  return "minor";
}

export function generateMatchupAngles(teamA: Team, teamB: Team): MatchupAngle[] {
  const top50Avg = getTop50Average();
  const angles: MatchupAngle[] = [];
  let idCounter = 0;

  // 1. Direct stat comparison edges
  for (const meta of STAT_META) {
    const valA = teamA.stats[meta.key] as number;
    const valB = teamB.stats[meta.key] as number;
    const diff = pctDiff(valA, valB);
    const absDiff = Math.abs(diff);

    if (absDiff >= 5) {
      const aIsBetter = meta.higherIsBetter ? valA > valB : valA < valB;
      angles.push({
        id: `direct-${idCounter++}`,
        title: `${meta.label} Edge`,
        description: `${aIsBetter ? teamA.abbreviation : teamB.abbreviation} has a ${absDiff.toFixed(1)}% advantage in ${meta.label} (${valA} vs ${valB})`,
        favors: aIsBetter ? "teamA" : "teamB",
        severity: getSeverity(diff),
        category: meta.category,
      });
    }
  }

  // 2. Home/Away split angles - teams that drop off significantly on the road
  const homeAwayKeys: { key: keyof TeamStats; label: string; higherIsBetter: boolean; category: MatchupAngle["category"] }[] = [
    { key: "ppg", label: "scoring", higherIsBetter: true, category: "offense" },
    { key: "fgPct", label: "FG%", higherIsBetter: true, category: "shooting" },
    { key: "threePct", label: "3PT%", higherIsBetter: true, category: "shooting" },
    { key: "adjOE", label: "offensive efficiency", higherIsBetter: true, category: "efficiency" },
    { key: "adjDE", label: "defensive efficiency", higherIsBetter: false, category: "efficiency" },
    { key: "tpg", label: "turnovers", higherIsBetter: false, category: "offense" },
  ];

  for (const stat of homeAwayKeys) {
    const homeA = teamA.homeStats[stat.key] as number;
    const awayA = teamA.awayStats[stat.key] as number;
    const homeB = teamB.homeStats[stat.key] as number;
    const awayB = teamB.awayStats[stat.key] as number;
    const avgVal = top50Avg[stat.key] as number;

    // Calculate home-away dropoff for each team
    const dropA = pctDiff(awayA - homeA, Math.abs(homeA));
    const dropB = pctDiff(awayB - homeB, Math.abs(homeB));

    // Compare drops to top-50 average drop (approximate 3-5% typical)
    const typicalDrop = -3.5; // typical % drop on road

    // If teamA drops much more than average on the road
    if (Math.abs(dropA) > 5 && dropA < typicalDrop * 1.5) {
      angles.push({
        id: `road-${idCounter++}`,
        title: `${teamA.abbreviation} Road ${stat.label} Drop`,
        description: `${teamA.abbreviation} drops ${Math.abs(dropA).toFixed(1)}% in ${stat.label} on the road (avg drop: ${Math.abs(typicalDrop).toFixed(1)}%). This could hurt them away from home.`,
        favors: "teamB",
        severity: getSeverity(dropA),
        category: stat.category,
      });
    }
    if (Math.abs(dropB) > 5 && dropB < typicalDrop * 1.5) {
      angles.push({
        id: `road-${idCounter++}`,
        title: `${teamB.abbreviation} Road ${stat.label} Drop`,
        description: `${teamB.abbreviation} drops ${Math.abs(dropB).toFixed(1)}% in ${stat.label} on the road (avg drop: ${Math.abs(typicalDrop).toFixed(1)}%). This could hurt them away from home.`,
        favors: "teamA",
        severity: getSeverity(dropB),
        category: stat.category,
      });
    }
  }

  // 3. Offensive strength vs defensive weakness matchups
  // e.g. teamA scores a lot from 3 and teamB allows poor 3PT defense
  const offVsDef: { offKey: keyof TeamStats; defKey: keyof TeamStats; offLabel: string; defLabel: string }[] = [
    { offKey: "threePct", defKey: "oppPpg", offLabel: "3-point shooting", defLabel: "points allowed" },
    { offKey: "ppg", defKey: "adjDE", offLabel: "scoring", defLabel: "defensive efficiency" },
    { offKey: "rpg", defKey: "rpg", offLabel: "rebounding", defLabel: "rebounding" },
  ];

  for (const pair of offVsDef) {
    const aOff = teamA.stats[pair.offKey] as number;
    const bDef = teamB.stats[pair.defKey] as number;
    const bOff = teamB.stats[pair.offKey] as number;
    const aDef = teamA.stats[pair.defKey] as number;
    const avgOff = top50Avg[pair.offKey] as number;
    const avgDef = top50Avg[pair.defKey] as number;

    // teamA's offense vs top50 avg AND teamB's defense vs top50 avg
    const aOffVsAvg = pctDiff(aOff, avgOff);
    const bDefVsAvg = pctDiff(bDef, avgDef);

    // If teamA is well above average offensively AND teamB is below average defensively
    if (aOffVsAvg > 3 && bDefVsAvg > 3) {
      angles.push({
        id: `mismatch-${idCounter++}`,
        title: `${teamA.abbreviation} ${pair.offLabel} vs ${teamB.abbreviation} ${pair.defLabel}`,
        description: `${teamA.abbreviation} is ${aOffVsAvg.toFixed(1)}% above avg in ${pair.offLabel} while ${teamB.abbreviation} allows ${bDefVsAvg.toFixed(1)}% more ${pair.defLabel} than avg. A potential mismatch.`,
        favors: "teamA",
        severity: getSeverity(aOffVsAvg + bDefVsAvg),
        category: "efficiency",
      });
    }
    if (pctDiff(bOff, avgOff) > 3 && pctDiff(aDef, avgDef) > 3) {
      angles.push({
        id: `mismatch-${idCounter++}`,
        title: `${teamB.abbreviation} ${pair.offLabel} vs ${teamA.abbreviation} ${pair.defLabel}`,
        description: `${teamB.abbreviation} is ${pctDiff(bOff, avgOff).toFixed(1)}% above avg in ${pair.offLabel} while ${teamA.abbreviation} allows ${pctDiff(aDef, avgDef).toFixed(1)}% more ${pair.defLabel} than avg. A potential mismatch.`,
        favors: "teamB",
        severity: getSeverity(pctDiff(bOff, avgOff) + pctDiff(aDef, avgDef)),
        category: "efficiency",
      });
    }
  }

  // 4. Vs Top 50 average angles
  for (const meta of STAT_META) {
    const valA = teamA.stats[meta.key] as number;
    const valB = teamB.stats[meta.key] as number;
    const avg = top50Avg[meta.key] as number;
    
    const aVsAvg = pctDiff(valA, avg);
    const bVsAvg = pctDiff(valB, avg);

    // Only flag if one team is well above average and the other is below
    if (Math.abs(aVsAvg - bVsAvg) > 8) {
      const aAboveAvg = meta.higherIsBetter ? aVsAvg > bVsAvg : aVsAvg < bVsAvg;
      angles.push({
        id: `vs-avg-${idCounter++}`,
        title: `${meta.label} vs Top 50 Average`,
        description: `${teamA.abbreviation} is ${aVsAvg > 0 ? "+" : ""}${aVsAvg.toFixed(1)}% vs avg, ${teamB.abbreviation} is ${bVsAvg > 0 ? "+" : ""}${bVsAvg.toFixed(1)}% vs avg in ${meta.label}`,
        favors: aAboveAvg ? "teamA" : "teamB",
        severity: getSeverity(aVsAvg - bVsAvg),
        category: meta.category,
      });
    }
  }

  // Sort by severity (major first), then deduplicate by similar titles
  const severityOrder = { major: 0, moderate: 1, minor: 2 };
  angles.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Deduplicate - remove angles with very similar descriptions
  const seen = new Set<string>();
  return angles.filter((angle) => {
    const key = `${angle.category}-${angle.favors}-${angle.severity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getOverallAdvantage(
  teamA: Team,
  teamB: Team,
  angles: MatchupAngle[]
): { team: "teamA" | "teamB" | "even"; margin: string } {
  const severityPoints = { major: 3, moderate: 2, minor: 1 };
  let scoreA = 0;
  let scoreB = 0;

  for (const angle of angles) {
    const points = severityPoints[angle.severity];
    if (angle.favors === "teamA") scoreA += points;
    else scoreB += points;
  }

  const diff = Math.abs(scoreA - scoreB);
  const total = scoreA + scoreB;
  const pct = total > 0 ? (diff / total) * 100 : 0;

  if (pct < 5) return { team: "even", margin: "Essentially even" };
  if (pct < 15) return { team: scoreA > scoreB ? "teamA" : "teamB", margin: "Slight edge" };
  if (pct < 30) return { team: scoreA > scoreB ? "teamA" : "teamB", margin: "Moderate edge" };
  return { team: scoreA > scoreB ? "teamA" : "teamB", margin: "Significant edge" };
}
