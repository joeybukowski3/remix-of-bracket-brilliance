import { SEASON_LABEL, type DvpView } from "@/lib/nba/props/dvp";

export const DVP_VIEWS: readonly DvpView[] = ["2025-26", "2026-27", "blended"];
export const viewLabel = (view: DvpView): string => (view === "blended" ? "Blended" : SEASON_LABEL[view]);
