import scheduleData from "@/data/pga/schedule.json";

export type PgaScheduleEntry = {
  id: string;
  slug: string;
  season: number;
  name: string;
  shortName: string;
  courseName: string;
  location: string;
  startDate: string;
  endDate: string;
  eventType?: string;
  courseHistoryDisplay?: string;
  fieldAverage?: string;
  cutLine?: string;
  noCutLabel?: string;
  dataFile: string;
  registration: "legacy" | "generated";
  summaryBlurb?: string;
  courseTraits?: string[];
  homepageEyebrow?: string;
  previousWinner?: string;
  purse?: string;
  winningScore?: string;
  averageCutLineLast5Years?: string;
  courseFitProfile?: string[];
  modelFocus?: string;
  alternateField?: boolean;
  workbook?: {
    defaultPath?: string;
    baseMode?: "sheet" | "stats";
    baseSheet?: string;
    trendSheet?: string;
    historySheet?: string;
    statsSheet?: string;
    mirrorOutputs?: string[];
  };
};

export const PGA_SCHEDULE = scheduleData as PgaScheduleEntry[];

export type PgaScheduleSelection = {
  currentUpcoming: PgaScheduleEntry | null;
  currentWeekEvents: PgaScheduleEntry[];
  alternateWeekEvents: PgaScheduleEntry[];
  nextWeek: PgaScheduleEntry | null;
  nextWeekEvents: PgaScheduleEntry[];
  referenceDate: string;
};

export function getPgaScheduleSelection(referenceDate?: string | Date): PgaScheduleSelection {
  const today = normalizeDateInput(referenceDate ?? getPgaDateOverride() ?? new Date());
  const ordered = [...PGA_SCHEDULE].sort((left, right) => {
    if (left.startDate !== right.startDate) return left.startDate.localeCompare(right.startDate);
    return Number(Boolean(left.alternateField)) - Number(Boolean(right.alternateField));
  });

  const currentUpcoming = ordered.find((entry) => entry.startDate >= today) ?? ordered[ordered.length - 1] ?? null;
  const currentWeekEvents = currentUpcoming
    ? ordered.filter((entry) => entry.startDate === currentUpcoming.startDate)
    : [];
  const alternateWeekEvents = currentWeekEvents.filter((entry) => entry.slug !== currentUpcoming?.slug);
  const nextWeekStartDate = ordered.find((entry) => currentUpcoming && entry.startDate > currentUpcoming.startDate)?.startDate ?? null;
  const nextWeekEvents = nextWeekStartDate
    ? ordered.filter((entry) => entry.startDate === nextWeekStartDate)
    : [];
  const nextWeek = nextWeekEvents[0] ?? null;

  return {
    currentUpcoming,
    currentWeekEvents,
    alternateWeekEvents,
    nextWeek,
    nextWeekEvents,
    referenceDate: today,
  };
}

export function getPgaDateOverride() {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const queryOverride = params.get("pgaDate");
    if (queryOverride) return queryOverride;

    try {
      const stored = window.localStorage.getItem("pga:date-override");
      if (stored) return stored;
    } catch {
      // ignore storage access issues
    }
  }

  const envOverride = import.meta.env.VITE_PGA_DATE_OVERRIDE;
  return typeof envOverride === "string" && envOverride ? envOverride : null;
}

export function normalizeDateInput(value: string | Date) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}
