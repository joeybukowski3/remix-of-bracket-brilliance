import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const schedulePath = path.join(repoRoot, "src", "data", "pga", "schedule.json");
const generatedDir = path.join(repoRoot, "src", "data", "pga", "generated");
const overridesDir = path.join(repoRoot, "src", "data", "pga", "overrides");
const featuredTournamentPath = path.join(repoRoot, "src", "data", "pga", "featuredTournament.ts");
const registryPath = path.join(generatedDir, "registry.ts");
const exportScriptPath = path.join(repoRoot, "scripts", "export_pga_workbook.py");

const DEFAULT_PRESET_WEIGHTS = {
  sgApproach: 22,
  par4: 14,
  drivingAccuracy: 11,
  bogeyAvoidance: 11,
  sgAroundGreen: 9,
  trendRank: 11,
  birdie125150: 7,
  sgPutting: 6,
  birdieUnder125: 3,
  courseTrueSg: 6,
};

const DEFAULT_PREVIEW_THEMES = [
  {
    key: "default",
    label: "Default Model",
    description: "Balanced tournament weighting across approach, scoring pressure, and course-fit context.",
    weights: DEFAULT_PRESET_WEIGHTS,
  },
  {
    key: "ballStriking",
    label: "Ball Striking",
    description: "Turns the board toward elite iron play and tougher-hole control.",
    weights: {
      sgApproach: 28,
      par4: 16,
      drivingAccuracy: 14,
      bogeyAvoidance: 8,
      sgAroundGreen: 5,
      trendRank: 10,
      birdie125150: 7,
      sgPutting: 3,
      birdieUnder125: 1,
      courseTrueSg: 8,
    },
  },
  {
    key: "accuracy",
    label: "Accuracy",
    description: "Pushes the board toward fairways, bogey avoidance, and a steadier floor.",
    weights: {
      sgApproach: 18,
      par4: 14,
      drivingAccuracy: 23,
      bogeyAvoidance: 17,
      sgAroundGreen: 7,
      trendRank: 8,
      birdie125150: 4,
      sgPutting: 3,
      birdieUnder125: 1,
      courseTrueSg: 5,
    },
  },
  {
    key: "shortGame",
    label: "Short Game",
    description: "Raises scrambling and putting when recovery skill matters more.",
    weights: {
      sgApproach: 17,
      par4: 11,
      drivingAccuracy: 9,
      bogeyAvoidance: 11,
      sgAroundGreen: 20,
      trendRank: 9,
      birdie125150: 5,
      sgPutting: 11,
      birdieUnder125: 2,
      courseTrueSg: 5,
    },
  },
];

const DEFAULT_PRESETS = [
  {
    key: "balanced",
    label: "Balanced",
    description: "Default weekly weighting across the full board.",
    weights: DEFAULT_PRESET_WEIGHTS,
  },
  {
    key: "outright",
    label: "Outright",
    description: "More ceiling and recent-form pressure for outright and top-end betting.",
    weights: {
      sgApproach: 25,
      par4: 14,
      drivingAccuracy: 6,
      bogeyAvoidance: 5,
      sgAroundGreen: 5,
      trendRank: 18,
      birdie125150: 8,
      sgPutting: 8,
      birdieUnder125: 5,
      courseTrueSg: 6,
    },
  },
  {
    key: "top20",
    label: "Top 20",
    description: "Balanced upside with enough course-fit and cut-making stability.",
    weights: {
      sgApproach: 20,
      par4: 13,
      drivingAccuracy: 14,
      bogeyAvoidance: 13,
      sgAroundGreen: 9,
      trendRank: 9,
      birdie125150: 5,
      sgPutting: 6,
      birdieUnder125: 2,
      courseTrueSg: 9,
    },
  },
  {
    key: "top40",
    label: "Top 40",
    description: "Floor-first weighting for safer parlay and placement builds.",
    weights: {
      sgApproach: 16,
      par4: 13,
      drivingAccuracy: 17,
      bogeyAvoidance: 17,
      sgAroundGreen: 10,
      trendRank: 7,
      birdie125150: 4,
      sgPutting: 5,
      birdieUnder125: 1,
      courseTrueSg: 10,
    },
  },
];

main();

function main() {
  const args = parseArgs(process.argv.slice(2));
  const schedule = readJson(schedulePath);
  const today = args.today ?? new Date().toISOString().slice(0, 10);
  const targets = args.slug
    ? [schedule.find((entry) => entry.slug === args.slug)].filter(Boolean)
    : getCurrentAndNextTargets(schedule, today);

  if (!targets.length) {
    throw new Error("No PGA tournament targets found. Add them to src/data/pga/schedule.json or pass --slug.");
  }

  fs.mkdirSync(generatedDir, { recursive: true });
  fs.mkdirSync(overridesDir, { recursive: true });

  targets.forEach((target) => {
    if (target.registration === "generated") {
      writeGeneratedTournamentModule(target);
      ensureOverrideStub(target);
    }

    ensureTournamentData(target, args.workbook);
  });

  updateGeneratedRegistry();

  if (args.feature) {
    updateFeaturedTournament(targets[0].slug);
  }

  console.log(`PGA weekly package ready for ${targets.map((target) => target.slug).join(", ")}`);
  console.log(`- featured slug updated: ${args.feature ? "yes" : "no"}`);
}

function parseArgs(argv) {
  const args = { slug: "", workbook: "", feature: false, today: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--slug") args.slug = argv[++i] ?? "";
    if (value === "--workbook") args.workbook = argv[++i] ?? "";
    if (value === "--feature") args.feature = true;
    if (value === "--today") args.today = argv[++i] ?? "";
  }
  return args;
}

function readJson(targetPath) {
  return JSON.parse(fs.readFileSync(targetPath, "utf8"));
}

function findNextTournament(schedule, today) {
  const todayValue = normalizeDate(today);
  return [...schedule]
    .sort((left, right) => left.startDate.localeCompare(right.startDate))
    .find((entry) => normalizeDate(entry.startDate) >= todayValue);
}

function getCurrentAndNextTargets(schedule, today) {
  const ordered = [...schedule].sort((left, right) => {
    if (left.startDate !== right.startDate) return left.startDate.localeCompare(right.startDate);
    return Number(Boolean(left.alternateField)) - Number(Boolean(right.alternateField));
  });

  const current = findNextTournament(ordered, today);
  if (!current) return [];

  const nextWeek = ordered.find((entry) => entry.startDate > current.startDate);
  return [current, nextWeek].filter(Boolean);
}

function normalizeDate(value) {
  return String(value).slice(0, 10);
}

function writeGeneratedTournamentModule(entry) {
  const modulePath = path.join(generatedDir, `${entry.slug}.ts`);
  const exportName = `${toIdentifier(entry.slug)}Tournament`;
  const overrideName = `${toIdentifier(entry.slug)}Override`;
  const baseConfig = buildGeneratedBaseConfig(entry);
  const fileContents = `import { definePgaTournamentConfig, type PgaTournamentConfigInput } from "@/lib/pga/tournamentConfig";
import { applyPgaTournamentOverride } from "@/lib/pga/tournamentOverrides";
import { ${overrideName} } from "@/data/pga/overrides/${entry.slug}";

const base${exportName} = ${JSON.stringify(baseConfig, null, 2)} satisfies PgaTournamentConfigInput;

export const ${exportName} = definePgaTournamentConfig(
  applyPgaTournamentOverride(base${exportName}, ${overrideName}),
);
`;
  fs.writeFileSync(modulePath, fileContents, "utf8");
}

function ensureOverrideStub(entry) {
  const overridePath = path.join(overridesDir, `${entry.slug}.ts`);
  if (fs.existsSync(overridePath)) return;

  const overrideName = `${toIdentifier(entry.slug)}Override`;
  const fileContents = `import type { PgaTournamentOverride } from "@/lib/pga/tournamentOverrides";

export const ${overrideName}: PgaTournamentOverride = {
  // Adjust these weekly after the auto-generated package is created.
  // weightOverrides: {
  //   presets: {
  //     balanced: { sgApproach: 24, courseTrueSg: 10 },
  //   },
  // },
  // manual: {
  //   featuredNarrative: "Short homepage blurb for this tournament week.",
  //   modelFocusNote: "Add the weekly model-focus note here.",
  //   playerAdjustments: [{ player: "Example Golfer", scoreDelta: 0.03, note: "Course-fit boost" }],
  //   courseFitNotes: ["Add a tournament-specific course note here."],
  //   statPriorityTweaks: [{ key: "sgApproach", delta: 4, note: "Explain why approach should matter more this week." }],
  //   elevatedGolfers: [{ player: "Example Golfer", note: "Why this player is elevated versus the baseline power ranking." }],
  //   downgradedGolfers: [{ player: "Example Golfer", note: "Why this player is downgraded versus the baseline power ranking." }],
  // },
};
`;
  fs.writeFileSync(overridePath, fileContents, "utf8");
}

function updateGeneratedRegistry() {
  const files = fs.readdirSync(generatedDir)
    .filter((file) => file.endsWith(".ts") && file !== "registry.ts")
    .sort();

  if (files.length === 0) {
    fs.writeFileSync(
      registryPath,
      `import type { PgaTournamentConfig } from "@/lib/pga/tournamentConfig";

export const GENERATED_PGA_TOURNAMENTS: readonly PgaTournamentConfig[] = [];
`,
      "utf8",
    );
    return;
  }

  const imports = files.map((file) => {
    const slug = file.replace(/\.ts$/, "");
    return `import { ${toIdentifier(slug)}Tournament } from "@/data/pga/generated/${slug}";`;
  }).join("\n");

  const entries = files.map((file) => `  ${toIdentifier(file.replace(/\.ts$/, ""))}Tournament,`).join("\n");

  fs.writeFileSync(
    registryPath,
    `${imports}
import type { PgaTournamentConfig } from "@/lib/pga/tournamentConfig";

export const GENERATED_PGA_TOURNAMENTS = [
${entries}
] as const satisfies readonly PgaTournamentConfig[];
`,
    "utf8",
  );
}

function ensureTournamentData(entry, workbookOverride) {
  const dataOutput = path.join(repoRoot, "public", "data", "pga", entry.dataFile);
  if (fs.existsSync(dataOutput) && !workbookOverride && !isEmptyTournamentDataFile(dataOutput)) {
    return;
  }

  const workbookPath = workbookOverride || entry.workbook?.defaultPath || "";
  if (!workbookPath) {
    if (!fs.existsSync(dataOutput)) {
      fs.mkdirSync(path.dirname(dataOutput), { recursive: true });
      fs.writeFileSync(dataOutput, "[]\n", "utf8");
    }
    return;
  }

  if (!fs.existsSync(workbookPath)) {
    throw new Error(`Workbook not found for ${entry.slug}: ${workbookPath}`);
  }

  const outputs = [dataOutput, ...(entry.workbook?.mirrorOutputs ?? []).map((relativePath) => path.join(repoRoot, relativePath))];

  const exportArgs = [
    exportScriptPath,
    "--workbook",
    workbookPath,
    ...outputs.flatMap((output) => ["--output", output]),
  ];

  if (entry.workbook?.baseSheet) exportArgs.push("--base-sheet", entry.workbook.baseSheet);
  if (entry.workbook?.trendSheet) exportArgs.push("--trend-sheet", entry.workbook.trendSheet);
  if (entry.workbook?.historySheet) exportArgs.push("--history-sheet", entry.workbook.historySheet);
  if (entry.workbook?.statsSheet) exportArgs.push("--stats-sheet", entry.workbook.statsSheet);
  if (entry.workbook?.baseMode) exportArgs.push("--base-mode", entry.workbook.baseMode);

  const result = spawnSync("python", exportArgs, {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`PGA workbook export failed for ${entry.slug}.`);
  }
}

function isEmptyTournamentDataFile(targetPath) {
  try {
    const raw = fs.readFileSync(targetPath, "utf8").trim();
    if (!raw) return true;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length === 0;
  } catch {
    return true;
  }
}

function updateFeaturedTournament(slug) {
  fs.writeFileSync(
    featuredTournamentPath,
    `export const FEATURED_PGA_TOURNAMENT_OVERRIDE_SLUG: string | null = "${slug}";
`,
    "utf8",
  );
}

function toIdentifier(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => String(char).toUpperCase())
    .replace(/^[^a-zA-Z]+/, "")
    .replace(/^(.)/, (char) => char.toLowerCase());
}

function buildGeneratedBaseConfig(entry) {
  const weekLabel = buildWeekLabel(entry.startDate, entry.endDate);
  const courseSummary = entry.summaryBlurb || `${entry.courseName} is the anchor for this week's model build.`;
  const courseTraits = entry.courseTraits?.length
    ? entry.courseTraits
    : [
        `Use ${entry.courseHistoryDisplay} history as a baseline course-fit input.`,
        "Lean into the most stable ball-striking and scoring stats first.",
        "Add manual weighting tweaks once the first version of the board is live.",
      ];

  return {
    id: entry.id,
    slug: entry.slug,
    season: entry.season,
    name: entry.name,
    shortName: entry.shortName,
    courseName: entry.courseName,
    location: entry.location,
    schedule: {
      weekLabel,
      startDate: entry.startDate,
      endDate: entry.endDate,
    },
    summary: {
      blurb: courseSummary,
      bullets: courseTraits.slice(0, 3),
      modelFocus: entry.modelFocus || "This week's model starts from the site's standard power-ranking framework, then leans into the stats most likely to translate to this venue. Use the override layer to make sharper tournament-specific adjustments once the first baseline package is live.",
    },
    homepageFeature: {
      eyebrow: entry.homepageEyebrow || "Featured PGA model",
      ctaLabel: `Open full ${entry.shortName} board`,
    },
    tournamentInfo: {
      previousWinner: entry.previousWinner,
      purse: entry.purse,
      winningScore: entry.winningScore || "Official score archive unavailable in current feed",
      averageCutLineLast5Years: entry.averageCutLineLast5Years || "Historical cut-line average unavailable in current feed",
      courseFitProfile: entry.courseFitProfile ?? courseTraits.slice(0, 4),
    },
    hero: {
      badge: "PGA tournament model",
      title: `${entry.name} ${entry.season} Picks & Best Bets`,
      intro: `The ${entry.name} page is live with the active model, rankings table, and tournament routing already wired into the weekly PGA workflow.`,
      support: "Use the override file to sharpen the writeup, weekly emphasis, player boosts, and market-specific angles without rebuilding the page shell.",
      primaryCtaLabel: "Open Full Model",
      secondaryCtaLabel: "Read written picks",
    },
    seo: {
      title: `${entry.name} ${entry.season} Picks, Best Bets & PGA Model`,
      description: `${entry.name} ${entry.season} picks and model-driven PGA rankings for ${entry.courseName}.`,
      faqs: [
        {
          question: `What matters most for ${entry.name} ${entry.season}?`,
          answer: courseSummary,
        },
        {
          question: `How should you use the ${entry.name} model?`,
          answer: "Start with the balanced preset, review the leaderboard, then use the override file to push the board toward the profile you want to bet.",
        },
        {
          question: "Where do manual weekly adjustments go?",
          answer: `Edit src/data/pga/overrides/${entry.slug}.ts to change weights, narrative copy, and player adjustments without regenerating the package.`,
        },
        {
          question: "How are the rankings updated?",
          answer: "The player table is generated from the weekly PGA workbook export and re-ranked automatically through the shared PGA model pipeline.",
        },
      ],
    },
    model: {
      dataPath: `/data/pga/${entry.dataFile}`,
      eventType: entry.eventType || "PGA TOUR Event",
      fieldAverage: entry.fieldAverage || "Baseline field build",
      cutLine: entry.cutLine || "Cut benchmark updating",
      noCutLabel: entry.noCutLabel || "Standard cut",
      courseHistoryDisplay: entry.courseHistoryDisplay || entry.courseName,
      previewEyebrow: `Build your ${entry.shortName} model`,
      previewHeadline: "Shift the weights. See who rises.",
      previewBody: "Preview the board, then open the full model room to customize every ranking.",
      previewRankingTitle: `${entry.courseHistoryDisplay || entry.courseName} ranking preview`,
      previewRankingBody: "Lower rank cells grade better. Use the preview to see how the board moves before opening the full slider room.",
      previewRailCtaTitle: "Model room",
      previewRailCtaBody: "Open the full PGA model room, apply presets, and scan the entire field.",
      previewSliderKeys: ["sgApproach", "drivingAccuracy", "sgAroundGreen"],
      previewThemeKeys: DEFAULT_PREVIEW_THEMES.map((theme) => theme.key),
      topProjectionPrimaryStatKey: "sgApproachRank",
      topProjectionPrimaryStatLabel: "Approach",
      heroSteps: [
        { title: "Generate the weekly shell", body: "This page, the tournament route, and the base model wiring are created automatically from the schedule entry." },
        { title: "Preview the live board", body: "The ranking table updates from the exported tournament dataset without needing page-level rewrites." },
        { title: "Apply manual overrides", body: "Tune presets, narrative copy, and player boosts in the override file once the baseline package is live." },
        { title: "Publish the final card", body: "Use the existing picks page and full model room after manual edits tighten the weekly angle." },
      ],
      heroStats: [
        { value: "Auto", label: "Workflow mode" },
        { value: "4", label: "Preset views" },
        { value: "3", label: "Preview sliders" },
        { value: weekLabel, label: "Tournament week" },
        { value: `/pga/${entry.slug}/model`, label: "Model route" },
      ],
      valueStrip: [
        { title: "Generated tournament shell", body: "Routing, page copy scaffolding, and the shared PGA model wiring are created together so the weekly workflow is repeatable." },
        { title: "Manual override layer", body: "Use the override file for narrative changes, weight shifts, player boosts, and course-specific tweaks without rebuilding the page." },
        { title: "Homepage + landing page sync", body: "The featured homepage PGA module and tournament landing page both point at the same featured-tournament configuration." },
      ],
      weightShiftNotes: [
        { title: "Balanced starting point", body: "The default preset gives you a safe baseline before you add your weekly tournament-specific emphasis." },
        { title: "Course-fit tweak lane", body: "Use the override file to increase the stats you believe matter more for this course and field." },
        { title: "Player adjustment lane", body: "Add measured player boosts or downgrades after the first automated ranking pass is live." },
      ],
      courseInsights: [
        { title: "Course summary", body: courseSummary },
        { title: "Key traits", body: courseTraits[0] },
        { title: "Weekly note", body: "Layer in manual notes after the automated baseline package is generated." },
      ],
      statColumns: [
        { key: "sgApproachRank", abbr: "App", mobileLabel: "Approach", tooltip: "SG: Approach the Green rank for the current field." },
        { key: "par4Rank", abbr: "P4", mobileLabel: "Par 4", tooltip: "Par 4 scoring rank for the current field." },
        { key: "drivingAccuracyRank", abbr: "DA", mobileLabel: "Drive Acc", tooltip: "Driving accuracy rank for the current field." },
        { key: "bogeyAvoidanceRank", abbr: "BAvd", mobileLabel: "Bogey Av", tooltip: "Bogey avoidance rank for the current field." },
        { key: "sgAroundGreenRank", abbr: "ARG", mobileLabel: "ARG", tooltip: "Around-the-green rank for the current field." },
        { key: "sgPuttingRank", abbr: "Putt", mobileLabel: "Putting", tooltip: "Putting rank for the current field." },
      ],
      previewThemes: DEFAULT_PREVIEW_THEMES,
      presets: DEFAULT_PRESETS,
    },
    picksPage: {
      top10Intro: `This is the baseline ${entry.shortName} top-10 intro. Replace it in the override file once you finalize the weekly betting angle.`,
      top40Intro: `This is the baseline ${entry.shortName} top-40 intro. Replace it in the override file after the automated board is generated.`,
      strategyBullets: courseTraits.slice(0, 5),
      parlayBullets: [
        "Use the top-40 preset to identify lower-volatility golfers for placement parlays.",
        "Avoid forcing outrights into parlays when the automated board shows a better floor-first path.",
        "Use manual overrides to add any tournament-specific player fades before publishing the final card.",
      ],
      tierOneBets: [
        { player: "Baseline model leader", odds: "Model lean", analysis: "The auto-generated baseline highlights the strongest all-around fit at the top of the weighted board until manual betting adjustments are added." },
      ],
      tierTwoBets: [
        { player: "Secondary model value", odds: "Model lean", analysis: "Use this slot for the next-best fit once you review the initial ranking table and market board." },
      ],
      tierThreeBets: [
        { player: "Upside model play", odds: "Model lean", analysis: "This section can be sharpened later with manual outrights or placement targets after weekly tuning." },
      ],
      fades: [
        "Use the baseline board to identify golfers whose public perception exceeds their weighted statistical fit this week.",
      ],
      top40Rows: [
        ["Baseline top-40 anchor", "Use the first model pass to identify the safest floor-first golfers before adding manual placement-market edits."],
      ],
      summaryRows: [
        ["Baseline board", "Model lean", "8", "Initial weekly summary generated from the active tournament configuration and live ranking table."],
      ],
    },
    manual: {
      modelFocusNote: entry.modelFocus,
      elevatedGolfers: [
        { player: "Baseline elevated golfer", note: "This slot automatically yields to manual overrides once you add tournament-specific golfer adjustments." },
      ],
      downgradedGolfers: [
        { player: "Baseline downgraded golfer", note: "This slot automatically yields to manual overrides once you add tournament-specific golfer adjustments." },
      ],
    },
  };
}

function buildWeekLabel(startDate, endDate) {
  const start = parseDateParts(startDate);
  const end = parseDateParts(endDate);
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const startLabel = `${monthNames[start.month - 1]} ${start.day}, ${start.year}`;
  const endMonth = start.month === end.month ? "" : `${monthNames[end.month - 1]} `;
  const endYear = start.year === end.year ? "" : `, ${end.year}`;
  return `${startLabel} - ${endMonth}${end.day}${endYear}`;
}

function parseDateParts(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return { year, month, day };
}
