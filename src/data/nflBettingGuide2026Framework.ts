export type GuideChapterStatus = "framework" | "planned";

export type GuideChapter = {
  number: string;
  title: string;
  summary: string;
  status: GuideChapterStatus;
  items?: string[];
};

export type GuidePart = {
  id: string;
  label: string;
  title: string;
  description: string;
  chapters: GuideChapter[];
};

export const NFL_BETTING_GUIDE_ROUTE = "/nfl/2026-betting-guide";

export const NFL_BETTING_GUIDE_PARTS: GuidePart[] = [
  {
    id: "front-matter",
    label: "Opening",
    title: "Front Matter",
    description: "Guide orientation, executive conclusions and instructions for using the models.",
    chapters: [
      {
        number: "01",
        title: "Guide Cover & Edition Information",
        summary: "Product title, version, data cutoff, update history and responsible-betting notice.",
        status: "framework",
      },
      {
        number: "02",
        title: "How to Use This Guide",
        summary: "Definitions for ratings, projections, confidence levels, market edges and source labels.",
        status: "framework",
      },
      {
        number: "03",
        title: "Executive Summary",
        summary: "The major conclusions, strongest teams, improvement candidates, decline candidates and futures opportunities.",
        status: "planned",
      },
    ],
  },
  {
    id: "reviewing-2025",
    label: "Section A",
    title: "Reviewing the 2025 Season",
    description: "A complete review of team strength, underlying performance and late-season direction.",
    chapters: [
      {
        number: "04",
        title: "Final 2025 Power Rankings",
        summary: "Full-season JoeKnowsBall power ratings with raw inputs, normalized components and methodology.",
        status: "planned",
      },
      {
        number: "05",
        title: "Overachievers & Underachievers",
        summary: "Record-versus-performance analysis, variance indicators and likely regression direction.",
        status: "planned",
      },
      {
        number: "06",
        title: "Weeks 10–17 Power Ratings",
        summary: "Late-season ratings that exclude Week 18 and compare recent form with full-season strength.",
        status: "planned",
      },
      {
        number: "07",
        title: "2025 Market Review",
        summary: "A future chapter for ATS, totals, closing-line and market-expectation takeaways.",
        status: "planned",
      },
    ],
  },
  {
    id: "entering-2026",
    label: "Section B",
    title: "Entering the 2026 Season",
    description: "The projected team-strength model, offseason adjustments and schedule environment.",
    chapters: [
      {
        number: "08",
        title: "Adjusted 2026 Preseason Power Rankings",
        summary: "The 2025 baseline adjusted for quarterbacks, roster movement, coaching, injuries and regression.",
        status: "planned",
      },
      {
        number: "09",
        title: "Quarterback, Roster & Coaching Adjustment Board",
        summary: "Auditable team-by-team adjustments with impact, confidence, explanation and source references.",
        status: "planned",
      },
      {
        number: "10",
        title: "2026 Strength of Schedule",
        summary: "Opponent strength, home and road splits, divisional difficulty and schedule sequencing.",
        status: "planned",
      },
      {
        number: "11",
        title: "Rest, Travel & Schedule Spots",
        summary: "Short weeks, byes, travel, international games, road clusters and other scheduling disadvantages.",
        status: "planned",
      },
      {
        number: "12",
        title: "Projected Standings & Playoff Probabilities",
        summary: "Game-level simulation outputs for wins, divisions, playoffs, conferences and the Super Bowl.",
        status: "planned",
      },
    ],
  },
  {
    id: "division-breakdowns",
    label: "Section C",
    title: "Division Breakdowns",
    description: "Eight division chapters ordered by JoeKnowsBall projected strength and betting value.",
    chapters: [
      { number: "13", title: "AFC East", summary: "Projected order, probabilities, market prices, value and team capsules.", status: "planned" },
      { number: "14", title: "AFC North", summary: "Projected order, probabilities, market prices, value and team capsules.", status: "planned" },
      { number: "15", title: "AFC South", summary: "Projected order, probabilities, market prices, value and team capsules.", status: "planned" },
      { number: "16", title: "AFC West", summary: "Projected order, probabilities, market prices, value and team capsules.", status: "planned" },
      { number: "17", title: "NFC East", summary: "Projected order, probabilities, market prices, value and team capsules.", status: "planned" },
      { number: "18", title: "NFC North", summary: "Projected order, probabilities, market prices, value and team capsules.", status: "planned" },
      { number: "19", title: "NFC South", summary: "Projected order, probabilities, market prices, value and team capsules.", status: "planned" },
      { number: "20", title: "NFC West", summary: "Projected order, probabilities, market prices, value and team capsules.", status: "planned" },
    ],
  },
  {
    id: "awards",
    label: "Section D",
    title: "Awards",
    description: "Historical profiles, scenario-based projections and market-value analysis.",
    chapters: [
      { number: "21", title: "Coach of the Year", summary: "Historical profiles, candidate funnel, scenarios, probabilities and value.", status: "planned" },
      { number: "22", title: "Most Valuable Player", summary: "Team and statistical scenarios required for the leading MVP candidates.", status: "planned" },
      { number: "23", title: "Offensive Player of the Year", summary: "Volume, efficiency, team context, narrative and market comparison.", status: "planned" },
      { number: "24", title: "Offensive Rookie of the Year", summary: "Draft capital, projected role, opportunity, environment and historical thresholds.", status: "planned" },
    ],
  },
  {
    id: "team-guide",
    label: "Section E",
    title: "Team-by-Team Guide",
    description: "Thirty-two detailed team chapters grouped by division and ordered by projected power rating.",
    chapters: [
      {
        number: "25",
        title: "AFC East Team Chapters",
        summary: "Individual team pages using the approved team-page template.",
        status: "planned",
        items: ["Buffalo Bills", "Miami Dolphins", "New England Patriots", "New York Jets"],
      },
      {
        number: "26",
        title: "AFC North Team Chapters",
        summary: "Individual team pages using the approved team-page template.",
        status: "planned",
        items: ["Baltimore Ravens", "Cincinnati Bengals", "Cleveland Browns", "Pittsburgh Steelers"],
      },
      {
        number: "27",
        title: "AFC South Team Chapters",
        summary: "Individual team pages using the approved team-page template.",
        status: "planned",
        items: ["Houston Texans", "Indianapolis Colts", "Jacksonville Jaguars", "Tennessee Titans"],
      },
      {
        number: "28",
        title: "AFC West Team Chapters",
        summary: "Individual team pages using the approved team-page template.",
        status: "planned",
        items: ["Denver Broncos", "Kansas City Chiefs", "Las Vegas Raiders", "Los Angeles Chargers"],
      },
      {
        number: "29",
        title: "NFC East Team Chapters",
        summary: "Individual team pages using the approved team-page template.",
        status: "planned",
        items: ["Dallas Cowboys", "New York Giants", "Philadelphia Eagles", "Washington Commanders"],
      },
      {
        number: "30",
        title: "NFC North Team Chapters",
        summary: "Individual team pages using the approved team-page template.",
        status: "planned",
        items: ["Chicago Bears", "Detroit Lions", "Green Bay Packers", "Minnesota Vikings"],
      },
      {
        number: "31",
        title: "NFC South Team Chapters",
        summary: "Individual team pages using the approved team-page template.",
        status: "planned",
        items: ["Atlanta Falcons", "Carolina Panthers", "New Orleans Saints", "Tampa Bay Buccaneers"],
      },
      {
        number: "32",
        title: "NFC West Team Chapters",
        summary: "Individual team pages using the approved team-page template.",
        status: "planned",
        items: ["Arizona Cardinals", "Los Angeles Rams", "San Francisco 49ers", "Seattle Seahawks"],
      },
    ],
  },
  {
    id: "appendices",
    label: "Reference",
    title: "Appendices",
    description: "Full methodology, definitions, source citations and revision history.",
    chapters: [
      { number: "A", title: "Model Methodology", summary: "Formulas, weights, normalization rules, backtesting and known limitations.", status: "planned" },
      { number: "B", title: "Metric Glossary", summary: "Plain-language definitions for every statistic and derived rating used in the guide.", status: "planned" },
      { number: "C", title: "Sources & Citations", summary: "Complete source list, publication references, URLs, access dates and page-level citations where necessary.", status: "framework" },
      { number: "D", title: "Data & Editorial Labels", summary: "Definitions for official, public, derived, projected, market and editorial information.", status: "framework" },
      { number: "E", title: "Version History", summary: "Guide revisions, model updates, odds refreshes and corrected information.", status: "framework" },
    ],
  },
];

export const NFL_BETTING_GUIDE_CHAPTER_COUNT = NFL_BETTING_GUIDE_PARTS.reduce(
  (total, part) => total + part.chapters.length,
  0,
);
