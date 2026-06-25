#!/usr/bin/env node
/**
 * generate-mlb-numerology.mjs
 * JoeKnowsBall MLB Numerical Alignment — Daily Generation Script
 * Methodology v2.1.0
 *
 * Three-layer architecture:
 *   Layer 1: Deterministic numerology engine (this script)
 *   Layer 2: Verified MLB data (hr-props-raw.json + MLB Stats API)
 *   Layer 3: Grok narrative text only
 *
 * Usage:
 *   node scripts/generate-mlb-numerology.mjs                  # live
 *   node scripts/generate-mlb-numerology.mjs --dry-run        # no file writes
 *   node scripts/generate-mlb-numerology.mjs --date 2026-06-24
 *   node scripts/generate-mlb-numerology.mjs --fixture        # writes to fixture path only
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const ARCHIVE_DIR = path.join(DATA_DIR, "numerology", "history");
const DAILY_OUTPUT = path.join(DATA_DIR, "numerology-daily.json");
// Fixture output NEVER overwrites production
const FIXTURE_OUTPUT = path.join(DATA_DIR, "numerology-daily.fixture.json");
const METHODOLOGY = JSON.parse(readFileSync(path.join(ROOT, "config", "mlb-numerology-methodology.json"), "utf8"));
const SYSTEM_PROMPT = readFileSync(path.join(ROOT, "prompts", "mlb-numerology-system.md"), "utf8");
const METHODOLOGY_VERSION = METHODOLOGY.version;
const GROK_API_URL = "https://api.x.ai/v1/chat/completions";
const GROK_MODEL = "grok-4-1-fast-non-reasoning";
const SCHEDULED_FOR = "09:36 America/New_York";
const TIMEOUT_MS = 30000;

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes("--dry-run");
const USE_FIXTURE = args.includes("--fixture");
const DATE_ARG = (() => { const i = args.indexOf("--date"); return i >= 0 ? args[i + 1] : null; })();

if (USE_FIXTURE && !IS_DRY_RUN) {
  console.log("[numerology] FIXTURE mode — output goes to numerology-daily.fixture.json, NOT production");
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function getEtDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

async function fetchJson(url, timeout = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

function safeNum(v) { const n = parseFloat(v); return isFinite(n) ? n : null; }

// ── Numerology engine (pure JS port of src/lib/numerology) ───────────────────
const MASTER_NUMBERS = new Set([11, 22, 33]);
const NUMBER_FAMILIES = [[1, 4, 7], [2, 5, 8], [3, 6, 9]];

function sumDigits(n) {
  return String(Math.abs(Math.round(n))).split("").reduce((a, d) => a + parseInt(d, 10), 0);
}

function reduce(n) {
  const original = Math.abs(Math.round(n));
  const trace = [];
  if (original >= 1 && original <= 9) return { original, compound: original, master: null, root: original, trace: [String(original)] };
  // Preserve master numbers BEFORE digit-summing
  if (MASTER_NUMBERS.has(original)) {
    const root = sumDigits(original);
    trace.push(`${original} (master) → ${root}`);
    return { original, compound: original, master: original, root, trace };
  }
  let compound = sumDigits(original);
  trace.push(String(original).split("").join(" + ") + " = " + compound);
  if (MASTER_NUMBERS.has(compound)) {
    const root = sumDigits(compound);
    trace.push(`${compound} (master) → ${root}`);
    return { original, compound, master: compound, root, trace };
  }
  let current = compound;
  while (current > 9) {
    const next = sumDigits(current);
    if (MASTER_NUMBERS.has(next)) {
      const root = sumDigits(next);
      trace.push(String(current).split("").join(" + ") + " = " + next + " (master) → " + root);
      return { original, compound, master: next, root, trace };
    }
    trace.push(String(current).split("").join(" + ") + " = " + next);
    current = next;
  }
  return { original, compound, master: null, root: current, trace };
}

function reduceFullDate(dateDigits) {
  const digits = String(dateDigits).split("").map(Number);
  const rawSum = digits.reduce((a, b) => a + b, 0);
  const base = reduce(rawSum);
  const traceStr = digits.join(" + ") + " = " + rawSum;
  return { ...base, rawSum, trace: [traceStr, ...base.trace.slice(1)] };
}

function getFamily(root) { return NUMBER_FAMILIES.find(f => f.includes(root)) ?? []; }
function balancingComplement(root) { return root === 5 ? 5 : 10 - root; }
function countercurrentNum(root) { const c = 9 - root; return c === 0 ? 9 : c; }

function buildDailyProfile(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const digits = dateStr.replace(/-/g, "");
  const universalDay = reduceFullDate(digits);
  const calendarDay = reduce(d);
  const universalYear = reduce(y);
  const universalMonth = reduce(m + universalYear.root);
  const structuralEcho = reduce(reduce(m).root + calendarDay.root + universalYear.root);
  const primaryFamily = getFamily(universalDay.root);
  const secondaryFamily = getFamily(calendarDay.root);

  // Repeated digits: count ALL non-zero digits in the full date string
  const allDigits = digits.split("").map(Number).filter(n => n !== 0);
  const counts = new Map();
  for (const n of allDigits) counts.set(n, (counts.get(n) ?? 0) + 1);
  const repeatedDigits = [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .map(([digit, count]) => ({
      digit, count,
      reinforces: primaryFamily.includes(digit) ? "primary" : secondaryFamily.includes(digit) ? "secondary" : "neither",
    }))
    .sort((a, b) => b.count - a.count);

  return {
    date: dateStr,
    universalDay,
    calendarDay,
    universalYear,
    universalMonth,
    structuralEcho,
    primaryFamily,
    secondaryFamily,
    balancingComplement: balancingComplement(universalDay.root),
    countercurrent: countercurrentNum(universalDay.root),
    repeatedDigits,
  };
}

// Name numerology (Pythagorean)
const PYTH = { a:1,j:1,s:1,b:2,k:2,t:2,c:3,l:3,u:3,d:4,m:4,v:4,e:5,n:5,w:5,f:6,o:6,x:6,g:7,p:7,y:7,h:8,q:8,z:8,i:9,r:9 };

function normalizeName(name) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g,"").replace(/[^a-z\s]/g," ").replace(/\s+/g," ").trim();
}

function expressionNum(name) {
  const sum = normalizeName(name).replace(/\s/g,"").split("").reduce((a,c) => a+(PYTH[c]??0),0);
  return reduce(sum);
}

function lifePath(birthDateStr) {
  const sum = birthDateStr.replace(/\D/g,"").split("").reduce((a,d)=>a+parseInt(d,10),0);
  return reduce(sum);
}

function personalYear(birthDateStr, universalYearRoot) {
  const [,bm,bd] = birthDateStr.split("-").map(Number);
  return reduce(bm + bd + universalYearRoot);
}

function personalMonth(pyRoot, calMonth) { return reduce(pyRoot + calMonth); }
function personalDay(pmRoot, calDay) { return reduce(pmRoot + calDay); }

// ── Batting order normalization (Issue #6) ─────────────────────────────────────
// MLB Stats API returns batting order as 100, 200, 300 etc. (position × 100)
function normalizeBattingOrder(raw) {
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  if (!isFinite(n)) return null;
  // Normalize 100-based encoding (100→1, 200→2, ... 900→9)
  const pos = n >= 100 ? Math.round(n / 100) : n;
  return (pos >= 1 && pos <= 9) ? pos : null;
}

// ── MLB data loading ───────────────────────────────────────────────────────────
async function loadMlbData() {
  const rawPath = path.join(DATA_DIR, "hr-props-raw.json");
  if (!existsSync(rawPath)) {
    console.warn("[numerology] hr-props-raw.json not found — empty slate");
    return { batters: [], pitchers: [], games: [] };
  }
  return JSON.parse(readFileSync(rawPath, "utf8"));
}

// Load pre-built player identity cache (built by update-player-identity-cache.mjs)
function loadIdentityCache() {
  const cachePath = path.join(DATA_DIR, "player-identity-cache.json");
  if (!existsSync(cachePath)) {
    console.warn("[numerology] player-identity-cache.json not found — bio data unavailable. Run scripts/update-player-identity-cache.mjs first.");
    return new Map();
  }
  const raw = JSON.parse(readFileSync(cachePath, "utf8"));
  const map = new Map();
  for (const [key, entry] of Object.entries(raw)) {
    map.set(key, entry);
  }
  console.log(`[numerology] Identity cache: ${map.size} entries`);
  const withBd = [...map.values()].filter(e => e.birthDate).length;
  const withJ = [...map.values()].filter(e => e.jerseyNumber != null).length;
  console.log(`[numerology] Cache coverage: birthDate=${withBd}/${map.size}, jersey=${withJ}/${map.size}`);
  return map;
}

const personCache = new Map();
async function fetchPerson(id) {
  if (!id) return null;
  if (personCache.has(id)) return personCache.get(id);
  try {
    const j = await fetchJson(`https://statsapi.mlb.com/api/v1/people/${id}`);
    const p = j?.people?.[0] ?? null;
    personCache.set(id, p);
    return p;
  } catch (e) {
    console.warn(`fetchPerson(${id}) failed: ${e.message}`);
    personCache.set(id, null);
    return null;
  }
}

// Stable player ID lookup — exact normalized full-name match required (Issue #5)
const nameSearchCache = new Map();

function nameSearchVariants(playerName) {
  const base = playerName.trim();
  const variants = new Set([base]);
  variants.add(base.replace(/\./g, "").replace(/\s+/g, " ").trim());
  variants.add(base.replace(/[\u2018\u2019\u02BC]/g, "'"));
  variants.add(base.replace(/[\'\u2018\u2019\u02BC]/g, ""));
  variants.add(base.replace(/-/g, " ").replace(/\s+/g, " ").trim());
  variants.add(base.replace(/\s+/g, " ").trim());
  return [...variants];
}

async function resolvePlayerId(playerName, teamAbbr) {
  const cacheKey = `${playerName}|${teamAbbr ?? ""}`;
  if (nameSearchCache.has(cacheKey)) return nameSearchCache.get(cacheKey);

  const targetNorm = normalizeName(playerName);
  const searchVariants = nameSearchVariants(playerName);

  for (const variant of searchVariants) {
    try {
      const encoded = encodeURIComponent(variant);
      const sr = await fetchJson(`https://statsapi.mlb.com/api/v1/people/search?names=${encoded}&active=true`, 8000);
      const people = sr?.people ?? [];
      if (!people.length) continue;

      const exact = people.filter(p => normalizeName(p.fullName ?? "") === targetNorm);
      if (exact.length === 1) {
        if (teamAbbr && exact[0].currentTeam?.abbreviation && exact[0].currentTeam.abbreviation !== teamAbbr) {
          continue;
        }
        nameSearchCache.set(cacheKey, exact[0].id);
        return exact[0].id;
      }
      if (exact.length > 1) {
        console.warn(`[numerology] Ambiguous match for ${playerName} (${exact.length} results) — skipping`);
        nameSearchCache.set(cacheKey, null);
        return null;
      }
    } catch {}
  }

  console.warn(`[numerology] Could not resolve MLB ID for ${playerName} (${teamAbbr ?? "?"})`);
  nameSearchCache.set(cacheKey, null);
  return null;
}

// ── Baseball Opportunity Score (reuses existing model data) ─────────────────
function baseballScore(batter) {
  const hr = safeNum(batter.hrScore);
  // Display the existing JoeKnowsBall HR score directly as context.
  // This value is never used for numerology selection or ranking.
  if (hr == null) return 0;
  return Math.min(100, Math.max(0, Math.round(hr)));
}

// Market selection: use HR market when hrScore is available (Issue #9)
function selectMarket(batter) {
  const hr = safeNum(batter.hrScore);
  if (hr != null) {
    return {
      recommendedMarket: "Home run",
      marketModelSource: "jkb_hr_props",
      marketScore: hr,
      marketSelectionReason: `JoeKnowsBall HR Props score ${hr.toFixed(1)} — home-run market selected as primary model output.`,
    };
  }
  return {
    recommendedMarket: "Monitor",
    marketModelSource: "unavailable",
    marketScore: null,
    marketSelectionReason: "No model score available for this player.",
  };
}

// ── Age calculation ─────────────────────────────────────────────────────────
function ageOnDate(birthDate, slateDate) {
  if (!birthDate) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [sy, sm, sd] = slateDate.split("-").map(Number);
  let age = sy - by;
  if (sm < bm || (sm === bm && sd < bd)) age--;
  return age;
}

// ── Scoring ───────────────────────────────────────────────────────────────────
const W = METHODOLOGY.weights;

function scorePlayerForNumerology(playerProfile, dailyProfile, missingData = []) {
  const signals = [];
  const awarded = new Set();
  const ud = dailyProfile.universalDay;

  // Maximum achievable raw score — only count signals whose source data IS available
  // This prevents penalizing players for missing disabled/unavailable data
  let maxAchievable = 0;
  maxAchievable += W.jerseyExactMaster; // jersey
  maxAchievable += W.expressionRoot; // expression (always available)
  if (!missingData.includes("birthDate")) {
    maxAchievable += W.personalDayExactMaster; // personalDay
    maxAchievable += W.lifePathExactMaster; // lifePath
    maxAchievable += W.birthDayExactCompound; // birthDay
    maxAchievable += W.ageExactCompound; // age
  }
  if (playerProfile.battingOrder != null) {
    maxAchievable += W.battingOrderExactRoot;
  }
  maxAchievable += W.convergenceMaxBonus;
  // Use a floor of 60 to preserve score scale when most data is available
  const normCeiling = Math.max(60, maxAchievable);

  function award(field, label, type, points, description, key) {
    if (awarded.has(key) || points === 0) return;
    awarded.add(key);
    signals.push({ field, label, type, points, description });
  }

  // Personal Day
  const pd = playerProfile.personalDay;
  if (pd) {
    if (ud.master != null && (pd.compound === ud.master || pd.master === ud.master)) {
      award("personalDay", `Personal Day ${pd.compound}/${pd.root} — Master Match`, "primary_exact_master", W.personalDayExactMaster, `Personal Day matches Universal Day master ${ud.master}.`, "pd:master");
    } else if (pd.original === ud.rawSum || pd.compound === ud.rawSum) {
      award("personalDay", `Personal Day ${pd.original}/${pd.root} — Exact Primary`, "primary_exact_root", W.personalDayExactMaster - 4, `Personal Day ${pd.original} matches Universal Day compound ${ud.rawSum}.`, "pd:exact");
    } else if (pd.root === ud.root) {
      award("personalDay", `Personal Day root ${pd.root} — Root Match`, "personal_cycle", W.personalDayRoot, `Personal Day root ${pd.root} matches Universal Day root.`, "pd:root");
    } else if (pd.root === dailyProfile.countercurrent) {
      award("personalDay", `Personal Day — Countercurrent`, "countercurrent", -W.countercurrentHighField, `Personal Day root ${pd.root} is the countercurrent.`, "pd:counter");
    }
  }

  // Jersey
  const j = playerProfile.jerseyReduced;
  if (j) {
    if (ud.master != null && (j.compound === ud.master || j.original === ud.master)) {
      award("jersey", `Jersey ${j.original} — Exact Master`, "primary_exact_master", W.jerseyExactMaster, `Jersey ${j.original} matches Universal Day master.`, "jersey:master");
    } else if (j.original === dailyProfile.calendarDay.original) {
      award("jersey", `Jersey ${j.original} — Calendar Day Exact`, "secondary_exact", W.calendarDayExactCompound, `Jersey ${j.original} equals Calendar Day ${dailyProfile.calendarDay.original}.`, "jersey:calexact");
    } else if (j.original === ud.rawSum) {
      award("jersey", `Jersey ${j.original} — Exact Primary`, "primary_exact_root", W.jerseyExactMaster - 2, `Jersey ${j.original} matches Universal Day compound ${ud.rawSum}.`, "jersey:udexact");
    } else if (j.root === ud.root) {
      award("jersey", `Jersey ${j.original}/${j.root} — Root Match`, "primary_root", W.jerseyRoot, `Jersey ${j.original} reduces to ${j.root}.`, "jersey:root");
    } else if (j.root === dailyProfile.calendarDay.root && j.root !== ud.root) {
      award("jersey", `Jersey ${j.original}/${j.root} — Secondary Root`, "secondary_root", W.calendarDayRoot, `Jersey root ${j.root} matches Calendar Day root.`, "jersey:secroot");
    } else if (j.root === dailyProfile.countercurrent) {
      award("jersey", `Jersey ${j.original} — Countercurrent`, "countercurrent", -W.countercurrentHighField, `Jersey root is countercurrent.`, "jersey:counter");
    } else if (dailyProfile.primaryFamily.includes(j.root)) {
      award("jersey", `Jersey root ${j.root} — Primary Family`, "family_support", W.primaryFamilyMatch, `Jersey root belongs to family [${dailyProfile.primaryFamily.join("–")}].`, "jersey:primfam");
    } else if (dailyProfile.secondaryFamily.includes(j.root)) {
      award("jersey", `Jersey root ${j.root} — Secondary Family`, "family_support", W.secondaryFamilyMatch, `Jersey root belongs to secondary family.`, "jersey:secfam");
    }
  }

  // Batting order — only award when validated 1-9 (Issue #6)
  const bo = playerProfile.battingOrder;
  if (bo != null && bo >= 1 && bo <= 9) {
    if (bo === ud.root) {
      award("battingOrder", `Batting ${bo} — Exact Root Match`, "primary_exact_root", W.battingOrderExactRoot, `Batting ${bo} exactly matches Universal Day root.`, "bo:exact");
    } else if (dailyProfile.primaryFamily.includes(bo)) {
      award("battingOrder", `Batting ${bo} — Primary Family`, "family_support", W.primaryFamilyMatch, `Batting ${bo} belongs to primary family.`, "bo:primfam");
    } else if (dailyProfile.secondaryFamily.includes(bo)) {
      award("battingOrder", `Batting ${bo} — Secondary Family`, "family_support", W.secondaryFamilyMatch, `Batting ${bo} belongs to secondary family.`, "bo:secfam");
    }
  }

  // Life Path
  const lp = playerProfile.lifePath;
  if (lp) {
    if (ud.master != null && (lp.compound === ud.master || lp.master === ud.master)) {
      award("lifePath", `Life Path ${lp.compound} — Master Match`, "primary_exact_master", W.lifePathExactMaster, `Life Path matches Universal Day master.`, "lp:master");
    } else if (lp.root === ud.root) {
      award("lifePath", `Life Path ${lp.compound}/${lp.root} — Root Match`, "primary_root", W.lifePathRoot, `Life Path ${lp.compound} root ${lp.root} matches Universal Day root.`, "lp:root");
    } else if (lp.root === dailyProfile.countercurrent) {
      award("lifePath", `Life Path — Countercurrent`, "countercurrent", -Math.round(W.countercurrentHighField / 2), `Life Path root ${lp.root} is countercurrent.`, "lp:counter");
    }
  }

  // Birth Day
  const bd = playerProfile.birthDayNum;
  if (bd) {
    if (bd.original === dailyProfile.calendarDay.original) {
      award("birthDay", `Birth Day ${bd.original} — Calendar Day Exact`, "secondary_exact", W.birthDayExactCompound, `Birth day matches Calendar Day.`, "bd:calexact");
    } else if (bd.root === ud.root) {
      award("birthDay", `Birth Day ${bd.original}/${bd.root} — Root Match`, "primary_root", W.birthDayRoot, `Birth day root ${bd.root} matches Universal Day.`, "bd:root");
    }
  }

  // Age (Issue #8 — now implemented)
  const age = playerProfile.age;
  if (age != null) {
    const ageR = reduce(age);
    if (ud.master != null && (ageR.original === ud.master || ageR.compound === ud.master)) {
      award("age", `Age ${age} — Master Match`, "primary_exact_master", W.ageExactCompound, `Age ${age} matches Universal Day master.`, "age:master");
    } else if (ageR.root === ud.root) {
      award("age", `Age ${age} root ${ageR.root} — Root Match`, "primary_root", W.ageRoot, `Age ${age} reduces to ${ageR.root}.`, "age:root");
    }
  }

  // Expression Number
  const expr = playerProfile.expressionNum;
  if (expr && expr.root === ud.root) {
    award("expression", `Expression ${expr.compound}/${expr.root} — Root Match`, "name_resonance", W.expressionRoot, `Name Expression root matches Universal Day root.`, "expr:root");
  }

  // Repeated digits (contextual echo)
  for (const rep of dailyProfile.repeatedDigits) {
    const jerseyMatch = j?.root === rep.digit || j?.original === rep.digit;
    const boMatch = bo === rep.digit;
    if ((jerseyMatch || boMatch) && rep.reinforces === "primary") {
      award("repeatedDigit", `Date digit ${rep.digit} (×${rep.count}) — Contextual Echo`, "contextual_echo", W.repeatedDateDigit, `Digit ${rep.digit} repeats ${rep.count}× in today's date.`, `rep:${rep.digit}`);
    }
  }

  // Multiple independent countercurrent penalty (Issue #8)
  const counterFields = signals.filter(s => s.type === "countercurrent");
  if (counterFields.length >= 2) {
    const penalty = -(W.countercurrentMultiple * (counterFields.length - 1));
    signals.push({ field: "multiCountercurrent", label: `${counterFields.length} independent countercurrents`, type: "countercurrent", points: penalty, description: `Multiple independent countercurrent signals compound: ${counterFields.map(s=>s.field).join(", ")}.` });
  }

  const pos = signals.filter(s => s.points > 0);
  const neg = signals.filter(s => s.points < 0);
  const positiveTotal = pos.reduce((a,s) => a+s.points, 0);
  const countercurrentTotal = Math.abs(neg.reduce((a,s) => a+s.points, 0));
  const independentSources = new Set(pos.filter(s => !["family_support","contextual_echo"].includes(s.type)).map(s=>s.field));
  const convergenceBonus = Math.min(independentSources.size >= 4 ? W.convergenceMaxBonus : independentSources.size >= 3 ? Math.round(W.convergenceMaxBonus*0.5) : 0, W.convergenceMaxBonus);
  const rawNumerology = Math.max(0, positiveTotal - countercurrentTotal + convergenceBonus);
  const numerologyScore = Math.min(100, Math.round((rawNumerology / normCeiling) * 100));
  return { signals, positiveTotal, countercurrentTotal, convergenceBonus, numerologyScore, normCeiling };
}

// ── Lineup status (Issue #7) ──────────────────────────────────────────────────
function computeLineupStatus(rosterEntry, isPreLineupTime) {
  if (!rosterEntry) return { status: "unknown", source: null, asOf: null };
  if (isPreLineupTime) {
    return { status: "morning_projected", source: "mlb-api-schedule", asOf: new Date().toISOString() };
  }
  return { status: "projected", source: "mlb-api-schedule", asOf: new Date().toISOString() };
}

function computeDataStatus(batters, scheduleRoster, confirmedCount) {
  if (batters.length === 0) return "unavailable";
  if (confirmedCount === 0 && scheduleRoster.length === 0) return "unavailable";
  if (confirmedCount > 0 && confirmedCount >= batters.length * 0.5) return "partially_confirmed";
  return "morning_projected";
}

// ── Grok narratives ─────────────────────────────────────────────────────────
const PROHIBITED_GROK_LANGUAGE = ["guaranteed", "lock", "destined", "certain outcome", "can't lose", "will win", "sure thing"];

function validateGrokResponse(parsed, requestedRanks) {
  if (!parsed || typeof parsed !== "object") throw new Error("Not an object");
  if (typeof parsed.dailyInterpretation !== "string" || parsed.dailyInterpretation.length < 10) throw new Error("Missing dailyInterpretation");
  if (!Array.isArray(parsed.players)) throw new Error("Missing players array");

  const ranks = parsed.players.map(p => p.rank);
  const rankSet = new Set(ranks);
  if (ranks.length !== rankSet.size) throw new Error("Duplicate ranks in Grok response");
  for (const r of ranks) {
    if (!requestedRanks.includes(r)) throw new Error(`Unknown rank ${r} in Grok response`);
  }

  // Schema check each player — must not include score/odds fields
  const FORBIDDEN_FIELDS = ["numerologyScore","baseballScore","finalScore","odds","line"];
  for (const p of parsed.players) {
    for (const f of FORBIDDEN_FIELDS) {
      if (f in p) throw new Error(`Grok returned forbidden field '${f}' for rank ${p.rank}`);
    }
    const summaryText = [p.summary, p.primaryPatternLabel, p.marketExplanation, p.countercurrentExplanation].join(" ").toLowerCase();
    for (const phrase of PROHIBITED_GROK_LANGUAGE) {
      if (summaryText.includes(phrase)) throw new Error(`Prohibited language "${phrase}" in Grok response`);
    }
    if (p.summary?.length > 400) throw new Error(`summary too long for rank ${p.rank}`);
  }
  return true;
}

async function callGrokForNarratives(candidates, dailyProfile, apiKey) {
  if (!apiKey) return null;
  const requestedRanks = candidates.map(c => c.rank);
  const payload = {
    dailyProfile: {
      date: dailyProfile.date,
      universalDay: { compound: dailyProfile.universalDay.rawSum, master: dailyProfile.universalDay.master, root: dailyProfile.universalDay.root, rawSum: dailyProfile.universalDay.rawSum },
      calendarDay: { compound: dailyProfile.calendarDay.original, root: dailyProfile.calendarDay.root },
      primaryFamily: dailyProfile.primaryFamily,
      secondaryFamily: dailyProfile.secondaryFamily,
      countercurrent: dailyProfile.countercurrent,
      balancingComplement: dailyProfile.balancingComplement,
    },
    candidates: candidates.map(c => ({
      rank: c.rank,
      playerName: c.playerName,
      team: c.team,
      opponent: c.opponent,
      lineupStatus: c.lineupStatus,
      battingOrder: c.battingOrder,
      jerseyNumber: c.jerseyNumber,
      recommendedMarket: c.recommendedMarket,
      positiveSignals: c.signals.filter(s => s.points > 0).slice(0, 4),
      counterSignals: c.signals.filter(s => s.points < 0),
      missingData: c.missingData,
    })),
    requestedRanks,
  };

  const userMsg = `Return ONLY valid JSON with keys: dailyInterpretation (string), closingObservation (string), players (array: {rank,summary,primaryPatternLabel,countercurrentExplanation,marketExplanation}). Do not include any numeric scores, odds, or lines. Max 400 chars per summary.\n\nInput:\n${JSON.stringify(payload)}`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(GROK_API_URL, {
      signal: ctrl.signal, method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: GROK_MODEL, max_tokens: 2000, messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ]}),
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Grok HTTP ${res.status}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    validateGrokResponse(parsed, requestedRanks);
    return parsed;
  } catch (e) {
    console.warn(`[numerology] Grok validation/call failed: ${e.message} — using fallback`);
    return null;
  }
}

// ── Production validation (Issue #11) ────────────────────────────────────────
function validateOutput(output, slateDate) {
  const errors = [];

  // No fixture data in production
  if (output.generationMode === "fixture") errors.push("generationMode is 'fixture'");
  const demoPatterns = [/demonstration/i, /demo player/i, /placeholder/i];
  for (const play of [...(output.featuredPlays ?? []), ...(output.watchlist ?? [])]) {
    for (const pat of demoPatterns) {
      if (pat.test(play.playerName ?? "")) errors.push(`Demo player name: ${play.playerName}`);
      if (pat.test(play.team ?? "")) errors.push(`Demo team: ${play.team}`);
    }
  }

  // Date match
  if (output.date !== slateDate) errors.push(`date mismatch: ${output.date} ≠ ${slateDate}`);

  // Universal Day must come from full-date digit sum (not just calendar day)
  const digits = slateDate.replace(/-/g,"").split("").map(Number);
  const expectedRawSum = digits.reduce((a,b)=>a+b,0);
  if (output.dailyProfile?.universalDayRawSum !== expectedRawSum) {
    errors.push(`universalDayRawSum ${output.dailyProfile?.universalDayRawSum} ≠ expected ${expectedRawSum}`);
  }
  if (output.dailyProfile?.universalDayCompound !== expectedRawSum) {
    errors.push(`universalDayCompound ${output.dailyProfile?.universalDayCompound} ≠ full-date compound ${expectedRawSum}`);
  }

  // Master number preservation
  if (MASTER_NUMBERS.has(expectedRawSum) && output.dailyProfile?.universalDayMaster !== expectedRawSum) {
    errors.push(`universalDayMaster should be ${expectedRawSum} but got ${output.dailyProfile?.universalDayMaster}`);
  }

  // Calendar Day must be stored separately
  const calDay = slateDate.split("-")[2];
  if (output.dailyProfile?.calendarDayCompound !== parseInt(calDay, 10)) {
    errors.push(`calendarDayCompound ${output.dailyProfile?.calendarDayCompound} ≠ ${parseInt(calDay, 10)}`);
  }

  // Methodology version
  if (output.methodologyVersion !== METHODOLOGY_VERSION) {
    errors.push(`methodologyVersion mismatch: ${output.methodologyVersion}`);
  }

  // Baseball context must never alter an alignment score.
  for (const play of [...(output.featuredPlays ?? []), ...(output.bestAvailable ?? []), ...(output.watchlist ?? [])]) {
    if (play.finalScore !== play.numerologyScore) {
      errors.push(`alignment score for ${play.playerName} must equal numerology score`);
    }
  }
  if (output.rankingBasis !== "numerology_only" || output.baseballContextOnly !== true) {
    errors.push("Missing numerology-only ranking declaration");
  }

  // Candidate pool disclosure
  if (!output.candidatePool) errors.push("Missing candidatePool disclosure");

  if (errors.length > 0) throw new Error(`Output validation failed:\n  ${errors.join("\n  ")}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const generationStartedAt = new Date().toISOString();
  const slateDate = DATE_ARG ?? getEtDate();
  const [yearStr, monthStr, dayStr] = slateDate.split("-");
  const calMonth = parseInt(monthStr, 10);
  const calDay = parseInt(dayStr, 10);

  console.log(`[numerology] date=${slateDate} dry-run=${IS_DRY_RUN} fixture=${USE_FIXTURE}`);
  console.log(`[numerology] generationStartedAt=${generationStartedAt}`);

  // Step 1: Deterministic date profile
  const dailyProfile = buildDailyProfile(slateDate);
  const udLabel = dailyProfile.universalDay.master
    ? `${dailyProfile.universalDay.master}/${dailyProfile.universalDay.root}`
    : dailyProfile.universalDay.rawSum > 9
      ? `${dailyProfile.universalDay.rawSum}/${dailyProfile.universalDay.root}`
      : String(dailyProfile.universalDay.root);
  console.log(`[numerology] Universal Day: ${udLabel} | Calendar Day: ${dailyProfile.calendarDay.original}/${dailyProfile.calendarDay.root} | Primary Family: [${dailyProfile.primaryFamily.join("-")}]`);

  // Step 2: Load MLB data + identity cache
  const mlbData = await loadMlbData();
  const batters = mlbData.batters ?? [];
  const identityCache = loadIdentityCache();
  const candidatePoolType = "jkb_hr_props";
  const eligiblePlayerCount = batters.length;

  if (batters.length === 0) {
    console.warn("[numerology] No batters in MLB data");
  }

  // Step 3: Schedule lineup (Issue #7 — proper lineup status)
  let scheduleRoster = [];
  let lineupDataAsOf = null;
  const isPreLineupTime = new Date().getUTCHours() < 16; // before noon ET roughly

  try {
    const sched = await fetchJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${slateDate}&hydrate=probablePitcher,lineups`);
    const games = sched?.dates?.[0]?.games ?? [];
    lineupDataAsOf = new Date().toISOString();
    for (const g of games) {
      const awayLineup = g.lineups?.awayPlayers ?? [];
      const homeLineup = g.lineups?.homePlayers ?? [];
      for (const player of [...awayLineup, ...homeLineup]) {
        if (player.id) {
          const pos = normalizeBattingOrder(player.battingOrder);
          scheduleRoster.push({ id: player.id, battingOrder: pos, teamId: player.team?.id });
        }
      }
    }
    console.log(`[numerology] Schedule roster: ${scheduleRoster.length} players`);
  } catch (e) {
    console.warn(`[numerology] Schedule fetch failed: ${e.message}`);
  }

  // Step 4: Score all candidates using cache (no sequential API calls)
  const candidates = [];
  const seen = new Set();
  const universalYearRoot = dailyProfile.universalYear.root;
  const exclusionReasons = [];

  for (const batter of batters) {
    const key = `${batter.player}|${batter.team}`;
    if (seen.has(key)) { exclusionReasons.push({ player: batter.player, reason: "duplicate" }); continue; }
    seen.add(key);

    // Look up from pre-built cache (Issue #3 — no sequential API calls)
    const cached = identityCache.get(key);
    const personId = cached?.mlbId ?? null;
    const birthDate = cached?.birthDate ?? null;
    const jerseyNum = cached?.jerseyNumber ?? null;
    const missingData = [];
    if (!personId) missingData.push("mlbId");
    if (!birthDate) missingData.push("birthDate");
    if (jerseyNum == null) missingData.push("jersey");

    // Lineup status from schedule roster
    const rosterEntry = scheduleRoster.find(r => r.id === personId);
    const lineupInfo = computeLineupStatus(rosterEntry, isPreLineupTime);
    const battingOrder = rosterEntry?.battingOrder ?? null;

    // Numerology profile
    const jerseyReduced = jerseyNum != null ? reduce(jerseyNum) : null;
    const age = ageOnDate(birthDate, slateDate);

    let lpNum = null, birthDayNum = null, pdResult = null;
    if (birthDate) {
      lpNum = lifePath(birthDate);
      const bdDay = parseInt(birthDate.split("-")[2] ?? "1", 10);
      birthDayNum = reduce(bdDay);
      const pyear = personalYear(birthDate, universalYearRoot);
      const pmonth = personalMonth(pyear.root, calMonth);
      pdResult = personalDay(pmonth.root, calDay);
    }

    const exprNum = expressionNum(batter.player);
    const playerNumerology = {
      jerseyReduced, battingOrder, age,
      personalDay: pdResult, lifePath: lpNum, birthDayNum,
      expressionNum: exprNum,
    };

    const { signals, positiveTotal, countercurrentTotal, convergenceBonus, numerologyScore } = scorePlayerForNumerology(playerNumerology, dailyProfile, missingData);
    const bbScore = baseballScore(batter);
    // Alignment is determined only by numerology. Baseball opportunity is
    // retained as context but cannot affect selection, rank, or qualification.
    const finalScore = numerologyScore;
    const market = selectMarket(batter);

    candidates.push({
      playerName: batter.player,
      team: batter.team,
      opponent: batter.opponent,
      opposingPitcher: batter.opposingPitcher,
      personId,
      birthDate,
      jerseyNumber: jerseyNum,
      battingOrder,
      lineupStatus: lineupInfo.status,
      lineupSource: lineupInfo.source,
      ...market,
      hrOdds: batter.hrOddsYes ?? null,
      numerologyScore,
      baseballScore: bbScore,
      finalScore,
      signals,
      positiveTotal,
      countercurrentTotal,
      convergenceBonus,
      missingData,
      hrScore: batter.hrScore,
    });
  }

  // Rank exclusively by numerology. Tie-breakers are also numerology-only.
  candidates.sort((a, b) =>
    b.numerologyScore - a.numerologyScore ||
    b.positiveTotal - a.positiveTotal ||
    b.convergenceBonus - a.convergenceBonus ||
    a.countercurrentTotal - b.countercurrentTotal ||
    a.playerName.localeCompare(b.playerName)
  );
  candidates.forEach((c, i) => { c.rank = i + 1; });

  const featured = candidates.filter(c => c.numerologyScore >= 60).slice(0, 5);
  const bestAvailable = featured.length < 3
    ? candidates.filter(c => c.numerologyScore < 60).slice(0, 3 - featured.length)
    : [];
  const watchlist = candidates.filter(c => c.numerologyScore < 60 && c.numerologyScore >= 45).slice(0, 6);
  const countercurrents = candidates.filter(c => c.countercurrentTotal > 0 && c.numerologyScore < 40).slice(0, 3);
  const confirmedCount = candidates.filter(c => c.lineupStatus === "confirmed").length;

  console.log(`[numerology] Scored ${candidates.length} | Featured: ${featured.length} | Watchlist: ${watchlist.length}`);

  // Step 5: Grok narratives
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const narratives = await callGrokForNarratives([...featured, ...watchlist.slice(0,3)], dailyProfile, apiKey);
  const narrativeSource = narratives ? "grok" : "fallback";

  function getNarrative(rank) {
    if (!narratives) return { summary: "Alignment is not probability. Patterns are documented, not guaranteed.", primaryPatternLabel: null, countercurrentExplanation: null, marketExplanation: null };
    return narratives.players?.find(p => p.rank === rank) ?? {};
  }

  const generationCompletedAt = new Date().toISOString();

  // Build output
  const output = {
    date: slateDate,
    timezone: "America/New_York",
    methodologyVersion: METHODOLOGY_VERSION,
    scheduledFor: SCHEDULED_FOR,
    generationStartedAt,
    generationCompletedAt,
    generatedAt: generationCompletedAt,
    lineupDataAsOf,
    generationMode: IS_DRY_RUN ? "dry_run" : USE_FIXTURE ? "fixture" : "live",
    narrativeSource,
    rankingBasis: "numerology_only",
    baseballContextOnly: true,
    dataStatus: computeDataStatus(batters, scheduleRoster, confirmedCount),
    candidatePool: {
      candidatePoolType,
      description: "Players available in the JoeKnowsBall HR props dataset.",
      eligiblePlayerCount,
      evaluatedPlayerCount: candidates.length,
      excludedPlayerCount: eligiblePlayerCount - candidates.length,
      exclusionReasons: exclusionReasons.slice(0, 10),
    },
    dailyProfile: {
      universalDayRawSum: dailyProfile.universalDay.rawSum,
      universalDayCompound: dailyProfile.universalDay.rawSum,
      universalDayMaster: dailyProfile.universalDay.master,
      universalDayRoot: dailyProfile.universalDay.root,
      universalDayTrace: dailyProfile.universalDay.trace,
      calendarDayCompound: dailyProfile.calendarDay.original,
      calendarDayRoot: dailyProfile.calendarDay.root,
      universalYear: dailyProfile.universalYear.root,
      universalMonth: dailyProfile.universalMonth.root,
      structuralEcho: `${dailyProfile.structuralEcho.original}/${dailyProfile.structuralEcho.root}`,
      primaryFamily: dailyProfile.primaryFamily,
      secondaryFamily: dailyProfile.secondaryFamily,
      balancingComplement: dailyProfile.balancingComplement,
      countercurrent: dailyProfile.countercurrent,
      repeatedDigits: dailyProfile.repeatedDigits,
      interpretation: narratives?.dailyInterpretation ?? `Universal Day ${udLabel} — ${dailyProfile.primaryFamily.join("–")} family dominant. Countercurrent at ${dailyProfile.countercurrent}. Balancing complement at ${dailyProfile.balancingComplement}. Patterns are documented, not guaranteed.`,
    },
    featuredPlays: featured.map(c => ({
      rank: c.rank,
      playerId: c.personId ?? null,
      playerName: c.playerName,
      team: c.team,
      opponent: c.opponent,
      opposingPitcher: c.opposingPitcher,
      lineupStatus: c.lineupStatus,
      lineupSource: c.lineupSource,
      battingOrder: c.battingOrder,
      jerseyNumber: c.jerseyNumber,
      recommendedMarket: c.recommendedMarket,
      marketModelSource: c.marketModelSource,
      marketScore: c.marketScore,
      marketSelectionReason: c.marketSelectionReason,
      odds: c.hrOdds ?? null,
      numerologyScore: c.numerologyScore,
      baseballScore: c.baseballScore,
      finalScore: c.finalScore,
      formula: `Numerology alignment: ${c.numerologyScore}. Baseball context: ${c.baseballScore} (not used in rank).`,
      confidence: c.numerologyScore >= 75 ? "high" : c.numerologyScore >= 60 ? "medium" : "low",
      positiveSignals: c.signals.filter(s => s.points > 0),
      counterSignals: c.signals.filter(s => s.points < 0),
      missingData: c.missingData,
      ...getNarrative(c.rank),
    })),
    bestAvailable: bestAvailable.map(c => ({
      rank: c.rank,
      playerId: c.personId ?? null,
      playerName: c.playerName,
      team: c.team,
      opponent: c.opponent,
      opposingPitcher: c.opposingPitcher,
      lineupStatus: c.lineupStatus,
      lineupSource: c.lineupSource,
      battingOrder: c.battingOrder,
      jerseyNumber: c.jerseyNumber,
      recommendedMarket: c.recommendedMarket,
      marketModelSource: c.marketModelSource,
      marketScore: c.marketScore,
      marketSelectionReason: c.marketSelectionReason,
      odds: c.hrOdds ?? null,
      numerologyScore: c.numerologyScore,
      baseballScore: c.baseballScore,
      finalScore: c.numerologyScore,
      formula: `Numerology alignment: ${c.numerologyScore}. Baseball context: ${c.baseballScore} (not used in rank).`,
      confidence: c.numerologyScore >= 75 ? "high" : c.numerologyScore >= 60 ? "medium" : "low",
      positiveSignals: c.signals.filter(s => s.points > 0),
      counterSignals: c.signals.filter(s => s.points < 0),
      primarySignal: c.signals.filter(s => s.points > 0)[0]?.label ?? null,
      missingData: c.missingData,
      summary: getNarrative(c.rank).summary ?? "Best available numerology alignment; baseball context did not affect this ranking.",
      belowThresholdLabel: "Best available today — below the numerology threshold",
    })),
    watchlist: watchlist.map(c => ({
      rank: c.rank,
      playerId: c.personId ?? null,
      playerName: c.playerName,
      team: c.team,
      opponent: c.opponent,
      lineupStatus: c.lineupStatus,
      battingOrder: c.battingOrder,
      jerseyNumber: c.jerseyNumber,
      recommendedMarket: c.recommendedMarket,
      numerologyScore: c.numerologyScore,
      baseballScore: c.baseballScore,
      finalScore: c.finalScore,
      primarySignal: c.signals.filter(s => s.points > 0)[0]?.label ?? null,
      missingData: c.missingData,
      summary: getNarrative(c.rank).summary ?? null,
    })),
    countercurrents: countercurrents.map(c => ({
      playerName: c.playerName,
      team: c.team,
      numerologyScore: c.numerologyScore,
      baseballScore: c.baseballScore,
      finalScore: c.finalScore,
      countercurrentSignals: c.signals.filter(s => s.points < 0),
    })),
    scoringConfiguration: {
      weights: W,
      methodologyVersion: METHODOLOGY_VERSION,
      rankingBasis: "numerology_only",
      baseballContextOnly: true,
    },
    sources: {
      hrPropsRaw: existsSync(path.join(DATA_DIR,"hr-props-raw.json")) ? "loaded" : "missing",
      mlbStatsApi: "used",
      grok: apiKey ? "used" : "skipped",
    },
    narrative: { closingObservation: narratives?.closingObservation ?? "Patterns are documented, not guaranteed. The model records recurrence without claiming causation." },
  };

  if (IS_DRY_RUN) {
    console.log("[numerology] DRY RUN — not writing files");
    console.log(JSON.stringify({ date: output.date, udLabel, candidatePool: output.candidatePool, dataStatus: output.dataStatus, featuredCount: output.featuredPlays.length }, null, 2));
    return;
  }

  // Atomic write: temp → validate → rename (Issue #10)
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  const targetPath = USE_FIXTURE ? FIXTURE_OUTPUT : DAILY_OUTPUT;
  const tempPath = targetPath + ".tmp";

  try {
    writeFileSync(tempPath, JSON.stringify(output, null, 2) + "\n");

    // Production validation (skip for fixture)
    if (!USE_FIXTURE) {
      validateOutput(output, slateDate);
    } else {
      console.log("[numerology] FIXTURE — skipping production validation");
    }

    // Atomic rename
    renameSync(tempPath, targetPath);
    console.log(`[numerology] ✓ Written: ${targetPath}`);

    // Archive (only for live production, not fixture)
    if (!USE_FIXTURE) {
      const archivePath = path.join(ARCHIVE_DIR, `${slateDate}.json`);
      if (!existsSync(archivePath)) {
        writeFileSync(archivePath, JSON.stringify(output, null, 2) + "\n");
        console.log(`[numerology] Archived: ${archivePath}`);
      }
    }

    console.log(`[numerology] Scored ${candidates.length} players | Featured: ${featured.length} | Narrative: ${narrativeSource} | Mode: ${output.generationMode}`);
  } catch (err) {
    // Clean up temp file on any failure
    try { if (existsSync(tempPath)) unlinkSync(tempPath); } catch {}
    throw err;
  }
}

main().catch(err => {
  console.error("[numerology] Fatal:", err.message);
  process.exit(1);
});
