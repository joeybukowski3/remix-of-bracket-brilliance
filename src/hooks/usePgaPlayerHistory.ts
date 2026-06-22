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
        const [historyResponse, majorResponse] = await Promise.all([
          fetch("/data/pga/player-history-compact.json", { cache: "no-store" }),
          fetch("/data/pga/major-history.json", { cache: "no-store" }),
        ]);

        if (!historyResponse.ok) {
          throw new Error(`Player history request failed with HTTP ${historyResponse.status}`);
        }

        const historyText = await historyResponse.text();
        const compact = parseCompactHistoryJson(historyText);
        const playerHistory = expandCompactHistory(compact);
        const majorHistory = majorResponse.ok
          ? ((await majorResponse.json()) as PgaMajorHistoryPayload)
          : EMPTY_MAJOR_HISTORY;

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

export function parseCompactHistoryJson(text: string): CompactHistoryPayload {
  const normalized = text.replace(/^\uFEFF/, "").trim();

  try {
    return JSON.parse(normalized) as CompactHistoryPayload;
  } catch (initialError) {
    const repaired = repairMissingArrayCommas(normalized);
    if (repaired !== normalized) {
      try {
        const payload = JSON.parse(repaired) as CompactHistoryPayload;
        console.warn("[pga-history] Repaired malformed compact history JSON while loading.");
        return payload;
      } catch {
        // Fall through to the original parse error so the user sees the true source issue.
      }
    }

    throw initialError;
  }
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

  const previousCanEndValue = /[\]}"]/.test(previous) || /[0-9el]/i.test(previous);
  const currentCanStartValue = /[\[{"n\-0-9]/.test(current);

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
