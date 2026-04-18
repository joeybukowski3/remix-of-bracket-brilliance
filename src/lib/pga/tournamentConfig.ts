import { z } from "zod";
import type { PgaWeightKey, PgaWeights } from "@/lib/pga/pgaTypes";

const pgaWeightsSchema = z.object({
  sgApproach: z.number(),
  par4: z.number(),
  drivingAccuracy: z.number(),
  bogeyAvoidance: z.number(),
  sgAroundGreen: z.number(),
  trendRank: z.number(),
  birdie125150: z.number(),
  sgPutting: z.number(),
  birdieUnder125: z.number(),
  courseTrueSg: z.number(),
}) satisfies z.ZodType<PgaWeights>;

const weightKeySchema = z.enum([
  "sgApproach",
  "par4",
  "drivingAccuracy",
  "bogeyAvoidance",
  "sgAroundGreen",
  "trendRank",
  "birdie125150",
  "sgPutting",
  "birdieUnder125",
  "courseTrueSg",
]) satisfies z.ZodType<PgaWeightKey>;

const presetSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  weights: pgaWeightsSchema,
});

const copyItemSchema = z.object({
  title: z.string(),
  body: z.string(),
});

const faqSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

const betSchema = z.object({
  player: z.string(),
  odds: z.string(),
  edge: z.string().optional(),
  analysis: z.string(),
});

const tableSummaryRowSchema = z.tuple([z.string(), z.string(), z.string(), z.string()]);
const top40RowSchema = z.tuple([z.string(), z.string()]);

const courseInsightSchema = z.object({
  title: z.string(),
  body: z.string(),
});

const previewThemeSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  weights: pgaWeightsSchema,
});

const heroStepSchema = z.object({
  title: z.string(),
  body: z.string(),
});

const heroStatSchema = z.object({
  value: z.string(),
  label: z.string(),
});

const golferDeltaSchema = z.object({
  player: z.string(),
  note: z.string(),
});

const playerAdjustmentSchema = z.object({
  player: z.string(),
  scoreDelta: z.number(),
  note: z.string().optional(),
});

const statPriorityTweakSchema = z.object({
  key: weightKeySchema,
  delta: z.number(),
  note: z.string(),
});

const modelStatColumnSchema = z.object({
  key: z.enum([
    "sgApproachRank",
    "par4Rank",
    "drivingAccuracyRank",
    "bogeyAvoidanceRank",
    "sgAroundGreenRank",
    "birdie125150Rank",
    "sgPuttingRank",
    "birdieUnder125Rank",
  ]),
  abbr: z.string(),
  mobileLabel: z.string(),
  tooltip: z.string(),
});

const tournamentConfigSchema = z.object({
  id: z.string(),
  slug: z.string(),
  season: z.number(),
  name: z.string(),
  shortName: z.string(),
  courseName: z.string(),
  location: z.string(),
  featured: z.boolean().optional(),
  indexable: z.boolean().optional(),
  schedule: z.object({
    weekLabel: z.string(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }).optional(),
  summary: z.object({
    blurb: z.string(),
    bullets: z.array(z.string()).optional(),
    modelFocus: z.string().optional(),
  }).optional(),
  homepageFeature: z.object({
    eyebrow: z.string(),
    ctaLabel: z.string(),
  }).optional(),
  tournamentInfo: z.object({
    previousWinner: z.string().optional(),
    purse: z.string().optional(),
    winningScore: z.string().optional(),
    averageCutLineLast5Years: z.string().optional(),
    courseFitProfile: z.array(z.string()).optional(),
  }).optional(),
  hero: z.object({
    badge: z.string(),
    title: z.string(),
    intro: z.string(),
    support: z.string(),
    primaryCtaLabel: z.string(),
    secondaryCtaLabel: z.string(),
  }),
  seo: z.object({
    title: z.string(),
    description: z.string(),
    faqs: z.array(faqSchema),
  }),
  model: z.object({
    dataPath: z.string(),
    eventType: z.string(),
    fieldAverage: z.string(),
    cutLine: z.string(),
    noCutLabel: z.string(),
    relatedEventLabel: z.string(),
    courseHistoryDisplay: z.string(),
    previewEyebrow: z.string(),
    previewHeadline: z.string(),
    previewBody: z.string(),
    previewRankingTitle: z.string(),
    previewRankingBody: z.string(),
    previewRailCtaTitle: z.string(),
    previewRailCtaBody: z.string(),
    previewSliderKeys: z.array(weightKeySchema).min(1),
    previewThemeKeys: z.array(z.string()).min(1),
    topProjectionPrimaryStatKey: modelStatColumnSchema.shape.key,
    topProjectionPrimaryStatLabel: z.string(),
    heroSteps: z.array(heroStepSchema).length(4),
    heroStats: z.array(heroStatSchema),
    valueStrip: z.array(copyItemSchema).length(3),
    weightShiftNotes: z.array(copyItemSchema).length(3),
    courseInsights: z.array(courseInsightSchema).length(3),
    statColumns: z.array(modelStatColumnSchema).min(3),
    previewThemes: z.array(previewThemeSchema).min(1),
    presets: z.array(presetSchema).min(1),
  }),
  picksPage: z.object({
    top10Intro: z.string(),
    top40Intro: z.string(),
    strategyBullets: z.array(z.string()),
    parlayBullets: z.array(z.string()),
    tierOneBets: z.array(betSchema),
    tierTwoBets: z.array(betSchema),
    tierThreeBets: z.array(betSchema),
    fades: z.array(z.string()),
    top40Rows: z.array(top40RowSchema),
    summaryRows: z.array(tableSummaryRowSchema),
  }),
  manual: z.object({
    featuredNarrative: z.string().optional(),
    modelFocusNote: z.string().optional(),
    playerAdjustments: z.array(playerAdjustmentSchema).optional(),
    courseFitNotes: z.array(z.string()).optional(),
    statPriorityTweaks: z.array(statPriorityTweakSchema).optional(),
    elevatedGolfers: z.array(golferDeltaSchema).optional(),
    downgradedGolfers: z.array(golferDeltaSchema).optional(),
  }).optional(),
}) satisfies z.ZodTypeAny;

export type PgaTournamentConfigInput = z.input<typeof tournamentConfigSchema>;
export type PgaTournamentConfig = z.infer<typeof tournamentConfigSchema>;
export type PgaPresetDefinition = PgaTournamentConfig["model"]["presets"][number];
export type PgaPreviewTheme = PgaTournamentConfig["model"]["previewThemes"][number];
export type PgaModelStatColumn = PgaTournamentConfig["model"]["statColumns"][number];

export function definePgaTournamentConfig(config: PgaTournamentConfigInput): PgaTournamentConfig {
  return tournamentConfigSchema.parse(config);
}

export function getTournamentPicksPath(tournament: Pick<PgaTournamentConfig, "slug">) {
  return `/pga/${tournament.slug}`;
}

export function getTournamentModelPath(tournament: Pick<PgaTournamentConfig, "slug" | "featured">) {
  if (tournament.featured) return "/pga/model";
  return `/pga/${tournament.slug}/model`;
}

export function getTournamentModelTablePath(tournament: Pick<PgaTournamentConfig, "slug" | "featured">) {
  if (tournament.featured) return "/pga/model/table";
  return `/pga/${tournament.slug}/model/table`;
}
