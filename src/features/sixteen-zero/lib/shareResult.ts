import type { PickOutcome } from "../engine/draftPickValue";
import type { SeasonResult } from "../types";

export const SHARE_URL = "https://www.joeknowsball.com/16-0";
export const SHARE_TITLE = "My 16-0 Fantasy Football Result";

export function buildShareMessage(result: SeasonResult, bestPick?: PickOutcome | null): string {
  const lines = [
    `${result.finalWins}-${result.finalLosses} · ${result.playoffResult}`,
  ];
  if (bestPick) {
    lines.push(`Best pick: ${bestPick.playerName}`);
  }
  lines.push("joeknowsball.com/16-0");
  return lines.join("\n");
}
