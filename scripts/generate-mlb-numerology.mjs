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
const SCHEDULED_FOR = "04:44 America/New_York (morning) / lineup-confirmed before first game";
const TIMEOUT_MS = 30000;

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes("--dry-run");
const USE_FIXTURE = args.includes("--fixture");
const DATE_ARG = (() => { const i = args.indexOf("--date"); return i >= 0 ? args[i + 1] : null; })();
const PHASE_ARG = (() => {
  const i = args.indexOf("--phase");
  const v = i >= 0 ? args[i + 1] : null;
  const valid = ["morning", "lineup-confirmed", "force-refresh"];
  if (v && !valid.includes(v)) throw new Error(`Invalid --phase "${v}". Valid: ${valid.join(", ")}`);
  return v ?? "morning";
})();

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

// Tier classification for each field
const TIER1_FIELDS = new Set(["personalDay", "lifePath", "birthDay", "expression"]);
const TIER2_FIELDS = new Set(["age", "jersey"]);
function getFieldTier(field) {
  if (TIER1_FIELDS.has(field)) return 1;
  if (TIER2_FIELDS.has(field)) return 2;
  return 3;
}

// Diminishing returns schedule for indirect signals (1st→100%, 2nd→70%, 3rd→40%, 4th+→20%)
const INDIRECT_DECAY = [1.0, 0.7, 0.4, 0.2];

function scorePlayerForNumerology(playerProfile, dailyProfile, missingData = []) {
  const ud = dailyProfile.universalDay;
  const rawSignals = [];
  const awarded = new Set();

  // isDirect=true means exact compound match to UD (never decayed)
  function awardRaw(field, label, type, rawPoints, description, key, isDirect) {
    if (awarded.has(key) || rawPoints === 0) return;
    awarded.add(key);
    rawSignals.push({ field, label, type, rawPoints, description, isDirect, tier: getFieldTier(field) });
  }

  // ── Personal Day (Tier1) ──────────────────────────────────────────────────
  const pd = playerProfile.personalDay;
  if (pd) {
    if (ud.master != null && (pd.compound === ud.master || pd.master === ud.master)) {
      awardRaw("personalDay", `Personal Day ${pd.compound}/${pd.root} — Master Match`, "primary_exact_master", W.personalDayExactMaster, `Personal Day matches Universal Day master ${ud.master}.`, "pd:master", true);
    } else if (pd.original === ud.rawSum || pd.compound === ud.rawSum) {
      awardRaw("personalDay", `Personal Day ${pd.original}/${pd.root} — Exact Target`, "primary_exact_root", W.personalDayExact, `Personal Day ${pd.original} matches Universal Day ${ud.rawSum}.`, "pd:exact", true);
    } else if (pd.root === ud.root) {
      awardRaw("personalDay", `Personal Day ${pd.original}/${pd.root} — Root Match`, "personal_cycle", W.personalDayRoot, `Personal Day root ${pd.root} matches Universal Day root.`, "pd:root", false);
    } else if (pd.root === dailyProfile.countercurrent) {
      awardRaw("personalDay", `Personal Day — Countercurrent`, "countercurrent", -(W.countercurrentHighField ?? 7), `Personal Day root ${pd.root} is the countercurrent.`, "pd:counter", false);
    }
  }

  // ── Life Path (Tier1) — exact compound check added before root check ───────
  const lp = playerProfile.lifePath;
  if (lp) {
    if (ud.master != null && (lp.compound === ud.master || lp.master === ud.master)) {
      awardRaw("lifePath", `Life Path ${lp.compound} — Master Match`, "primary_exact_master", W.lifePathExactMaster, `Life Path matches Universal Day master.`, "lp:master", true);
    } else if (lp.original === ud.rawSum || lp.compound === ud.rawSum) {
      awardRaw("lifePath", `Life Path ${lp.original}/${lp.root} — Exact Target`, "primary_exact_root", W.lifePathExact, `Life Path ${lp.original} exactly matches Universal Day ${ud.rawSum}.`, "lp:exact", true);
    } else if (lp.root === ud.root) {
      awardRaw("lifePath", `Life Path ${lp.compound}/${lp.root} — Root Match`, "primary_root", W.lifePathRoot, `Life Path ${lp.compound} root ${lp.root} matches Universal Day root.`, "lp:root", false);
    } else if (lp.root === dailyProfile.countercurrent) {
      awardRaw("lifePath", `Life Path — Countercurrent`, "countercurrent", -(W.countercurrentHighField ?? 7), `Life Path root ${lp.root} is countercurrent.`, "lp:counter", false);
    }
  }

  // ── Birth Day (Tier1) ─────────────────────────────────────────────────────
  const bd = playerProfile.birthDayNum;
  if (bd) {
    if (ud.master != null && (bd.compound === ud.master || bd.original === ud.master)) {
      awardRaw("birthDay", `Birth Day ${bd.original} — Master Match`, "primary_exact_master", W.birthDayExactMaster ?? 24, `Birth day matches Universal Day master.`, "bd:master", true);
    } else if (bd.original === ud.rawSum || bd.compound === ud.rawSum) {
      awardRaw("birthDay", `Birth Day ${bd.original} — Exact Target`, "primary_exact_root", W.birthDayExact, `Birth day exactly matches Universal Day ${ud.rawSum}.`, "bd:exactTarget", true);
    } else if (bd.original === dailyProfile.calendarDay.original) {
      awardRaw("birthDay", `Birth Day ${bd.original} — Calendar Day Exact`, "secondary_exact", W.calendarDayExactCompound, `Birth day matches Calendar Day ${dailyProfile.calendarDay.original}.`, "bd:calexact", false);
    } else if (bd.root === ud.root) {
      awardRaw("birthDay", `Birth Day ${bd.original}/${bd.root} — Reduces to Target`, "primary_root", W.birthDayRoot, `Birth day root ${bd.root} reduces to Universal Day root.`, "bd:root", false);
    } else if (dailyProfile.primaryFamily.includes(bd.root) && bd.root !== dailyProfile.countercurrent) {
      awardRaw("birthDay", `Birth Day ${bd.original}/${bd.root} — Primary Family`, "family_support", W.primaryFamilyMatchTier1 ?? W.primaryFamilyMatch, `Birth day root ${bd.root} is in primary family.`, "bd:family", false);
    }
  }

  // ── Expression (Tier1) ────────────────────────────────────────────────────
  const expr = playerProfile.expressionNum;
  if (expr) {
    if (ud.master != null && (expr.compound === ud.master || expr.original === ud.master)) {
      awardRaw("expression", `Expression ${expr.compound}/${expr.root} — Master Match`, "primary_exact_master", W.jerseyExactMaster ?? 24, `Expression matches Universal Day master.`, "expr:master", true);
    } else if (expr.original === ud.rawSum || expr.compound === ud.rawSum) {
      awardRaw("expression", `Expression ${expr.compound} — Exact Target`, "primary_exact_root", W.expressionExact, `Expression ${expr.compound} matches Universal Day ${ud.rawSum}.`, "expr:exact", true);
    } else if (expr.root === ud.root) {
      awardRaw("expression", `Expression ${expr.compound}/${expr.root} — Reduces to Target`, "name_resonance", W.expressionRoot, `Name Expression root reduces to Universal Day root.`, "expr:root", false);
    }
  }

  // ── Jersey (Tier2) ────────────────────────────────────────────────────────
  const j = playerProfile.jerseyReduced;
  if (j) {
    if (ud.master != null && (j.compound === ud.master || j.original === ud.master)) {
      awardRaw("jersey", `Jersey ${j.original} — Exact Master`, "primary_exact_master", W.jerseyExactMaster, `Jersey ${j.original} matches Universal Day master.`, "jersey:master", true);
    } else if (j.original === dailyProfile.calendarDay.original) {
      awardRaw("jersey", `Jersey ${j.original} — Calendar Day Exact`, "secondary_exact", W.calendarDayExactCompound, `Jersey ${j.original} equals Calendar Day ${dailyProfile.calendarDay.original}.`, "jersey:calexact", false);
    } else if (j.original === ud.rawSum) {
      awardRaw("jersey", `Jersey ${j.original} — Exact Target`, "primary_exact_root", W.jerseyExact, `Jersey ${j.original} matches Universal Day ${ud.rawSum}.`, "jersey:udexact", true);
    } else if (j.root === ud.root) {
      awardRaw("jersey", `Jersey ${j.original}/${j.root} — Root Match`, "primary_root", W.jerseyRoot, `Jersey ${j.original} reduces to ${j.root}.`, "jersey:root", false);
    } else if (j.root === dailyProfile.calendarDay.root && j.root !== ud.root) {
      awardRaw("jersey", `Jersey ${j.original}/${j.root} — Secondary Root`, "secondary_root", W.calendarDayRoot, `Jersey root ${j.root} matches Calendar Day root.`, "jersey:secroot", false);
    } else if (j.root === dailyProfile.countercurrent) {
      awardRaw("jersey", `Jersey ${j.original} — Countercurrent`, "countercurrent", -(W.countercurrentTier2 ?? 5), `Jersey root is countercurrent.`, "jersey:counter", false);
    } else if (dailyProfile.primaryFamily.includes(j.root)) {
      awardRaw("jersey", `Jersey root ${j.root} — Primary Family`, "family_support", W.primaryFamilyMatch, `Jersey root belongs to family [${dailyProfile.primaryFamily.join("–")}].`, "jersey:primfam", false);
    } else if (dailyProfile.secondaryFamily.includes(j.root)) {
      awardRaw("jersey", `Jersey root ${j.root} — Secondary Family`, "family_support", W.secondaryFamilyMatch, `Jersey root belongs to secondary family.`, "jersey:secfam", false);
    }
  }

  // ── Age (Tier2) ───────────────────────────────────────────────────────────
  const age = playerProfile.age;
  if (age != null) {
    const ageR = reduce(age);
    if (ud.master != null && (ageR.original === ud.master || ageR.compound === ud.master)) {
      awardRaw("age", `Age ${age} — Master Match`, "primary_exact_master", W.ageExactMaster ?? 24, `Age ${age} matches Universal Day master.`, "age:master", true);
    } else if (ageR.original === ud.rawSum || ageR.compound === ud.rawSum) {
      awardRaw("age", `Age ${age} — Exact Target`, "primary_exact_root", W.ageExact, `Age ${age} matches Universal Day ${ud.rawSum}.`, "age:exact", true);
    } else if (ageR.root === ud.root) {
      awardRaw("age", `Age ${age} root ${ageR.root} — Reduces to Target`, "primary_root", W.ageRoot, `Age ${age} reduces to root ${ageR.root}.`, "age:root", false);
    }
  }

  // ── Batting order (Tier3) ─────────────────────────────────────────────────
  const bo = playerProfile.battingOrder;
  if (bo != null && bo >= 1 && bo <= 9) {
    if (bo === ud.root) {
      awardRaw("battingOrder", `Batting ${bo} — Exact Root Match`, "primary_exact_root", W.battingOrderExactRoot, `Batting ${bo} exactly matches Universal Day root.`, "bo:exact", false);
    } else if (dailyProfile.primaryFamily.includes(bo)) {
      awardRaw("battingOrder", `Batting ${bo} — Primary Family`, "family_support", W.primaryFamilyMatch, `Batting ${bo} belongs to primary family.`, "bo:primfam", false);
    } else if (dailyProfile.secondaryFamily.includes(bo)) {
      awardRaw("battingOrder", `Batting ${bo} — Secondary Family`, "family_support", W.secondaryFamilyMatch, `Batting ${bo} belongs to secondary family.`, "bo:secfam", false);
    }
  }

  // ── Repeated digits (Tier3) ───────────────────────────────────────────────
  for (const rep of dailyProfile.repeatedDigits) {
    const jerseyMatch = j?.root === rep.digit || j?.original === rep.digit;
    const boMatch = bo === rep.digit;
    if ((jerseyMatch || boMatch) && rep.reinforces === "primary") {
      awardRaw("repeatedDigit", `Date digit ${rep.digit} (×${rep.count}) — Contextual Echo`, "contextual_echo", W.repeatedDateDigit, `Digit ${rep.digit} repeats ${rep.count}× in today's date.`, `rep:${rep.digit}`, false);
    }
  }

  // ── Separate direct vs indirect vs countercurrent ─────────────────────────
  const directPositive = rawSignals.filter(s => s.isDirect && s.rawPoints > 0);
  const indirectPositive = rawSignals.filter(s => !s.isDirect && s.rawPoints > 0);
  const negativeRaw = rawSignals.filter(s => s.rawPoints < 0);

  // Sort indirect by tier asc → rawPoints desc → field alpha (deterministic decay order)
  const sortedIndirect = [...indirectPositive].sort((a, b) =>
    a.tier - b.tier || b.rawPoints - a.rawPoints || a.field.localeCompare(b.field)
  );

  const finalSignals = [];

  // Direct signals: no decay, always full weight
  for (const s of directPositive) {
    finalSignals.push({ field: s.field, label: s.label, type: s.type, points: s.rawPoints, description: s.description, rawPoints: s.rawPoints, fieldTier: s.tier });
  }

  // Indirect signals: apply diminishing returns schedule
  for (let i = 0; i < sortedIndirect.length; i++) {
    const s = sortedIndirect[i];
    const multiplier = INDIRECT_DECAY[Math.min(i, INDIRECT_DECAY.length - 1)];
    const adjusted = Math.max(1, Math.round(s.rawPoints * multiplier));
    finalSignals.push({ field: s.field, label: s.label, type: s.type, points: adjusted, description: s.description, rawPoints: s.rawPoints, indirectMultiplier: multiplier, fieldTier: s.tier });
  }

  // Countercurrent signals: no decay
  for (const s of negativeRaw) {
    finalSignals.push({ field: s.field, label: s.label, type: s.type, points: s.rawPoints, description: s.description });
  }

  // Multiple independent countercurrent penalty (Issue #8)
  if (negativeRaw.length >= 2) {
    const penalty = -(W.countercurrentMultiple * (negativeRaw.length - 1));
    finalSignals.push({ field: "multiCountercurrent", label: `${negativeRaw.length} independent countercurrents`, type: "countercurrent", points: penalty, description: `Multiple independent countercurrent signals compound: ${negativeRaw.map(s=>s.field).join(", ")}.` });
  }

  // ── Compute totals ─────────────────────────────────────────────────────────
  const pos = finalSignals.filter(s => s.points > 0);
  const neg = finalSignals.filter(s => s.points < 0);
  const positiveTotal = pos.reduce((a, s) => a + s.points, 0);
  const countercurrentTotal = Math.abs(neg.reduce((a, s) => a + s.points, 0));

  // ── Synergy bonus — rewards true exact compound alignment ─────────────────
  const tier1ExactFields = new Set(directPositive.filter(s => s.tier === 1).map(s => s.field));
  const tier1IndirectFields = new Set(indirectPositive.filter(s => s.tier === 1).map(s => s.field));
  let exactComboBonus = 0;
  if (tier1ExactFields.size >= 2) {
    exactComboBonus = W.synergyDoubleExactTier1 ?? 12;
    if (tier1ExactFields.size >= 3) exactComboBonus += W.synergyTripleExactTier1 ?? 6;
  } else if (tier1ExactFields.size === 1 && tier1IndirectFields.size >= 1) {
    exactComboBonus = W.synergyExactPlusRootTier1 ?? 4;
  }

  const normCeiling = W.normCeiling ?? 76;
  const convergenceBonus = 0;
  const rawNumerology = Math.max(0, positiveTotal - countercurrentTotal + exactComboBonus);
  const numerologyScore = Math.min(100, Math.round((rawNumerology / normCeiling) * 100));
  return { signals: finalSignals, positiveTotal, countercurrentTotal, convergenceBonus, exactComboBonus, numerologyScore, normCeiling };
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
  if (!Array.isArray(output.exactNumberMatches) || !Array.isArray(output.rootNumberMatches)) {
    errors.push("Missing complete daily number-match lists");
  }
  for (const player of output.exactNumberMatches ?? []) {
    if (!player.matches?.length) errors.push(`Exact match missing reason: ${player.playerName}`);
  }

  if (errors.length > 0) throw new Error(`Output validation failed:\n  ${errors.join("\n  ")}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const generationStartedAt = new Date().toISOString();
  const slateDate = DATE_ARG ?? getEtDate();
  const [yearStr, monthStr, dayStr] = slateDate.split("-");
  const calMonth = parseInt(monthStr, 10);
  const calDay = parseInt(dayStr, 10);

  console.log(`[numerology] date=${slateDate} dry-run=${IS_DRY_RUN} fixture=${USE_FIXTURE} phase=${PHASE_ARG}`);
  console.log(`[numerology] generationStartedAt=${generationStartedAt}`);

  // Load existing daily output to preserve phase timestamps across runs
  let existingOutput = null;
  if (!IS_DRY_RUN && !USE_FIXTURE && existsSync(DAILY_OUTPUT)) {
    try { existingOutput = JSON.parse(readFileSync(DAILY_OUTPUT, "utf8")); } catch { /* ignore */ }
  }
  const morningGeneratedAt = PHASE_ARG === "morning" || PHASE_ARG === "force-refresh"
    ? generationStartedAt
    : (existingOutput?.date === slateDate ? (existingOutput?.morningGeneratedAt ?? null) : null);
  const lineupConfirmedGeneratedAt = PHASE_ARG === "lineup-confirmed"
    ? generationStartedAt
    : (existingOutput?.date === slateDate ? (existingOutput?.lineupConfirmedGeneratedAt ?? null) : null);

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
  const candidatePoolType = "game_team_40_man_rosters_with_jkb_context";
  let eligiblePlayerCount = batters.length;

  if (batters.length === 0) {
    console.warn("[numerology] No batters in MLB data");
  }

  // Step 3: Schedule lineups plus every active hitter on today's teams.
  // The old candidate pool only contained the projected nine-man lineups, which
  // could hide an exact jersey-number match such as a bench catcher wearing #23.
  let scheduleRoster = [];
  let lineupDataAsOf = null;
  const activeRosterProfiles = new Map();
  const isPreLineupTime = new Date().getUTCHours() < 16; // before noon ET roughly

  try {
    const [sched, teamDirectory] = await Promise.all([
      fetchJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${slateDate}&hydrate=probablePitcher,lineups`),
      fetchJson("https://statsapi.mlb.com/api/v1/teams?sportId=1"),
    ]);
    const games = sched?.dates?.[0]?.games ?? [];
    const abbreviationById = new Map((teamDirectory?.teams ?? []).map(team => [team.id, team.abbreviation]));
    const teamContexts = new Map();
    lineupDataAsOf = new Date().toISOString();

    for (const g of games) {
      const away = g?.teams?.away?.team ?? {};
      const home = g?.teams?.home?.team ?? {};
      const awayAbbr = abbreviationById.get(away.id) ?? away.abbreviation ?? away.teamCode?.toUpperCase();
      const homeAbbr = abbreviationById.get(home.id) ?? home.abbreviation ?? home.teamCode?.toUpperCase();
      if (away.id && awayAbbr) teamContexts.set(away.id, { team: awayAbbr, opponent: homeAbbr ?? "TBD" });
      if (home.id && homeAbbr) teamContexts.set(home.id, { team: homeAbbr, opponent: awayAbbr ?? "TBD" });

      const awayLineup = g.lineups?.awayPlayers ?? [];
      const homeLineup = g.lineups?.homePlayers ?? [];
      for (const player of [...awayLineup, ...homeLineup]) {
        if (player.id) {
          const pos = normalizeBattingOrder(player.battingOrder);
          scheduleRoster.push({ id: player.id, battingOrder: pos, teamId: player.team?.id });
        }
      }
    }

    const rosterResults = await Promise.allSettled(
      [...teamContexts.entries()].map(async ([teamId, context]) => {
        const roster = await fetchJson(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=40Man&hydrate=person`);
        return { context, roster: roster?.roster ?? [] };
      }),
    );

    for (const result of rosterResults) {
      if (result.status !== "fulfilled") continue;
      const { context, roster } = result.value;
      for (const entry of roster) {
        const person = entry.person ?? {};
        const position = entry.position ?? person.primaryPosition ?? {};
        const isPitcherOnly = position.type === "Pitcher" || position.abbreviation === "P";
        if (isPitcherOnly || !person.id || !person.fullName) continue;
        const key = `${person.fullName}|${context.team}`;
        activeRosterProfiles.set(key, {
          mlbId: person.id,
          fullName: person.fullName,
          team: context.team,
          opponent: context.opponent,
          birthDate: person.birthDate ?? null,
          jerseyNumber: Number.isFinite(Number(entry.jerseyNumber ?? person.primaryNumber))
            ? Number(entry.jerseyNumber ?? person.primaryNumber)
            : null,
          position: position.abbreviation ?? null,
        });
      }
    }

    console.log(`[numerology] Schedule lineup: ${scheduleRoster.length} | Active hitters: ${activeRosterProfiles.size}`);
  } catch (e) {
    console.warn(`[numerology] Schedule/active roster fetch failed: ${e.message}`);
  }

  const candidateBatters = [...batters];
  const candidateKeys = new Set(candidateBatters.map(batter => `${batter.player}|${batter.team}`));
  for (const [key, profile] of activeRosterProfiles) {
    if (candidateKeys.has(key)) continue;
    candidateKeys.add(key);
    candidateBatters.push({
      player: profile.fullName,
      playerId: profile.mlbId,
      team: profile.team,
      opponent: profile.opponent,
      opposingPitcher: "TBD",
      hrScore: null,
      hrOddsYes: null,
      candidateSource: "team_40_man_roster",
    });
  }

  eligiblePlayerCount = candidateBatters.length;

  // Step 4: Score every active hitter. JKB model data remains optional context.
  const candidates = [];
  const seen = new Set();
  const universalYearRoot = dailyProfile.universalYear.root;
  const exclusionReasons = [];

  function collectNumberMatches(profile) {
    const exact = [];
    const root = [];
    const target = dailyProfile.universalDay.rawSum;
    const targetRoot = dailyProfile.universalDay.root;

    const addExact = (field, value, label) => {
      if (value === target) exact.push({ field, value, label });
    };
    const addRoot = (field, reduced, label) => {
      if (!reduced || reduced.original === target) return;
      if (reduced.root === targetRoot) root.push({ field, value: reduced.original, root: reduced.root, label });
    };

    addExact("jersey", profile.jerseyNumber, `Jersey #${profile.jerseyNumber}`);
    addExact("age", profile.age, `Age ${profile.age}`);
    addExact("birthDay", profile.birthDayNum?.original, `Born on day ${profile.birthDayNum?.original}`);
    addExact("personalDay", profile.personalDay?.original, `Personal Day ${profile.personalDay?.original}`);
    addExact("lifePath", profile.lifePath?.original, `Life Path ${profile.lifePath?.original}`);
    addExact("expression", profile.expressionNum?.original, `Expression ${profile.expressionNum?.original}`);

    addRoot("jersey", profile.jerseyReduced, `Jersey #${profile.jerseyNumber} → ${targetRoot}`);
    addRoot("age", profile.ageReduced, `Age ${profile.age} → ${targetRoot}`);
    addRoot("birthDay", profile.birthDayNum, `Birth day ${profile.birthDayNum?.original} → ${targetRoot}`);
    addRoot("personalDay", profile.personalDay, `Personal Day ${profile.personalDay?.original} → ${targetRoot}`);
    addRoot("lifePath", profile.lifePath, `Life Path ${profile.lifePath?.original} → ${targetRoot}`);
    addRoot("expression", profile.expressionNum, `Expression ${profile.expressionNum?.original} → ${targetRoot}`);
    if (profile.battingOrder === targetRoot) {
      root.push({ field: "battingOrder", value: profile.battingOrder, root: targetRoot, label: `Batting #${profile.battingOrder}` });
    }

    return { exact, root };
  }

  for (const batter of candidateBatters) {
    const key = `${batter.player}|${batter.team}`;
    if (seen.has(key)) { exclusionReasons.push({ player: batter.player, reason: "duplicate" }); continue; }
    seen.add(key);

    // Look up from pre-built cache (Issue #3 — no sequential API calls)
    const rosterProfile = activeRosterProfiles.get(key);
    const cached = identityCache.get(key) ?? rosterProfile;
    const personId = cached?.mlbId ?? batter.playerId ?? null;
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
    const ageReduced = age != null ? reduce(age) : null;

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
      jerseyNumber: jerseyNum,
      jerseyReduced,
      battingOrder,
      age,
      ageReduced,
      personalDay: pdResult,
      lifePath: lpNum,
      birthDayNum,
      expressionNum: exprNum,
    };
    const numberMatches = collectNumberMatches(playerNumerology);

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
      exactNumberMatches: numberMatches.exact,
      rootNumberMatches: numberMatches.root,
      candidateSource: batter.candidateSource ?? "jkb_hr_props",
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
  const exactFieldPriority = { jersey: 0, personalDay: 1, lifePath: 2, birthDay: 3, age: 4, expression: 5 };
  const exactNumberMatches = candidates
    .filter(c => c.exactNumberMatches.length > 0)
    .sort((a, b) => {
      const aPriority = Math.min(...a.exactNumberMatches.map(match => exactFieldPriority[match.field] ?? 99));
      const bPriority = Math.min(...b.exactNumberMatches.map(match => exactFieldPriority[match.field] ?? 99));
      return aPriority - bPriority || b.exactNumberMatches.length - a.exactNumberMatches.length || b.numerologyScore - a.numerologyScore || a.playerName.localeCompare(b.playerName);
    });
  const rootNumberMatches = candidates
    .filter(c => c.exactNumberMatches.length === 0 && c.rootNumberMatches.length > 0)
    .sort((a, b) => b.rootNumberMatches.length - a.rootNumberMatches.length || b.numerologyScore - a.numerologyScore || a.playerName.localeCompare(b.playerName));
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
    updatePhase: PHASE_ARG,
    morningGeneratedAt: IS_DRY_RUN || USE_FIXTURE ? null : morningGeneratedAt,
    lineupConfirmedGeneratedAt: IS_DRY_RUN || USE_FIXTURE ? null : lineupConfirmedGeneratedAt,
    narrativeSource,
    rankingBasis: "numerology_only",
    baseballContextOnly: true,
    dataStatus: computeDataStatus(batters, scheduleRoster, confirmedCount),
    candidatePool: {
      candidatePoolType,
      description: "Every non-pitcher on the 40-man rosters of teams playing today; JoeKnowsBall HR scores are attached only when available.",
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
    exactNumberMatches: exactNumberMatches.map(c => ({
      playerId: c.personId ?? null,
      playerName: c.playerName,
      team: c.team,
      opponent: c.opponent,
      opposingPitcher: c.opposingPitcher,
      lineupStatus: c.lineupStatus,
      battingOrder: c.battingOrder,
      jerseyNumber: c.jerseyNumber,
      numerologyScore: c.numerologyScore,
      baseballScore: c.marketScore == null ? null : c.baseballScore,
      matches: c.exactNumberMatches,
      candidateSource: c.candidateSource,
      recommendedMarket: c.recommendedMarket,
      marketScore: c.marketScore,
    })),
    rootNumberMatches: rootNumberMatches.map(c => ({
      playerId: c.personId ?? null,
      playerName: c.playerName,
      team: c.team,
      opponent: c.opponent,
      opposingPitcher: c.opposingPitcher,
      lineupStatus: c.lineupStatus,
      battingOrder: c.battingOrder,
      jerseyNumber: c.jerseyNumber,
      numerologyScore: c.numerologyScore,
      baseballScore: c.marketScore == null ? null : c.baseballScore,
      matches: c.rootNumberMatches,
      candidateSource: c.candidateSource,
      recommendedMarket: c.recommendedMarket,
      marketScore: c.marketScore,
    })),
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
    // Always overwrite so the history file reflects the most recent generation (morning or lineup-confirmed).
    if (!USE_FIXTURE) {
      const archivePath = path.join(ARCHIVE_DIR, `${slateDate}.json`);
      writeFileSync(archivePath, JSON.stringify(output, null, 2) + "\n");
      console.log(`[numerology] Archived: ${archivePath}`);
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
