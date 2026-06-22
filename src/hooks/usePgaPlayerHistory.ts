import { useEffect, useMemo, useState } from "react";
import {
  buildMajorHistoryMap,
  buildPlayerHistoryMap,
  parseFinishText,
  type PgaMajorHistoryPayload,
  type PgaPlayerHistoryPayload,
  type PgaPlayerHistoryRecord,
} from "@/lib/pga/historyModel";

type CompactHistoryPayload = {
  v: number;
  source: string;
  event: string;
  years: number[];
  players: Array<[
    string,
    Array<number | null>,
    Array<string | null>,
    Array<string | null>,
  ]>;
};

type HistoryState = {
  playerHistory: PgaPlayerHistoryPayload | null;
  majorHistory: PgaMajorHistoryPayload | null;
  loading: boolean;
  error: string | null;
};

const EMPTY_MAJOR_HISTORY: PgaMajorHistoryPayload = {
  version: 1,
  source: "pga-tour",
  generatedAt: null,
  years: [],
  players: [],
};

export function usePgaPlayerHistory() {
  const [state, setState] = useState<HistoryState>({
    playerHistory: null,
    majorHistory: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [playerHistory, majorHistory] = await Promise.all([
          loadPlayerHistory(),
          loadMajorHistory(),
        ]);

        if (active) {
          setState({ playerHistory, majorHistory, loading: false, error: null });
        }
      } catch (error) {
        if (active) {
          setState({
            playerHistory: null,
            majorHistory: EMPTY_MAJOR_HISTORY,
            loading: false,
            error: error instanceof Error ? error.message : "Unable to load PGA history",
          });
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const playerHistoryMap = useMemo(
    () => buildPlayerHistoryMap(state.playerHistory),
    [state.playerHistory],
  );
  const majorHistoryMap = useMemo(
    () => buildMajorHistoryMap(state.majorHistory),
    [state.majorHistory],
  );

  return {
    ...state,
    playerHistoryMap,
    majorHistoryMap,
  };
}

async function loadPlayerHistory(): Promise<PgaPlayerHistoryPayload> {
  const fullHistory = await tryLoadJson<PgaPlayerHistoryPayload>("/data/pga/player-history.json");
  if (fullHistory?.version && Array.isArray(fullHistory.players)) {
    return fullHistory;
  }

  const compactResponse = await fetch("/data/pga/player-history-compact.json", { cache: "no-store" });
  if (!compactResponse.ok) {
    throw new Error(`Player history request failed with HTTP ${compactResponse.status}`);
  }

  const compact = parseCompactHistoryJson(await compactResponse.text());
  return expandCompactHistory(compact);
}

async function loadMajorHistory() {
  return (await tryLoadJson<PgaMajorHistoryPayload>("/data/pga/major-history.json"))
    ?? EMPTY_MAJOR_HISTORY;
}

async function tryLoadJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    if (!contentType.includes("json") && !text.trim().startsWith("{")) return null;

    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function parseCompactHistoryJson(text: string): CompactHistoryPayload {
  const normalized = text.replace(/^\uFEFF/, "").trim();

  try {
    return JSON.parse(normalized) as CompactHistoryPayload;
  } catch (initialError) {
    const balanced = repairUnbalancedClosures(normalized);
    const repaired = repairMissingArrayCommas(balanced);

    if (repaired !== normalized) {
      try {
        const payload = JSON.parse(repaired) as CompactHistoryPayload;
        console.warn("[pga-history] Repaired malformed compact history JSON while loading.");
        return payload;
      } catch {
        // Fall through to the original parse error so the source problem stays visible.
      }
    }

    throw initialError;
  }
}

function repairUnbalancedClosures(source: string) {
  let output = "";
  const stack: Array<"{" | "["> = [];
  let inString = false;
  let escaped = false;
  let changed = false;

  for (const character of source) {
    if (inString) {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }

    if (character === "{" || character === "[") {
      stack.push(character);
      output += character;
      continue;
    }

    if (character === "}" || character === "]") {
      const expectedOpen = character === "}" ? "{" : "[";
      const expectedClose = character === "}" ? "]" : "}";

      while (stack.length && stack[stack.length - 1] !== expectedOpen) {
        const open = stack.pop();
        output += open === "[" ? "]" : "}";
        changed = true;
      }

      if (stack[stack.length - 1] === expectedOpen) {
        stack.pop();
      } else if (expectedClose) {
        return source;
      }

      output += character;
      continue;
    }

    output += character;
  }

  while (stack.length) {
    const open = stack.pop();
    output += open === "[" ? "]" : "}";
    changed = true;
  }

  return changed ? output : source;
}

function repairMissingArrayCommas(source: string) {
  let candidate = source;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      JSON.parse(candidate);
      return candidate;
    } catch (error) {
      if (!(error instanceof SyntaxError)) return source;
      const position = extractJsonErrorPosition(error.message);
      if (position == null || position < 0 || position > candidate.length) return source;

      const repaired = insertLikelyMissingComma(candidate, position);
      if (repaired === candidate) return source;
      candidate = repaired;
    }
  }

  return source;
}

function extractJsonErrorPosition(message: string) {
  const positionMatch = message.match(/position\s+(\d+)/i);
  if (positionMatch) return Number(positionMatch[1]);

  const columnMatch = message.match(/column\s+(\d+)/i);
  if (columnMatch) return Math.max(0, Number(columnMatch[1]) - 1);

  return null;
}

function insertLikelyMissingComma(source: string, position: number) {
  let index = Math.min(position, source.length);
  while (index > 0 && /\s/.test(source[index - 1])) index -= 1;

  const current = source[index] ?? "";
  const previous = source[index - 1] ?? "";

  const previousCanEndValue = /[\]}\"]/.test(previous) || /[0-9el]/i.test(previous);
  const currentCanStartValue = /[\[{\"n\-0-9]/.test(current);

  if (previousCanEndValue && currentCanStartValue) {
    return `${source.slice(0, index)},${source.slice(index)}`;
  }

  const nearbyStart = Math.max(0, position - 12);
  const nearbyEnd = Math.min(source.length, position + 12);
  const nearby = source.slice(nearbyStart, nearbyEnd);
  const boundaryMatch = nearby.match(/([\]}])\s*([\[{])/);

  if (boundaryMatch && boundaryMatch.index != null) {
    const insertionPoint = nearbyStart + boundaryMatch.index + boundaryMatch[1].length;
    return `${source.slice(0, insertionPoint)},${source.slice(insertionPoint)}`;
  }

  return source;
}

function expandCompactHistory(payload: CompactHistoryPayload): PgaPlayerHistoryPayload {
  const players: PgaPlayerHistoryRecord[] = payload.players.map(([player, stats, recent, eventFinishes]) => {
    const recentResults = recent.flatMap((finish, index) => {
      const parsed = parseFinishText(finish);
      return parsed ? [{ ...parsed, sequence: index + 1 }] : [];
    });

    const eventResults = eventFinishes.flatMap((finish, index) => {
      const parsed = parseFinishText(finish);
      const season = payload.years[index];
      return parsed
        ? [{
            ...parsed,
            season,
            eventSlug: payload.event,
            eventName: "Travelers Championship",
          }]
        : [];
    });

    return {
      player,
      sourcePlayerName: player,
      recentResults,
      eventHistory: { [payload.event]: eventResults },
      stats: {
        sgTotal: stats[0] ?? null,
        sgOTT: stats[1] ?? null,
        sgApp: stats[2] ?? null,
        sgAtG: stats[3] ?? null,
        sgPutt: stats[4] ?? null,
        drivingDistance: stats[5] ?? null,
        drivingAccuracy: stats[6] ?? null,
      },
    };
  });

  return {
    version: payload.v,
    source: payload.source,
    sourceFile: "my-file (4).csv",
    generatedAt: "2026-06-22",
    event: {
      slug: payload.event,
      name: "Travelers Championship",
      course: "TPC River Highlands",
      category: "standard",
    },
    players,
  };
}
