import type { BracketSourceConfig, BracketValidation, StoredBracketRecord } from "./types";
import { supabaseAdminFetch } from "./supabase";

const TABLE_PATH = "/rest/v1/live_brackets";

export async function getStoredBracket(season: string): Promise<StoredBracketRecord | null> {
  const response = await supabaseAdminFetch(
    `${TABLE_PATH}?season=eq.${encodeURIComponent(season)}&select=season,payload,source,is_complete,validation,synced_at,updated_at&limit=1`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error(`Failed to read live_brackets: ${response.status} ${await response.text()}`);
  }

  const rows = (await response.json()) as StoredBracketRecord[];
  return rows[0] ?? null;
}

export async function storeBracketPayload(input: {
  season: string;
  payload: BracketSourceConfig;
  source: string;
  isComplete: boolean;
  validation: BracketValidation;
}) {
  const response = await supabaseAdminFetch(
    `${TABLE_PATH}?on_conflict=season`,
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify([
        {
          season: input.season,
          payload: input.payload,
          source: input.source,
          is_complete: input.isComplete,
          validation: input.validation,
          synced_at: new Date().toISOString(),
        },
      ]),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to store live bracket: ${response.status} ${await response.text()}`);
  }

  const rows = (await response.json()) as StoredBracketRecord[];
  return rows[0] ?? null;
}
