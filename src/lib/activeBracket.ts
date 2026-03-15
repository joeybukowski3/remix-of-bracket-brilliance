import { OFFICIAL_2026_BRACKET } from "@/data/bracket2026";
import type { BracketSourceConfig } from "@/lib/bracket";

interface ActiveBracketResponse {
  ok: boolean;
  source: "official" | "placeholder";
  bracketLive: boolean;
  payload: BracketSourceConfig;
}

export async function getActiveBracketData(): Promise<BracketSourceConfig> {
  try {
    const response = await fetch("/api/bracket", { cache: "no-store" });
    if (!response.ok) return OFFICIAL_2026_BRACKET;
    const payload = (await response.json()) as ActiveBracketResponse;
    if (!payload?.payload?.regions?.length) return OFFICIAL_2026_BRACKET;
    return payload.payload;
  } catch {
    return OFFICIAL_2026_BRACKET;
  }
}
