import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const RAW_OUTPUT_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const SHADOW_PATH = path.join(DATA_DIR, "k-workload-shadow.json");
const LEGACY_SCRIPT = path.join(ROOT, "scripts", "generate-mlb-hr-props.mjs");

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function team(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function getKProjectionMode(env = process.env) {
  const requested = String(env.MLB_K_PROJECTION_MODE ?? "legacy").trim().toLowerCase();
  return ["legacy", "shadow", "official"].includes(requested) ? requested : "legacy";
}

function loadShadow(targetDate) {
  const unavailable = (reason) => ({ available: false, reason, byPitcherId: new Map(), byGameTeam: new Map() });
  if (!existsSync(SHADOW_PATH)) return unavailable("SHADOW_FILE_MISSING");
  try {
    const payload = JSON.parse(readFileSync(SHADOW_PATH, "utf8"));
    if (payload?.date !== targetDate) return unavailable("SHADOW_DATE_MISMATCH");
    if (!Array.isArray(payload?.pitchers)) return unavailable("SHADOW_PITCHERS_MISSING");
    const byPitcherId = new Map();
    const byGameTeam = new Map();
    for (const row of payload.pitchers) {
      const id = number(row.pitcherId);
      if (id != null) byPitcherId.set(String(id), row);
      if (row.gameKey && row.team) byGameTeam.set(`${row.gameKey}|${team(row.team)}`, row);
    }
    return { available: true, reason: null, payload, byPitcherId, byGameTeam };
  } catch {
    return unavailable("SHADOW_FILE_INVALID");
  }
}

function findShadowRow(shadow, pitcher) {
  const id = number(pitcher.pitcherId);
  if (id != null && shadow.byPitcherId.has(String(id))) return shadow.byPitcherId.get(String(id));
  return shadow.byGameTeam.get(`${pitcher.gameKey}|${team(pitcher.team)}`) ?? null;
}

function candidateFromShadow(row) {
  if (!row) return null;
  const role = ["starter", "opener", "reliever"].includes(row.role) ? row.role : "starter";
  const expectedBF = number(row.projection?.expectedBF);
  const expectedIP = number(row.projection?.expectedInnings);
  const workloadKs = number(row.projection?.workloadOnlyProjectedKs);
  const adjustedRate = number(row.projection?.teamAdjustedKRate);
  const fullKs = number(row.projection?.fullShadowProjectedKs)
    ?? (expectedBF != null && adjustedRate != null ? expectedBF * adjustedRate : null);
  const confidenceGrade = row.confidence?.grade ?? null;
  const confidenceScore = number(row.confidence?.score);
  const confidenceEligible = row.confidence?.publicEligible === true
    || (row.confidence?.publicEligible == null && ["A", "B"].includes(confidenceGrade));

  const roleBounds = role === "reliever"
    ? { bfMin: 2, bfMax: 10, ipMin: 0.1, ipMax: 3, ksMax: 5 }
    : role === "opener"
      ? { bfMin: 4, bfMax: 14, ipMin: 0.7, ipMax: 4, ksMax: 7 }
      : { bfMin: 10, bfMax: 30, ipMin: 3, ipMax: 9, ksMax: 15 };

  const eligible = row.workloadFetchOk !== false
    && confidenceEligible
    && expectedBF != null && expectedBF >= roleBounds.bfMin && expectedBF <= roleBounds.bfMax
    && expectedIP != null && expectedIP >= roleBounds.ipMin && expectedIP <= roleBounds.ipMax
    && adjustedRate != null && adjustedRate >= 0.12 && adjustedRate <= 0.38
    && fullKs != null && fullKs >= 0 && fullKs <= roleBounds.ksMax;
  const projectedIP = expectedIP == null ? null : round(expectedIP, 1);
  const projectedKs = fullKs == null ? null : round(fullKs, 1);
  const projectedK9 = projectedIP != null && projectedIP > 0 && projectedKs != null
    ? round((projectedKs / projectedIP) * 9, 1)
    : null;
  return {
    eligible,
    role,
    projectedIP,
    projectedK9,
    projectedKs,
    expectedBF: round(expectedBF, 2),
    workloadOnlyProjectedKs: round(workloadKs, 2),
    teamAdjustedKRate: round(adjustedRate, 4),
    confidenceGrade,
    confidenceScore: round(confidenceScore, 3),
    flags: Array.isArray(row.flags) ? row.flags : [],
  };
}

export function applyKProjectionMode(payload, shadow, mode = getKProjectionMode()) {
  const pitchers = Array.isArray(payload?.pitchers) ? payload.pitchers : [];
  const updated = pitchers.map((pitcher) => {
    const legacyProjectedIP = number(pitcher.projectedIP);
    const legacyProjectedK9 = number(pitcher.projectedK9);
    const legacyProjectedKs = number(pitcher.projectedKs);
    const shadowRow = shadow.available ? findShadowRow(shadow, pitcher) : null;
    const candidate = candidateFromShadow(shadowRow);
    const useCandidate = mode === "official" && candidate?.eligible === true;
    const finalProjectedIP = useCandidate ? candidate.projectedIP : legacyProjectedIP;
    const finalProjectedK9 = useCandidate ? candidate.projectedK9 : legacyProjectedK9;
    const finalProjectedKs = useCandidate ? candidate.projectedKs : legacyProjectedKs;
    const fallbackReason = mode === "legacy"
      ? "MODE_LEGACY"
      : mode === "shadow"
        ? "MODE_SHADOW_COMPARISON"
        : candidate?.eligible
          ? null
          : shadow.reason ?? (shadowRow ? "SHADOW_PROJECTION_INELIGIBLE" : "SHADOW_ROW_MISSING");
    const kLine = number(pitcher.kLine);
    const kAdjustment = kLine != null && finalProjectedKs != null
      ? round((finalProjectedKs - kLine) * 5, 0)
      : 0;

    return {
      ...pitcher,
      projectedIP: finalProjectedIP,
      projectedK9: finalProjectedK9,
      projectedKs: finalProjectedKs,
      kAdjustment,
      projectionSource: useCandidate ? "workload-team" : "legacy",
      projectionFallbackReason: fallbackReason,
      kProjectionMode: mode,
      workloadRole: candidate?.role ?? null,
      legacyProjectedIP,
      legacyProjectedK9,
      legacyProjectedKs,
      candidateProjectedIP: candidate?.projectedIP ?? null,
      candidateProjectedK9: candidate?.projectedK9 ?? null,
      candidateProjectedKs: candidate?.projectedKs ?? null,
      workloadExpectedBF: candidate?.expectedBF ?? null,
      workloadOnlyProjectedKs: candidate?.workloadOnlyProjectedKs ?? null,
      teamAdjustedKRate: candidate?.teamAdjustedKRate ?? null,
      teamAdjustedProjectedKs: candidate?.projectedKs ?? null,
      workloadConfidenceGrade: candidate?.confidenceGrade ?? null,
      workloadConfidenceScore: candidate?.confidenceScore ?? null,
      workloadFlags: candidate?.flags ?? [],
    };
  });

  return {
    ...payload,
    kProjectionMode: mode,
    kProjectionModelVersion: "workload-team-k-v2",
    pitchers: updated,
  };
}

export function postProcessLiveKProjection() {
  if (!existsSync(RAW_OUTPUT_PATH)) throw new Error(`Missing generated payload: ${RAW_OUTPUT_PATH}`);
  const payload = JSON.parse(readFileSync(RAW_OUTPUT_PATH, "utf8"));
  const mode = getKProjectionMode();
  const shadow = loadShadow(payload.date);
  const updated = applyKProjectionMode(payload, shadow, mode);
  writeFileSync(RAW_OUTPUT_PATH, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  const officialCount = updated.pitchers.filter((row) => row.projectionSource === "workload-team").length;
  console.log(`[k-projection] mode=${mode}, shadowAvailable=${shadow.available}, officialRows=${officialCount}, totalRows=${updated.pitchers.length}`);
  return updated;
}

export function main(argv = process.argv.slice(2)) {
  const result = spawnSync(process.execPath, [LEGACY_SCRIPT, ...argv], {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return null;
  }
  return postProcessLiveKProjection();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`[k-projection] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
