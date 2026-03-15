import {
  buildCanonicalTeams,
  findTeamByEspn,
  getCanonicalSchoolKey,
  resolveTeamLogo,
  type LiveTeamMetadata,
  type Team,
} from "../../src/data/ncaaTeams";
import type { BracketRegionConfig, BracketSeedSlot, BracketSourceConfig, BracketValidation, SyncResult } from "./types";
import { getStoredBracket, storeBracketPayload } from "./bracket-store";

const REGION_NAMES = ["East", "West", "South", "Midwest"] as const;
const DEFAULT_SEASON = process.env.BRACKET_SYNC_SEASON || "2026";
const PRIMARY_SOURCE_URL = process.env.BRACKET_SOURCE_URL_NCAA || "https://www.ncaa.com/brackets/basketball-men/d1";
const SECONDARY_SOURCE_URL = process.env.BRACKET_SOURCE_URL_ESPN || "https://www.espn.com/mens-college-basketball/bracket";

interface ParsedRegionState {
  name: string;
  slots: Map<number, BracketSeedSlot>;
}

function htmlToLines(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "\n")
      .replace(/<style[\s\S]*?<\/style>/gi, "\n")
      .replace(/<\/(div|p|li|section|article|h1|h2|h3|h4|tr)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\u00a0/g, " "),
  )
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeRegionName(line: string) {
  const upper = line.toUpperCase();
  if (upper.includes("MIDWEST")) return "Midwest";
  if (upper.includes("EAST")) return "East";
  if (upper.includes("WEST")) return "West";
  if (upper.includes("SOUTH")) return "South";
  return null;
}

function sanitizeLine(line: string) {
  return line
    .replace(/\bFinal\b/gi, " ")
    .replace(/\bFirst Four\b/gi, " ")
    .replace(/\bRound of \d+\b/gi, " ")
    .replace(/\bSweet 16\b/gi, " ")
    .replace(/\bElite 8\b/gi, " ")
    .replace(/\bFinal Four\b/gi, " ")
    .replace(/\bChampionship\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTeamPoolIndex(teamPool: Team[]) {
  const schoolKeyToTeam = new Map<string, Team>();
  teamPool.forEach((team) => {
    schoolKeyToTeam.set(getCanonicalSchoolKey(team.name, team.abbreviation), team);
  });
  return schoolKeyToTeam;
}

function resolveTeamCandidate(candidate: string, teamPool: Team[], teamIndex: Map<string, Team>) {
  const schoolKey = getCanonicalSchoolKey(candidate);
  const bySchoolKey = teamIndex.get(schoolKey);
  if (bySchoolKey) return bySchoolKey;
  return findTeamByEspn(candidate, candidate.replace(/[^A-Za-z]/g, "").slice(0, 6).toUpperCase(), teamPool);
}

function parseSeedPairsFromLine(line: string, teamPool: Team[], teamIndex: Map<string, Team>) {
  const results: Array<{ seed: number; team: Team | null; rawTeamName: string }> = [];
  const tokens = sanitizeLine(line).split(/\s+/).filter(Boolean);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!/^(1[0-6]|[1-9])$/.test(token)) continue;

    const seed = Number.parseInt(token, 10);
    let bestMatch: { team: Team | null; rawTeamName: string; length: number } | null = null;

    for (let length = Math.min(6, tokens.length - index - 1); length >= 1; length -= 1) {
      const candidateTokens: string[] = [];
      for (let offset = 1; offset <= length; offset += 1) {
        const next = tokens[index + offset];
        if (!next || /^\d+$/.test(next)) break;
        candidateTokens.push(next);
      }
      if (candidateTokens.length !== length) continue;
      const rawTeamName = candidateTokens.join(" ");
      const team = resolveTeamCandidate(rawTeamName, teamPool, teamIndex);
      if (team) {
        bestMatch = { team, rawTeamName, length };
        break;
      }
    }

    if (bestMatch) {
      results.push({ seed, team: bestMatch.team, rawTeamName: bestMatch.rawTeamName });
      index += bestMatch.length;
    }
  }

  return results;
}

function createRegionState(): Record<string, ParsedRegionState> {
  return Object.fromEntries(
    REGION_NAMES.map((regionName) => [regionName, { name: regionName, slots: new Map<number, BracketSeedSlot>() }]),
  ) as Record<string, ParsedRegionState>;
}

function normalizeRegionsFromHtml(html: string, teamPool: Team[], sourceLabel: string): BracketSourceConfig {
  const teamIndex = buildTeamPoolIndex(teamPool);
  const regions = createRegionState();
  let currentRegion: string | null = null;

  for (const rawLine of htmlToLines(html)) {
    const regionName = normalizeRegionName(rawLine);
    if (regionName) {
      currentRegion = regionName;
      continue;
    }

    if (!currentRegion) continue;
    const parsedTeams = parseSeedPairsFromLine(rawLine, teamPool, teamIndex);
    if (parsedTeams.length === 0) continue;

    for (const parsed of parsedTeams) {
      const region = regions[currentRegion];
      if (region.slots.has(parsed.seed)) continue;
      if (!parsed.team) continue;
      region.slots.set(parsed.seed, {
        seed: parsed.seed,
        teamName: parsed.team.name,
        abbreviation: parsed.team.abbreviation,
        canonicalId: parsed.team.canonicalId,
        espnId: parsed.team.espnId ?? null,
      });
    }
  }

  return {
    season: DEFAULT_SEASON,
    mode: "live",
    sourceLabel,
    updatedAt: new Date().toISOString(),
    regions: REGION_NAMES.map((regionName) => ({
      name: regionName,
      slots: [...regions[regionName].slots.values()].sort((a, b) => a.seed - b.seed),
    })),
  };
}

function validateBracketPayload(payload: BracketSourceConfig) {
  const reasons: string[] = [];
  const duplicateTeams = new Set<string>();
  const unmatchedTeams: string[] = [];
  const seenTeams = new Set<string>();
  let matchedTeams = 0;

  if (payload.regions.length !== 4) {
    reasons.push(`Expected 4 regions, found ${payload.regions.length}`);
  }

  payload.regions.forEach((region) => {
    const seenSeeds = new Set<number>();
    region.slots.forEach((slot) => {
      if (!slot.canonicalId) {
        unmatchedTeams.push(`${region.name} ${slot.seed}: ${slot.teamName}`);
      } else {
        matchedTeams += 1;
      }

      if (seenSeeds.has(slot.seed)) {
        reasons.push(`Duplicate seed ${slot.seed} in ${region.name}`);
      }
      seenSeeds.add(slot.seed);

      const teamKey = slot.canonicalId || getCanonicalSchoolKey(slot.teamName, slot.abbreviation);
      if (seenTeams.has(teamKey)) {
        duplicateTeams.add(slot.teamName);
      }
      seenTeams.add(teamKey);
    });

    if (seenSeeds.size !== 16) {
      reasons.push(`${region.name} has ${seenSeeds.size} populated seeds`);
    }
    for (let seed = 1; seed <= 16; seed += 1) {
      if (!seenSeeds.has(seed)) {
        reasons.push(`${region.name} missing seed ${seed}`);
      }
    }
  });

  if (duplicateTeams.size > 0) {
    reasons.push(`Duplicate teams detected: ${[...duplicateTeams].join(", ")}`);
  }
  if (unmatchedTeams.length > 0) {
    reasons.push(`Unmatched teams detected: ${unmatchedTeams.join(", ")}`);
  }

  return {
    isComplete: reasons.length === 0,
    reasons,
    duplicateTeams: [...duplicateTeams],
    unmatchedTeams,
    regionsFound: payload.regions.map((region) => region.name),
    totalTeams: payload.regions.reduce((sum, region) => sum + region.slots.length, 0),
    matchedTeams,
  } satisfies BracketValidation;
}

async function fetchEspnLiveTeams(): Promise<LiveTeamMetadata[]> {
  const response = await fetch(
    "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=500",
    { headers: { Accept: "application/json" } },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch live teams: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const league = data?.sports?.[0]?.leagues?.[0];
  const groups = league?.groups || [];

  return groups.flatMap((group: any) =>
    (group?.teams || []).map((entry: any) => ({
      id: entry?.team?.id || "",
      name: entry?.team?.displayName || entry?.team?.name || "",
      abbreviation: entry?.team?.abbreviation || "",
      conference: group?.shortName || group?.name || group?.abbreviation || "NCAA",
      record: entry?.team?.record?.items?.[0]?.summary || entry?.team?.recordSummary || "",
      logo: resolveTeamLogo(entry?.team?.logos?.[0]?.href || entry?.team?.logo || "", entry?.team?.id || ""),
      seed: null,
    })),
  );
}

async function trySource(url: string, sourceLabel: string, teamPool: Team[]) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "JoeKnowsBallBracketSync/1.0",
      Accept: "text/html,application/xhtml+xml,application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`${sourceLabel} returned ${response.status}`);
  }

  const html = await response.text();
  const payload = normalizeRegionsFromHtml(html, teamPool, sourceLabel);
  const validation = validateBracketPayload(payload);
  return { payload, validation };
}

export async function syncOfficialBracket(force = false): Promise<SyncResult> {
  const stored = await getStoredBracket(DEFAULT_SEASON).catch(() => null);
  if (!force && stored?.is_complete) {
    return {
      season: DEFAULT_SEASON,
      source: stored.source,
      stored: false,
      active: true,
      payload: stored.payload,
      validation: stored.validation,
    };
  }

  const liveTeams = await fetchEspnLiveTeams();
  const teamPool = buildCanonicalTeams(liveTeams);
  const attempts: Array<{ payload: BracketSourceConfig; validation: BracketValidation; source: string }> = [];

  for (const source of [
    { url: PRIMARY_SOURCE_URL, label: "NCAA official bracket source" },
    { url: SECONDARY_SOURCE_URL, label: "ESPN bracket source" },
  ]) {
    try {
      const attempt = await trySource(source.url, source.label, teamPool);
      attempts.push({ ...attempt, source: source.label });
      if (attempt.validation.isComplete) {
        const storedRecord = await storeBracketPayload({
          season: DEFAULT_SEASON,
          payload: attempt.payload,
          source: source.label,
          isComplete: true,
          validation: attempt.validation,
        });

        return {
          season: DEFAULT_SEASON,
          source: source.label,
          stored: Boolean(storedRecord),
          active: true,
          payload: attempt.payload,
          validation: attempt.validation,
        };
      }
    } catch (error) {
      attempts.push({
        payload: {
          season: DEFAULT_SEASON,
          mode: "live",
          sourceLabel: source.label,
          updatedAt: new Date().toISOString(),
          regions: [],
        },
        validation: {
          isComplete: false,
          reasons: [error instanceof Error ? error.message : `Failed to fetch ${source.label}`],
          duplicateTeams: [],
          unmatchedTeams: [],
          regionsFound: [],
          totalTeams: 0,
          matchedTeams: 0,
        },
        source: source.label,
      });
    }
  }

  const bestAttempt = attempts.sort((a, b) => b.validation.matchedTeams - a.validation.matchedTeams)[0];
  if (bestAttempt) {
    await storeBracketPayload({
      season: DEFAULT_SEASON,
      payload: bestAttempt.payload,
      source: bestAttempt.source,
      isComplete: false,
      validation: bestAttempt.validation,
    });
  }

  return {
    season: DEFAULT_SEASON,
    source: bestAttempt?.source || "none",
    stored: Boolean(bestAttempt),
    active: false,
    payload: bestAttempt?.payload || {
      season: DEFAULT_SEASON,
      mode: "live",
      sourceLabel: "No source parsed",
      updatedAt: new Date().toISOString(),
      regions: [],
    },
    validation: bestAttempt?.validation || {
      isComplete: false,
      reasons: ["No bracket source could be parsed"],
      duplicateTeams: [],
      unmatchedTeams: [],
      regionsFound: [],
      totalTeams: 0,
      matchedTeams: 0,
    },
  };
}
