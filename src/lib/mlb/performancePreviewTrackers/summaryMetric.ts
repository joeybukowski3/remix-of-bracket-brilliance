// Shared shape for the compact horizontal summary strip on
// /mlb/performance-preview. Every tracker computes its own metric list
// client-side from the currently filtered record population -- see the
// per-tracker modules in this directory -- so the strip never shows an
// all-time number next to a windowed/categorized table.

export interface SummaryMetric {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}
