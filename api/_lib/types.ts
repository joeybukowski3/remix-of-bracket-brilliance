export type BracketMode = "placeholder" | "live";

export interface BracketSeedSlot {
  seed: number;
  teamName: string;
  abbreviation: string;
  canonicalId?: string;
  espnId?: string | null;
}

export interface BracketRegionConfig {
  name: string;
  slots: BracketSeedSlot[];
}

export interface BracketSourceConfig {
  season: string;
  mode: BracketMode;
  sourceLabel: string;
  updatedAt: string;
  regions: BracketRegionConfig[];
}

export interface StoredBracketRecord {
  season: string;
  payload: BracketSourceConfig;
  source: string;
  is_complete: boolean;
  validation: BracketValidation;
  synced_at: string;
  updated_at?: string;
}

export interface BracketValidation {
  isComplete: boolean;
  reasons: string[];
  duplicateTeams: string[];
  unmatchedTeams: string[];
  regionsFound: string[];
  totalTeams: number;
  matchedTeams: number;
}

export interface SyncResult {
  season: string;
  source: string;
  stored: boolean;
  active: boolean;
  payload: BracketSourceConfig;
  validation: BracketValidation;
}
