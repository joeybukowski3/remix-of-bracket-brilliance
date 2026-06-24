#!/usr/bin/env node
/**
 * update-player-identity-cache.mjs
 * Builds/refreshes public/data/mlb/player-identity-cache.json
 * Uses controlled concurrency (5 parallel) with rate-limit protection.
 *
 * Usage:
 *   node scripts/update-player-identity-cache.mjs           # update stale only
 *   node scripts/update-player-identity-cache.mjs --force   # refresh all
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const CACHE_PATH = path.join(DATA_DIR, "player-identity-cache.json");
const STALE_DAYS = 30;
const CONCURRENCY = 5;
const TIMEOUT_MS = 10000;
const RATE_DELAY_MS = 120;
const IS_FORCE = process.argv.includes("--force");

function normalizeName(name) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g,"").replace(/[^a-z\s]/g," ").replace(/\s+/g," ").trim();
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function nameVariants(name) {
  const base = name.trim();
  const vs = new Set([base]);
  vs.add(base.replace(/\./g,"").replace(/\s+/g," ").trim());
  vs.add(base.replace(/[\u2018\u2019\u02BC']/g,""));
  vs.add(base.replace(/-/g," ").replace(/\s+/g," ").trim());
  vs.add(base.replace(/\s+/g," ").trim());
  return [...vs];
}

function buildEntry(p, teamAbbr) {
  return {
    mlbId: p.id,
    fullName: p.fullName,
    normalizedName: normalizeName(p.fullName ?? ""),
    team: p.currentTeam?.abbreviation ?? teamAbbr ?? null,
    birthDate: p.birthDate ?? null,
    jerseyNumber: p.primaryNumber != null ? parseInt(String(p.primaryNumber), 10) : null,
    bats: p.batSide?.code ?? null,
    position: p.primaryPosition?.abbreviation ?? null,
    lastVerified: new Date().toISOString(),
    source: "mlb-stats-api",
  };
}

// Team roster cache for disambiguation
const teamRosterCache = new Map();
async function fetchTeamRosterId(teamAbbr, playerNorm) {
  if (!teamAbbr) return null;
  if (!teamRosterCache.has(teamAbbr)) {
    try {
      const teams = await fetchJson(`https://statsapi.mlb.com/api/v1/teams?sportId=1&season=2026`);
      const team = (teams?.teams ?? []).find(t => t.abbreviation === teamAbbr);
      if (!team) { teamRosterCache.set(teamAbbr, []); return null; }
      await sleep(RATE_DELAY_MS);
      const roster = await fetchJson(`https://statsapi.mlb.com/api/v1/teams/${team.id}/roster?rosterType=active&season=2026`);
      teamRosterCache.set(teamAbbr, roster?.roster ?? []);
    } catch { teamRosterCache.set(teamAbbr, []); }
  }
  const roster = teamRosterCache.get(teamAbbr) ?? [];
  const hit = roster.find(p => normalizeName(p.person?.fullName ?? "") === playerNorm);
  return hit?.person?.id ?? null;
}

async function resolvePlayer(playerName, teamAbbr) {
  const targetNorm = normalizeName(playerName);

  for (const variant of nameVariants(playerName)) {
    try {
      await sleep(RATE_DELAY_MS);
      const sr = await fetchJson(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(variant)}&active=true`);
      const people = sr?.people ?? [];
      if (!people.length) continue;

      let exact = people.filter(p => normalizeName(p.fullName ?? "") === targetNorm);

      if (exact.length === 1) {
        await sleep(RATE_DELAY_MS);
        const bio = await fetchJson(`https://statsapi.mlb.com/api/v1/people/${exact[0].id}`);
        const p = bio?.people?.[0];
        if (p) return buildEntry(p, teamAbbr);
      }

      if (exact.length > 1 && teamAbbr) {
        // Roster-based disambiguation (Issue #2)
        const rosterId = await fetchTeamRosterId(teamAbbr, targetNorm);
        if (rosterId) {
          console.log(`[cache] Disambiguated "${playerName}" via ${teamAbbr} roster → id ${rosterId}`);
          await sleep(RATE_DELAY_MS);
          const bio = await fetchJson(`https://statsapi.mlb.com/api/v1/people/${rosterId}`);
          const p = bio?.people?.[0];
          if (p) return buildEntry(p, teamAbbr);
        }
        console.warn(`[cache] Ambiguous: "${playerName}" (${exact.length} matches, team=${teamAbbr}) — unresolved`);
        return { mlbId: null, fullName: playerName, normalizedName: targetNorm, team: teamAbbr, birthDate: null, jerseyNumber: null, bats: null, position: null, lastVerified: new Date().toISOString(), source: "unresolved-ambiguous" };
      }
    } catch (_) { /* try next variant */ }
  }

  return { mlbId: null, fullName: playerName, normalizedName: targetNorm, team: teamAbbr, birthDate: null, jerseyNumber: null, bats: null, position: null, lastVerified: new Date().toISOString(), source: "not-found" };
}

// Worker-pool concurrency
async function runConcurrent(tasks, concurrency) {
  const results = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]().catch(() => null);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

async function main() {
  console.log(`[cache] Starting (force=${IS_FORCE})`);

  let cache = {};
  if (existsSync(CACHE_PATH) && !IS_FORCE) {
    cache = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
    console.log(`[cache] Loaded ${Object.keys(cache).length} existing entries`);
  }

  const rawPath = path.join(DATA_DIR, "hr-props-raw.json");
  if (!existsSync(rawPath)) { console.warn("[cache] hr-props-raw.json not found"); return; }
  const mlbData = JSON.parse(readFileSync(rawPath, "utf8"));

  const uniquePlayers = new Map();
  for (const b of mlbData.batters ?? []) {
    const key = `${b.player}|${b.team}`;
    if (!uniquePlayers.has(key)) uniquePlayers.set(key, { name: b.player, team: b.team });
  }

  const staleCutoff = new Date(Date.now() - STALE_DAYS * 86400000).toISOString();
  let hits = 0, misses = 0, refreshes = 0, failed = 0;
  const tasks = [];

  for (const [key, { name, team }] of uniquePlayers) {
    const existing = cache[key];
    if (!IS_FORCE && existing && existing.lastVerified >= staleCutoff) { hits++; continue; }
    misses++;
    tasks.push(() => resolvePlayer(name, team).then(result => ({ key, result })));
  }

  console.log(`[cache] ${hits} hits, ${misses} to resolve`);
  const results = await runConcurrent(tasks, CONCURRENCY);

  for (const item of results) {
    if (!item) continue;
    const { key, result } = item;
    if (result) {
      cache[key] = result;
      if (result.mlbId) { refreshes++; }
      else { failed++; console.warn(`[cache] Failed: ${key} (${result.source})`); }
    }
  }

  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");
  console.log(`[cache] Written ${Object.keys(cache).length} entries | resolved=${refreshes} failed=${failed}`);
  console.log(`[cache] Hit rate: ${hits + misses > 0 ? Math.round(hits / (hits + misses) * 100) : 0}%`);
}

main().catch(err => { console.error("[cache] Fatal:", err.message); process.exit(1); });
