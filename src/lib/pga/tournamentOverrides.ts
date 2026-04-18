import type { PgaModelStatColumn, PgaTournamentConfigInput, PgaTournamentConfig } from "@/lib/pga/tournamentConfig";
import type { PgaWeightKey, PgaWeights } from "@/lib/pga/pgaTypes";

export type PgaTournamentPlayerAdjustment = {
  player: string;
  scoreDelta: number;
  note?: string;
};

export type PgaTournamentStatPriorityTweak = {
  key: PgaWeightKey;
  delta: number;
  note: string;
};

export type PgaTournamentOverride = {
  featured?: boolean;
  indexable?: boolean;
  schedule?: Partial<NonNullable<PgaTournamentConfig["schedule"]>>;
  summary?: Partial<NonNullable<PgaTournamentConfig["summary"]>>;
  homepageFeature?: Partial<NonNullable<PgaTournamentConfig["homepageFeature"]>>;
  hero?: Partial<PgaTournamentConfigInput["hero"]>;
  seo?: Partial<PgaTournamentConfigInput["seo"]>;
  model?: Partial<Omit<PgaTournamentConfigInput["model"], "presets" | "previewThemes" | "statColumns">> & {
    statColumns?: PgaModelStatColumn[];
  };
  picksPage?: Partial<PgaTournamentConfigInput["picksPage"]>;
  weightOverrides?: {
    presets?: Record<string, Partial<PgaWeights>>;
    previewThemes?: Record<string, Partial<PgaWeights>>;
  };
  manual?: {
    featuredNarrative?: string;
    playerAdjustments?: PgaTournamentPlayerAdjustment[];
    courseFitNotes?: string[];
    statPriorityTweaks?: PgaTournamentStatPriorityTweak[];
  };
};

export function applyPgaTournamentOverride(
  base: PgaTournamentConfigInput,
  override: PgaTournamentOverride = {},
): PgaTournamentConfigInput {
  const nextPresets = base.model.presets.map((preset) => ({
    ...preset,
    weights: {
      ...preset.weights,
      ...(override.weightOverrides?.presets?.[preset.key] ?? {}),
    },
  }));

  const nextPreviewThemes = base.model.previewThemes.map((theme) => ({
    ...theme,
    weights: {
      ...theme.weights,
      ...(override.weightOverrides?.previewThemes?.[theme.key] ?? {}),
    },
  }));

  return {
    ...base,
    ...pickDefined({
      featured: override.featured,
      indexable: override.indexable,
      schedule: override.schedule ? { ...(base.schedule ?? {}), ...override.schedule } : base.schedule,
      summary: override.summary ? { ...(base.summary ?? {}), ...override.summary } : base.summary,
      homepageFeature: override.homepageFeature ? { ...(base.homepageFeature ?? {}), ...override.homepageFeature } : base.homepageFeature,
    }),
    hero: {
      ...base.hero,
      ...(override.hero ?? {}),
    },
    seo: {
      ...base.seo,
      ...(override.seo ?? {}),
      faqs: override.seo?.faqs ?? base.seo.faqs,
    },
    model: {
      ...base.model,
      ...(override.model ?? {}),
      statColumns: override.model?.statColumns ?? base.model.statColumns,
      presets: nextPresets,
      previewThemes: nextPreviewThemes,
    },
    picksPage: {
      ...base.picksPage,
      ...(override.picksPage ?? {}),
      strategyBullets: override.picksPage?.strategyBullets ?? base.picksPage.strategyBullets,
      parlayBullets: override.picksPage?.parlayBullets ?? base.picksPage.parlayBullets,
      tierOneBets: override.picksPage?.tierOneBets ?? base.picksPage.tierOneBets,
      tierTwoBets: override.picksPage?.tierTwoBets ?? base.picksPage.tierTwoBets,
      tierThreeBets: override.picksPage?.tierThreeBets ?? base.picksPage.tierThreeBets,
      fades: override.picksPage?.fades ?? base.picksPage.fades,
      top40Rows: override.picksPage?.top40Rows ?? base.picksPage.top40Rows,
      summaryRows: override.picksPage?.summaryRows ?? base.picksPage.summaryRows,
    },
    manual: {
      ...(base.manual ?? {}),
      ...(override.manual ?? {}),
      playerAdjustments: override.manual?.playerAdjustments ?? base.manual?.playerAdjustments,
      courseFitNotes: override.manual?.courseFitNotes ?? base.manual?.courseFitNotes,
      statPriorityTweaks: override.manual?.statPriorityTweaks ?? base.manual?.statPriorityTweaks,
    },
  };
}

function pickDefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}
