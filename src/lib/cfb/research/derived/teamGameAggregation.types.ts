import type { PlayMetricRow } from "./playMetricRow";

/** A play paired with its garbage-time-policy weight (see garbageTimePolicy.ts). */
export type WeightedPlay = { row: PlayMetricRow; weight: number };
