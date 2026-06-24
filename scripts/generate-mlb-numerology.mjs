#!/usr/bin/env node
/**
 * generate-mlb-numerology.mjs
 * JoeKnowsBall MLB Numerical Alignment — Daily Generation Script
 * Methodology v2.0.0
 *
 * Layers:
 *   1. Deterministic numerology engine (this script, no Grok)
 *   2. Verified MLB data (existing hr-props-raw + MLB Stats API)
 *   3. Grok narrative interpretation (narrative fields only)
 *
 * Usage:
 *   node scripts/generate-mlb-numerology.mjs
 *   node scripts/generate-mlb-numerology.mjs --date 2026-06-24
 *   node scripts/generate-mlb-numerology.mjs --dry-run
 *   node scripts/generate-mlb-numerology.mjs --date 2026-06-24 --fixture
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const ARCHIVE_DIR = path.join(DATA_DIR, "numerology", "history");
const DAILY_OUTPUT = path.join(DATA_DIR, "numerology-daily.json");
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

// ── Utilities ─────────────────────────────────────────────────────────────────
function getEtDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
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
  // Preserve master numbers before digit-summing
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
  return { ...base, original: rawSum, rawSum, trace: [traceStr, ...base.trace.slice(1)] };
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
  const allDigits = digits.split("").map(Number).filter(n => n !== 0);
  const counts = new Map();
  for (const n of allDigits) counts.set(n, (counts.get(n) ?? 0) + 1);
  const repeatedDigits = [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .map(([digit, count]) => ({
      digit, count,
      reinforces: primaryFamily.includes(digit) ? "primary" : secondaryFamily.includes(digit) ? "secondary" : "neither",
    }));
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

// ── MLB data loading ───────────────────────────────────────────────────────────
async function loadMlbData() {
  const rawPath = path.join(DATA_DIR, "hr-props-raw.json");
  if (!existsSync(rawPath)) {
    console.warn("hr-props-raw.json not found — using empty slate");
    return { batters: [], pitchers: [], games: [] };
  }
  return JSON.parse(readFileSync(rawPath, "utf8"));
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

// ── Baseball Opportunity Score (reuses existing model data) ─────────────────
function baseballScore(batter, mlbData) {
  // Reuse existing hrScore as a baseball opportunity proxy (0-100 scale)
  // hrScore from our existing model already encodes matchup, park, pitcher quality
  const hr = safeNum(batter.hrScore);
  if (hr == null) return 50; // neutral default
  // hrScore typical range 55-90; normalize to 0-100
  const normalized = Math.min(100, Math.max(0, Math.round(((hr - 40) / 50) * 100)));
  // Deduct for missing/TBD pitcher
  const pitcherPenalty = (batter.opposingPitcher === "TBD" || !batter.opposingPitcher) ? -20 : 0;
  return Math.max(0, normalized + pitcherPenalty);
}

// ── Scoring ───────────────────────────────────────────────────────────────────
const W = METHODOLOGY.weights;

function scorePlayerForNumerology(playerProfile, dailyProfile) {
  const signals = [];
  const awarded = new Set();
  const ud = dailyProfile.universalDay;

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
    } else if (pd.compound === ud.compound || pd.original === ud.compound) {
      award("personalDay", `Personal Day ${pd.compound} — Exact Primary`, "primary_exact_root", W.personalDayExactMaster - 4, `Personal Day ${pd.compound} matches Universal Day.`, "pd:exact");
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
      award("jersey", `Jersey ${j.original} — Calendar Day Exact`, "secondary_exact", W.calendarDayExactCompound, `Jersey ${j.original} equals Calendar Day.`, "jersey:calexact");
    } else if (j.compound === ud.compound) {
      award("jersey", `Jersey ${j.original} — Exact Primary`, "primary_exact_root", W.jerseyExactMaster - 2, `Jersey ${j.original} matches Universal Day.`, "jersey:udexact");
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

  // Batting order
  const bo = playerProfile.battingOrder;
  if (bo != null) {
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

  // Expression Number
  const expr = playerProfile.expressionNum;
  if (expr && expr.root === ud.root) {
    award("expression", `Expression ${expr.compound}/${expr.root} — Root Match`, "name_resonance", W.expressionRoot, `Name Expression Number root matches Universal Day root.`, "expr:root");
  }

  // Repeated digits
  for (const rep of dailyProfile.repeatedDigits) {
    const matches = (j?.root === rep.digit || bo === rep.digit);
    if (matches && rep.reinforces === "primary") {
      award("repeatedDigit", `Date digit ${rep.digit} (×${rep.count}) — Contextual Echo`, "contextual_echo", W.repeatedDateDigit, `Digit ${rep.digit} repeats ${rep.count}× in today's date.`, `rep:${rep.digit}`);
    }
  }

  const pos = signals.filter(s => s.points > 0);
  const neg = signals.filter(s => s.points < 0);
  const positiveTotal = pos.reduce((a,s) => a+s.points, 0);
  const countercurrentTotal = Math.abs(neg.reduce((a,s) => a+s.points, 0));
  const independentSources = new Set(pos.filter(s => !["family_support","contextual_echo"].includes(s.type)).map(s=>s.field));
  const convergenceBonus = Math.min(independentSources.size >= 4 ? W.convergenceMaxBonus : independentSources.size >= 3 ? Math.round(W.convergenceMaxBonus*0.5) : 0, W.convergenceMaxBonus);
  const rawNumerology = Math.max(0, positiveTotal - countercurrentTotal + convergenceBonus);
  const numerologyScore = Math.min(100, Math.round((rawNumerology / 60) * 100));
  return { signals, positiveTotal, countercurrentTotal, convergenceBonus, numerologyScore };
}

// ── Grok narrative ─────────────────────────────────────────────────────────────
async function callGrokForNarratives(candidates, dailyProfile, apiKey) {
  if (!apiKey) return null;
  const payload = {
    dailyProfile: {
      date: dailyProfile.date,
      universalDay: { compound: dailyProfile.universalDay.compound, master: dailyProfile.universalDay.master, root: dailyProfile.universalDay.root, rawSum: dailyProfile.universalDay.rawSum },
      calendarDay: { compound: dailyProfile.calendarDay.compound, root: dailyProfile.calendarDay.root },
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
      numerologyScore: c.numerologyScore,
      baseballScore: c.baseballScore,
      finalScore: c.finalScore,
      positiveSignals: c.signals.filter(s => s.points > 0).slice(0, 4),
      counterSignals: c.signals.filter(s => s.points < 0),
      missingData: c.missingData,
    })),
    outputSchema: {
      dailyInterpretation: "2-3 sentences (string)",
      closingObservation: "1-2 sentences (string)",
      players: "array with {rank, summary, primaryPatternLabel, countercurrentExplanation, marketExplanation} for each candidate"
    },
  };

  const userMsg = `Generate narrative text only. Do not change any numbers or scores.\n\nInput:\n${JSON.stringify(payload, null, 2)}\n\nReturn ONLY valid JSON with keys: dailyInterpretation, closingObservation, players (array with rank/summary/primaryPatternLabel/countercurrentExplanation/marketExplanation).`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(GROK_API_URL, {
      signal: ctrl.signal,
      method: "POST",
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
    // Validate — Grok must not have changed candidate count or added unknown fields
    if (!parsed.dailyInterpretation || !Array.isArray(parsed.players)) throw new Error("Invalid Grok response schema");
    return parsed;
  } catch (e) {
    console.warn(`Grok narrative failed: ${e.message} — using fallback`);
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const generationStartedAt = new Date().toISOString();
  const slateDate = DATE_ARG ?? getEtDate();
  const [yearStr, monthStr, dayStr] = slateDate.split("-");
  const calMonth = parseInt(monthStr, 10);
  const calDay = parseInt(dayStr, 10);

  console.log(`[numerology] date=${slateDate} dry-run=${IS_DRY_RUN} fixture=${USE_FIXTURE}`);

  // Step 1: Build deterministic date profile
  const dailyProfile = buildDailyProfile(slateDate);
  console.log(`[numerology] Universal Day: ${dailyProfile.universalDay.compound}${dailyProfile.universalDay.master ? `/${dailyProfile.universalDay.root}` : ""} | Calendar Day: ${dailyProfile.calendarDay.compound}/${dailyProfile.calendarDay.root} | Family: [${dailyProfile.primaryFamily.join("-")}]`);

  // Step 2: Load MLB data
  const mlbData = await loadMlbData();
  const batters = mlbData.batters ?? [];
  const pitchers = mlbData.pitchers ?? [];

  if (batters.length === 0) {
    console.warn("[numerology] No batters in MLB data — generating profile-only output");
  }

  // Step 3: Fetch player bio data (birth date, jersey) from MLB Stats API
  const uniquePlayerIds = [...new Set(batters.map(b => b.opposingPitcherId).filter(Boolean))];
  // Also try to get batter IDs — look up from schedule if available
  const scheduleGames = mlbData.games ?? [];

  // Collect all pitcher IDs from current slate
  const pitcherIds = pitchers.map(p => p.pitcherId).filter(Boolean);

  // We'll enrich batters by fetching their player data from MLB API
  // For speed, batch: grab schedule to get batter player IDs
  let scheduleRoster = [];
  try {
    const sched = await fetchJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${slateDate}&hydrate=probablePitcher,lineups`);
    const games = sched?.dates?.[0]?.games ?? [];
    for (const g of games) {
      const awayLineup = g.lineups?.awayPlayers ?? [];
      const homeLineup = g.lineups?.homePlayers ?? [];
      for (const player of [...awayLineup, ...homeLineup]) {
        if (player.id) scheduleRoster.push({ id: player.id, order: player.battingOrder, teamId: player.team?.id });
      }
    }
  } catch (e) {
    console.warn(`[numerology] Schedule lineup fetch failed: ${e.message}`);
  }

  // Build player profile for each unique batter in the props data
  const candidates = [];
  const seen = new Set();
  const universalYearRoot = dailyProfile.universalYear.root;

  for (const batter of batters) {
    const key = `${batter.player}|${batter.team}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Fetch person data for birth date + jersey
    let person = null;
    // Try to find player ID from schedule roster by name match (rough)
    // Or use the opposing pitcher ID as a proxy for team's pitcher
    // For now, use a name search to get the batter's MLB ID
    let personId = null;
    try {
      const searchName = encodeURIComponent(batter.player.replace(/[éèêëàâîïùûüç]/g, c => ({é:"e",è:"e",ê:"e",ë:"e",à:"a",â:"a",î:"i",ï:"i",ù:"u",û:"u",ü:"u",ç:"c"})[c]||c));
      const sr = await fetchJson(`https://statsapi.mlb.com/api/v1/people/search?names=${searchName}&active=true`, 8000);
      const hit = sr?.people?.find(p => p.fullName?.toLowerCase().includes(batter.player.toLowerCase().split(" ")[0]) || p.fullName === batter.player);
      if (hit) personId = hit.id;
    } catch {}

    if (personId) {
      person = await fetchPerson(personId);
    }

    const birthDate = person?.birthDate ?? null;
    const jerseyNum = person?.primaryNumber ? parseInt(person.primaryNumber, 10) : null;
    const missingData = [];
    if (!birthDate) missingData.push("birthDate");
    if (jerseyNum == null) missingData.push("jersey");

    // Build numerology fields
    const jerseyReduced = jerseyNum != null ? reduce(jerseyNum) : null;

    // Batting order from schedule if available, else from data
    const rosterEntry = scheduleRoster.find(r => r.id === personId);
    const battingOrder = rosterEntry?.order ?? null;
    const lineupStatus = rosterEntry ? "projected" : "unknown";

    // Personal cycles
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
      jerseyReduced, battingOrder,
      personalDay: pdResult, lifePath: lpNum, birthDayNum,
      expressionNum: exprNum,
    };

    // Score
    const { signals, positiveTotal, countercurrentTotal, convergenceBonus, numerologyScore } = scorePlayerForNumerology(playerNumerology, dailyProfile);
    const bbScore = baseballScore(batter, mlbData);
    const finalScore = Math.round(W.numerologyWeight * numerologyScore + W.baseballWeight * bbScore);

    candidates.push({
      playerName: batter.player,
      team: batter.team,
      opponent: batter.opponent,
      opposingPitcher: batter.opposingPitcher,
      personId,
      birthDate,
      jerseyNumber: jerseyNum,
      battingOrder,
      lineupStatus,
      recommendedMarket: batter.hrScore > 65 ? "Home run" : "To record a hit",
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

  // Rank all candidates
  candidates.sort((a, b) => b.finalScore - a.finalScore);
  candidates.forEach((c, i) => { c.rank = i + 1; });

  const featured = candidates.filter(c => c.finalScore >= 60).slice(0, 5);
  const watchlist = candidates.filter(c => c.finalScore < 60 && c.finalScore >= 45).slice(0, 6);
  const countercurrents = candidates.filter(c => c.countercurrentTotal > 0 && c.numerologyScore < 40).slice(0, 3);

  console.log(`[numerology] Scored ${candidates.length} candidates. Featured: ${featured.length}, Watchlist: ${watchlist.length}`);

  // Step 4: Grok narratives
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const narratives = await callGrokForNarratives([...featured, ...watchlist.slice(0,3)], dailyProfile, apiKey);
  const narrativeSource = narratives ? "grok" : "fallback";

  // Merge narratives
  function getNarrative(rank) {
    if (!narratives) return { summary: "Strong numerical overlap with today's primary current.", primaryPatternLabel: null, countercurrentExplanation: null, marketExplanation: null };
    return narratives.players?.find(p => p.rank === rank) ?? {};
  }

  // Build output
  const output = {
    date: slateDate,
    timezone: "America/New_York",
    methodologyVersion: METHODOLOGY_VERSION,
    scheduledFor: SCHEDULED_FOR,
    generatedAt: new Date().toISOString(),
    generationMode: IS_DRY_RUN ? "dry_run" : USE_FIXTURE ? "fixture" : "live",
    narrativeSource,
    dataStatus: batters.length === 0 ? "unavailable" : scheduleRoster.length > 0 ? "morning_projected" : "morning_projected",
    dailyProfile: {
      universalDayRawSum: dailyProfile.universalDay.rawSum,
      universalDayCompound: dailyProfile.universalDay.compound,
      universalDayMaster: dailyProfile.universalDay.master,
      universalDayRoot: dailyProfile.universalDay.root,
      universalDayTrace: dailyProfile.universalDay.trace,
      calendarDayCompound: dailyProfile.calendarDay.original,
      calendarDayRoot: dailyProfile.calendarDay.root,
      universalYear: dailyProfile.universalYear.root,
      universalMonth: dailyProfile.universalMonth.root,
      structuralEcho: `${dailyProfile.structuralEcho.compound}/${dailyProfile.structuralEcho.root}`,
      primaryFamily: dailyProfile.primaryFamily,
      secondaryFamily: dailyProfile.secondaryFamily,
      balancingComplement: dailyProfile.balancingComplement,
      countercurrent: dailyProfile.countercurrent,
      repeatedDigits: dailyProfile.repeatedDigits,
      interpretation: narratives?.dailyInterpretation ?? `Universal Day ${dailyProfile.universalDay.compound}${dailyProfile.universalDay.master ? `/${dailyProfile.universalDay.root}` : ""} — ${dailyProfile.primaryFamily.join("–")} family dominant. Countercurrent at ${dailyProfile.countercurrent}. Balancing complement at ${dailyProfile.balancingComplement}.`,
    },
    featuredPlays: featured.map(c => ({
      rank: c.rank,
      playerId: c.personId,
      playerName: c.playerName,
      team: c.team,
      opponent: c.opponent,
      opposingPitcher: c.opposingPitcher,
      lineupStatus: c.lineupStatus,
      battingOrder: c.battingOrder,
      jerseyNumber: c.jerseyNumber,
      recommendedMarket: c.recommendedMarket,
      odds: c.hrOdds ?? null,
      numerologyScore: c.numerologyScore,
      baseballScore: c.baseballScore,
      finalScore: c.finalScore,
      formula: `${Math.round(W.numerologyWeight*100)}% × ${c.numerologyScore} + ${Math.round(W.baseballWeight*100)}% × ${c.baseballScore} = ${c.finalScore}`,
      confidence: c.finalScore >= 75 ? "high" : c.finalScore >= 60 ? "medium" : "low",
      positiveSignals: c.signals.filter(s=>s.points>0),
      counterSignals: c.signals.filter(s=>s.points<0),
      missingData: c.missingData,
      ...getNarrative(c.rank),
    })),
    watchlist: watchlist.map(c => ({
      rank: c.rank,
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
      primarySignal: c.signals.filter(s=>s.points>0)[0]?.label ?? null,
      missingData: c.missingData,
      summary: getNarrative(c.rank).summary ?? null,
    })),
    countercurrents: countercurrents.map(c => ({
      playerName: c.playerName,
      team: c.team,
      numerologyScore: c.numerologyScore,
      baseballScore: c.baseballScore,
      finalScore: c.finalScore,
      countercurrentSignals: c.signals.filter(s=>s.points<0),
    })),
    scoringConfiguration: { weights: W, methodologyVersion: METHODOLOGY_VERSION },
    sources: { hrPropsRaw: existsSync(path.join(DATA_DIR,"hr-props-raw.json")) ? "loaded" : "missing", mlbStatsApi: "used", grok: apiKey ? "used" : "skipped" },
    narrative: { closingObservation: narratives?.closingObservation ?? "Patterns are documented, not guaranteed." },
  };

  if (IS_DRY_RUN) {
    console.log("[numerology] DRY RUN — not writing files");
    console.log(JSON.stringify(output, null, 2).slice(0, 2000));
    return;
  }

  // Write atomically: temp → validate → rename
  const tempPath = DAILY_OUTPUT + ".tmp";
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  writeFileSync(tempPath, JSON.stringify(output, null, 2) + "\n");

  // Basic validation before publishing
  const check = JSON.parse(readFileSync(tempPath, "utf8"));
  if (!check.date || check.date !== slateDate) throw new Error("Validation: date mismatch");
  if (check.methodologyVersion !== METHODOLOGY_VERSION) throw new Error("Validation: version mismatch");
  if (!check.dailyProfile?.universalDayRoot) throw new Error("Validation: missing universalDayRoot");

  writeFileSync(DAILY_OUTPUT, JSON.stringify(output, null, 2) + "\n");
  const archivePath = path.join(ARCHIVE_DIR, `${slateDate}.json`);
  if (!existsSync(archivePath)) {
    writeFileSync(archivePath, JSON.stringify(output, null, 2) + "\n");
    console.log(`[numerology] Archived: ${archivePath}`);
  }
  console.log(`[numerology] ✓ Written: ${DAILY_OUTPUT}`);
  console.log(`[numerology] Scored ${candidates.length} players | Featured: ${featured.length} | Narrative: ${narrativeSource}`);
}

main().catch(err => {
  console.error("[numerology] Fatal:", err.message);
  process.exit(1);
});
