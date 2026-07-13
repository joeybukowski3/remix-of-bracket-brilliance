#!/usr/bin/env node

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 15_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function resolveEasternSlateDate(now = new Date(), explicitDate = "") {
  const requested = String(explicitDate ?? "").trim();
  if (requested) {
    if (!DATE_PATTERN.test(requested)) throw new Error(`Invalid slate date: ${requested}`);
    const parsed = new Date(`${requested}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== requested) {
      throw new Error(`Invalid slate date: ${requested}`);
    }
    return requested;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function countScheduledGames(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.dates)) {
    throw new Error("MLB schedule response is missing the dates array");
  }

  let gameCount = 0;
  for (const date of payload.dates) {
    if (!date || typeof date !== "object" || !Array.isArray(date.games)) {
      throw new Error("MLB schedule response contains a date without a games array");
    }
    if (date.totalGames != null && (!Number.isInteger(date.totalGames) || date.totalGames !== date.games.length)) {
      throw new Error("MLB schedule response contains an ambiguous date game count");
    }
    gameCount += date.games.length;
  }

  if (payload.totalGames != null && (!Number.isInteger(payload.totalGames) || payload.totalGames !== gameCount)) {
    throw new Error("MLB schedule response contains an ambiguous total game count");
  }

  return gameCount;
}

export async function inspectMlbSlate({
  explicitDate = "",
  now = new Date(),
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  let slateDate = "unknown";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    slateDate = resolveEasternSlateDate(now, explicitDate);
    if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable");
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${slateDate}`;
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response?.ok) throw new Error(`MLB schedule returned HTTP ${response?.status ?? "unknown"}`);

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error(`MLB schedule returned malformed JSON: ${error instanceof Error ? error.message : error}`);
    }

    const gameCount = countScheduledGames(payload);
    return {
      exitCode: 0,
      hasGames: gameCount > 0 ? "true" : "false",
      gameCount: String(gameCount),
      slateDate,
      reason: gameCount > 0 ? "MLB games scheduled" : "No MLB games scheduled",
      detail: `${gameCount} schedule entr${gameCount === 1 ? "y" : "ies"} returned`,
    };
  } catch (error) {
    return {
      exitCode: 1,
      hasGames: "unknown",
      gameCount: "unknown",
      slateDate,
      reason: "Schedule request failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function parseSlateGateArgs(args) {
  const values = [...args];
  let explicitDate = "";
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (token === "--date") {
      explicitDate = values[index + 1] ?? "";
      index += 1;
    } else if (token.startsWith("--date=")) {
      explicitDate = token.slice("--date=".length);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  return { explicitDate };
}

export async function runSlateGate({
  args = process.argv.slice(2),
  now = new Date(),
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  emitOutput = defaultOutputWriter,
  log = console.log,
  logError = console.error,
} = {}) {
  let explicitDate = "";
  try {
    ({ explicitDate } = parseSlateGateArgs(args));
  } catch (error) {
    const failed = {
      exitCode: 1,
      hasGames: "unknown",
      gameCount: "unknown",
      slateDate: "unknown",
      reason: "Schedule request failed",
      detail: error instanceof Error ? error.message : String(error),
    };
    emitOutputs(failed, emitOutput);
    logError(`[mlb-slate-gate] ${failed.reason}: ${failed.detail}`);
    return failed;
  }

  const result = await inspectMlbSlate({ explicitDate, now, fetchImpl, timeoutMs });
  emitOutputs(result, emitOutput);

  if (result.exitCode !== 0) {
    logError(`[mlb-slate-gate] ${result.reason} for ${result.slateDate}: ${result.detail}`);
  } else if (result.hasGames === "false") {
    log(`No MLB games scheduled for ${result.slateDate} ET. Workflow completed as a successful no-op.`);
  } else {
    log(`[mlb-slate-gate] ${result.gameCount} MLB game(s) scheduled for ${result.slateDate} ET.`);
  }

  return result;
}

function emitOutputs(result, emitOutput) {
  emitOutput("has_games", result.hasGames);
  emitOutput("game_count", result.gameCount);
  emitOutput("slate_date", result.slateDate);
  emitOutput("reason", result.reason);
}

function defaultOutputWriter(key, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  } else {
    console.log(`${key}=${value}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runSlateGate();
  process.exitCode = result.exitCode;
}
