import { existsSync, readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Patch target not found: ${label}`);
  }
  return source.replace(search, replacement);
}

function patchGenerator() {
  const file = "scripts/generate-mlb-hr-props.mjs";
  let source = readFileSync(file, "utf8");

  source = replaceOnce(
    source,
    'const PITCHER_REGRESSION_PATH = path.join(DATA_DIR, "pitcher-regression.json");\n',
    `const PITCHER_REGRESSION_PATH = path.join(DATA_DIR, "pitcher-regression.json");
const K_WORKLOAD_SHADOW_PATH = path.join(DATA_DIR, "k-workload-shadow.json");
const requestedKProjectionMode = String(process.env.MLB_K_PROJECTION_MODE ?? "legacy").trim().toLowerCase();
const K_PROJECTION_MODE = ["legacy", "shadow", "official"].includes(requestedKProjectionMode)
  ? requestedKProjectionMode
  : "legacy";
`,
    "K rollout constants",
  );

  const projectionFunction = `function calculateProjectedKs(projectedIP, projectedK9) {
  return roundNumber((projectedIP * projectedK9) / 9, 1);
}
`;

  const integrationHelpers = `${projectionFunction}
function loadKWorkloadShadow(targetDate) {
  const unavailable = (reason, error = null) => ({
    available: false,
    reason,
    error,
    payload: null,
    byPitcherId: new Map(),
    byGameTeam: new Map(),
  });

  if (!existsSync(K_WORKLOAD_SHADOW_PATH)) return unavailable("SHADOW_FILE_MISSING");

  try {
    const payload = JSON.parse(readFileSync(K_WORKLOAD_SHADOW_PATH, "utf8"));
    if (payload?.date !== targetDate) return unavailable("SHADOW_DATE_MISMATCH");
    if (!Array.isArray(payload?.pitchers)) return unavailable("SHADOW_PITCHERS_MISSING");

    const byPitcherId = new Map();
    const byGameTeam = new Map();
    for (const row of payload.pitchers) {
      const pitcherId = toFiniteNumber(row.pitcherId);
      if (pitcherId != null) byPitcherId.set(String(pitcherId), row);
      if (row.gameKey && row.team) {
        byGameTeam.set(\`\${row.gameKey}|\${normalizeTeamCode(row.team)}\`, row);
      }
    }

    return { available: true, reason: null, error: null, payload, byPitcherId, byGameTeam };
  } catch (error) {
    return unavailable("SHADOW_FILE_INVALID", error instanceof Error ? error.message : String(error));
  }
}

function findKWorkloadShadowRow(shadowContext, pitcher) {
  if (!shadowContext.available) return null;
  const pitcherId = toFiniteNumber(pitcher.pitcherId);
  if (pitcherId != null) {
    const byId = shadowContext.byPitcherId.get(String(pitcherId));
    if (byId) return byId;
  }
  return shadowContext.byGameTeam.get(\`\${pitcher.gameKey}|\${normalizeTeamCode(pitcher.team)}\`) ?? null;
}

function resolveOfficialKProjection({ pitcher, shadowContext }) {
  const legacyProjectedIP = calculateProjectedInnings(pitcher);
  const legacyProjectedK9 = calculateProjectedK9(pitcher);
  const legacyProjectedKs = calculateProjectedKs(legacyProjectedIP, legacyProjectedK9);

  const legacy = (fallbackReason = null, candidate = null) => ({
    projectedIP: legacyProjectedIP,
    projectedK9: legacyProjectedK9,
    projectedKs: legacyProjectedKs,
    projectionSource: "legacy",
    projectionFallbackReason: fallbackReason,
    kProjectionMode: K_PROJECTION_MODE,
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
  });

  if (K_PROJECTION_MODE === "legacy") return legacy("MODE_LEGACY");

  const row = findKWorkloadShadowRow(shadowContext, pitcher);
  if (!row) return legacy(shadowContext.reason ?? "SHADOW_ROW_MISSING");

  const expectedBF = toFiniteNumber(row.projection?.expectedBF);
  const expectedInnings = toFiniteNumber(row.projection?.expectedInnings);
  const workloadOnlyProjectedKs = toFiniteNumber(row.projection?.workloadOnlyProjectedKs);
  const suppliedRate = toFiniteNumber(row.projection?.teamAdjustedKRate);
  const suppliedKs = toFiniteNumber(row.projection?.fullShadowProjectedKs);
  const teamAdjustedProjectedKs = suppliedKs ?? (
    expectedBF != null && suppliedRate != null ? expectedBF * suppliedRate : null
  );
  const teamAdjustedKRate = suppliedRate ?? (
    expectedBF != null && expectedBF > 0 && teamAdjustedProjectedKs != null
      ? teamAdjustedProjectedKs / expectedBF
      : null
  );
  const confidenceGrade = row.confidence?.grade ?? null;
  const confidenceScore = toFiniteNumber(row.confidence?.score);
  const confidenceEligible = row.confidence?.publicEligible === true
    || (row.confidence?.publicEligible == null && ["A", "B"].includes(confidenceGrade));

  const eligible = row.workloadFetchOk !== false
    && confidenceEligible
    && expectedBF != null && expectedBF >= 10 && expectedBF <= 30
    && expectedInnings != null && expectedInnings > 0 && expectedInnings <= 9
    && teamAdjustedKRate != null && teamAdjustedKRate >= 0.12 && teamAdjustedKRate <= 0.38
    && teamAdjustedProjectedKs != null && teamAdjustedProjectedKs >= 0 && teamAdjustedProjectedKs <= 15;

  const projectedIP = expectedInnings == null ? null : roundNumber(expectedInnings, 1);
  const projectedKs = teamAdjustedProjectedKs == null ? null : roundNumber(teamAdjustedProjectedKs, 1);
  const projectedK9 = projectedIP != null && projectedIP > 0 && projectedKs != null
    ? roundNumber((projectedKs / projectedIP) * 9, 1)
    : null;
  const candidate = {
    projectedIP,
    projectedK9,
    projectedKs,
    expectedBF: roundNumber(expectedBF, 2),
    workloadOnlyProjectedKs: roundNumber(workloadOnlyProjectedKs, 2),
    teamAdjustedKRate: roundNumber(teamAdjustedKRate, 4),
    confidenceGrade,
    confidenceScore: roundNumber(confidenceScore, 3),
    flags: Array.isArray(row.flags) ? row.flags : [],
  };

  if (!eligible) return legacy("SHADOW_PROJECTION_INELIGIBLE", candidate);
  if (K_PROJECTION_MODE === "shadow") return legacy("MODE_SHADOW_COMPARISON", candidate);

  return {
    projectedIP: candidate.projectedIP,
    projectedK9: candidate.projectedK9,
    projectedKs: candidate.projectedKs,
    projectionSource: "workload-team",
    projectionFallbackReason: null,
    kProjectionMode: K_PROJECTION_MODE,
    legacyProjectedIP,
    legacyProjectedK9,
    legacyProjectedKs,
    candidateProjectedIP: candidate.projectedIP,
    candidateProjectedK9: candidate.projectedK9,
    candidateProjectedKs: candidate.projectedKs,
    workloadExpectedBF: candidate.expectedBF,
    workloadOnlyProjectedKs: candidate.workloadOnlyProjectedKs,
    teamAdjustedKRate: candidate.teamAdjustedKRate,
    teamAdjustedProjectedKs: candidate.projectedKs,
    workloadConfidenceGrade: candidate.confidenceGrade,
    workloadConfidenceScore: candidate.confidenceScore,
    workloadFlags: candidate.flags,
  };
}
`;

  source = replaceOnce(source, projectionFunction, integrationHelpers, "live K projection helpers");

  source = replaceOnce(
    source,
    `  const schedule = await loadSchedule();
  if (!schedule.length) {
    throw new Error("MLB schedule returned zero games for today. Existing HR props files were preserved.");
  }

  const statcastBatters = await fetchStatcastBatterMap();
`,
    `  const schedule = await loadSchedule();
  if (!schedule.length) {
    throw new Error("MLB schedule returned zero games for today. Existing HR props files were preserved.");
  }

  const kWorkloadShadow = loadKWorkloadShadow(getTodayEt());
  console.log(\`[k-projection] mode=\${K_PROJECTION_MODE}, shadowAvailable=\${kWorkloadShadow.available}, reason=\${kWorkloadShadow.reason ?? "none"}\`);

  const statcastBatters = await fetchStatcastBatterMap();
`,
    "load shadow once",
  );

  source = replaceOnce(
    source,
    `    const projectedIP = calculateProjectedInnings(pitcher);
    const projectedK9 = calculateProjectedK9(pitcher);
    const projectedKs = calculateProjectedKs(projectedIP, projectedK9);
    const role = classifyPitcherRole(pitcher);
`,
    `    const role = classifyPitcherRole(pitcher);
    const kProjection = resolveOfficialKProjection({ pitcher, shadowContext: kWorkloadShadow });
    const projectedIP = kProjection.projectedIP;
    const projectedK9 = kProjection.projectedK9;
    const projectedKs = kProjection.projectedKs;
`,
    "replace legacy projection call",
  );

  source = source.replace(
    `    if (kLine && projectedKs) {
`,
    `    if (kLine != null && projectedKs != null) {
`,
  );

  source = replaceOnce(
    source,
    `      kAdjustment: roundNumber(kAdjustment, 0),
      kOddsOver: kOddsEntry?.over ?? null,
`,
    `      kAdjustment: roundNumber(kAdjustment, 0),
      projectionSource: kProjection.projectionSource,
      projectionFallbackReason: kProjection.projectionFallbackReason,
      kProjectionMode: kProjection.kProjectionMode,
      legacyProjectedIP: kProjection.legacyProjectedIP,
      legacyProjectedK9: kProjection.legacyProjectedK9,
      legacyProjectedKs: kProjection.legacyProjectedKs,
      candidateProjectedIP: kProjection.candidateProjectedIP,
      candidateProjectedK9: kProjection.candidateProjectedK9,
      candidateProjectedKs: kProjection.candidateProjectedKs,
      workloadExpectedBF: kProjection.workloadExpectedBF,
      workloadOnlyProjectedKs: kProjection.workloadOnlyProjectedKs,
      teamAdjustedKRate: kProjection.teamAdjustedKRate,
      teamAdjustedProjectedKs: kProjection.teamAdjustedProjectedKs,
      workloadConfidenceGrade: kProjection.workloadConfidenceGrade,
      workloadConfidenceScore: kProjection.workloadConfidenceScore,
      workloadFlags: kProjection.workloadFlags,
      kOddsOver: kOddsEntry?.over ?? null,
`,
    "live projection output metadata",
  );

  source = replaceOnce(
    source,
    `      projectedIP: toFiniteNumber(row.projectedIP),
      projectedK9: toFiniteNumber(row.projectedK9),
      projectedKs: toFiniteNumber(row.projectedKs),
      kLine: toFiniteNumber(row.kLine),
`,
    `      projectedIP: toFiniteNumber(row.projectedIP),
      projectedK9: toFiniteNumber(row.projectedK9),
      projectedKs: toFiniteNumber(row.projectedKs),
      projectionSource: normalizeText(row.projectionSource) || "legacy",
      projectionFallbackReason: normalizeText(row.projectionFallbackReason) || null,
      kProjectionMode: normalizeText(row.kProjectionMode) || "legacy",
      legacyProjectedIP: toFiniteNumber(row.legacyProjectedIP),
      legacyProjectedK9: toFiniteNumber(row.legacyProjectedK9),
      legacyProjectedKs: toFiniteNumber(row.legacyProjectedKs),
      candidateProjectedIP: toFiniteNumber(row.candidateProjectedIP),
      candidateProjectedK9: toFiniteNumber(row.candidateProjectedK9),
      candidateProjectedKs: toFiniteNumber(row.candidateProjectedKs),
      workloadExpectedBF: toFiniteNumber(row.workloadExpectedBF),
      workloadOnlyProjectedKs: toFiniteNumber(row.workloadOnlyProjectedKs),
      teamAdjustedKRate: toFiniteNumber(row.teamAdjustedKRate),
      teamAdjustedProjectedKs: toFiniteNumber(row.teamAdjustedProjectedKs),
      workloadConfidenceGrade: normalizeText(row.workloadConfidenceGrade) || null,
      workloadConfidenceScore: toFiniteNumber(row.workloadConfidenceScore),
      workloadFlags: Array.isArray(row.workloadFlags) ? row.workloadFlags.map(normalizeText).filter(Boolean) : [],
      kLine: toFiniteNumber(row.kLine),
`,
    "validation metadata",
  );

  writeFileSync(file, source, "utf8");
}

function patchDebugView() {
  const file = "src/pages/MlbHrProps.tsx";
  let source = readFileSync(file, "utf8");

  source = replaceOnce(
    source,
    `  projectedIP?: number | null;
  projectedK9?: number | null;
};
`,
    `  projectedIP?: number | null;
  projectedK9?: number | null;
  projectedKs?: number | null;
  projectionSource?: string | null;
  projectionFallbackReason?: string | null;
  kProjectionMode?: string | null;
  legacyProjectedKs?: number | null;
  candidateProjectedKs?: number | null;
  workloadExpectedBF?: number | null;
  workloadOnlyProjectedKs?: number | null;
  teamAdjustedKRate?: number | null;
  teamAdjustedProjectedKs?: number | null;
};
`,
    "pitcher projection type fields",
  );

  const component = `
type WorkloadDebugPitcher = {
  pitcher: string;
  team: string;
  opponent: string;
  projection?: {
    expectedBF?: number | null;
    workloadOnlyProjectedKs?: number | null;
    teamAdjustedKRate?: number | null;
    fullShadowProjectedKs?: number | null;
    teamAdjustmentKsDelta?: number | null;
  };
  confidence?: { grade?: string | null };
  flags?: string[];
};

type WorkloadDebugPayload = {
  date?: string;
  generatedAt?: string;
  pitchers?: WorkloadDebugPitcher[];
};

function WorkloadDebugPanel() {
  const enabled = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("workloadDebug") === "1";
  const [payload, setPayload] = useState<WorkloadDebugPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetch("/data/mlb/k-workload-shadow.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
        return response.json();
      })
      .then((data) => { if (active) setPayload(data); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [enabled]);

  if (!enabled) return null;

  const rows = payload?.pitchers ?? [];
  const format = (value: number | null | undefined, digits = 2) => Number.isFinite(value) ? Number(value).toFixed(digits) : "—";

  return (
    <section className="mx-auto mb-5 max-w-[1600px] overflow-hidden rounded-xl border border-sky-300 bg-sky-50 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-200 px-4 py-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Workload Debug</p>
          <h2 className="text-base font-black text-slate-950">Workload + Team K Shadow</h2>
        </div>
        <p className="text-xs text-slate-600">{payload?.date ?? "Loading"} · {rows.length} pitchers</p>
      </div>
      {error ? (
        <p className="px-4 py-4 text-sm font-semibold text-red-700">Unable to load shadow data: {error}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Pitcher</th>
                <th className="px-3 py-2 text-center">Expected BF</th>
                <th className="px-3 py-2 text-center">Workload Ks</th>
                <th className="px-3 py-2 text-center">Team K%</th>
                <th className="px-3 py-2 text-center">Full Ks</th>
                <th className="px-3 py-2 text-center">Δ Ks</th>
                <th className="px-3 py-2 text-center">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={\`\${row.pitcher}|\${row.team}\`} className="border-t border-sky-100 bg-white/70">
                  <td className="px-3 py-2 font-semibold text-slate-900">{row.pitcher} <span className="text-xs font-normal text-slate-500">{row.team} vs {row.opponent}</span></td>
                  <td className="px-3 py-2 text-center">{format(row.projection?.expectedBF, 1)}</td>
                  <td className="px-3 py-2 text-center">{format(row.projection?.workloadOnlyProjectedKs)}</td>
                  <td className="px-3 py-2 text-center">{Number.isFinite(row.projection?.teamAdjustedKRate) ? \`\${(Number(row.projection?.teamAdjustedKRate) * 100).toFixed(1)}%\` : "—"}</td>
                  <td className="px-3 py-2 text-center font-bold text-sky-900">{format(row.projection?.fullShadowProjectedKs)}</td>
                  <td className="px-3 py-2 text-center">{Number.isFinite(row.projection?.teamAdjustmentKsDelta) ? \`\${Number(row.projection?.teamAdjustmentKsDelta) >= 0 ? "+" : ""}\${Number(row.projection?.teamAdjustmentKsDelta).toFixed(2)}\` : "—"}</td>
                  <td className="px-3 py-2 text-center">{row.confidence?.grade ?? "—"}</td>
                </tr>
              ))}
              {!rows.length && !error ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">Loading workload shadow data…</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

`;

  const componentMarker = source.lastIndexOf("export default function");
  if (componentMarker < 0) throw new Error("Patch target not found: page default component");
  source = source.slice(0, componentMarker) + component + source.slice(componentMarker);

  const heroIndex = source.indexOf("<MlbNavHero", componentMarker + component.length);
  if (heroIndex < 0) throw new Error("Patch target not found: MlbNavHero render");
  source = source.slice(0, heroIndex) + "<WorkloadDebugPanel />\n        " + source.slice(heroIndex);

  source = source.replace(
    `        projectedIP: pitcher.projectedIP ?? null,
        projectedK9: pitcher.projectedK9 ?? null,
`,
    `        projectedIP: pitcher.projectedIP ?? null,
        projectedK9: pitcher.projectedK9 ?? null,
        projectedKs: pitcher.projectedKs ?? null,
`,
  );

  writeFileSync(file, source, "utf8");
}

function patchDailyWorkflow() {
  const file = ".github/workflows/generate-mlb-hr-props.yml";
  let source = readFileSync(file, "utf8");

  source = replaceOnce(
    source,
    `      - name: Generate HR props and best bets
`,
    `      - name: Generate K workload shadow
        run: node scripts/generate-mlb-k-workload-shadow.mjs

      - name: Validate K workload shadow
        env:
          MLB_K_PROJECTION_MODE: shadow
        run: node scripts/test-k-workload.mjs --fixture

      - name: Generate HR props and best bets
`,
    "daily workflow shadow steps",
  );

  source = replaceOnce(
    source,
    `        env:
          GROK_API_KEY: \${{ secrets.GROK_API_KEY }}
        run: |
`,
    `        env:
          GROK_API_KEY: \${{ secrets.GROK_API_KEY }}
          MLB_K_PROJECTION_MODE: shadow
        run: |
`,
    "daily workflow projection mode",
  );

  writeFileSync(file, source, "utf8");
}

function writeValidationWorkflow() {
  const file = ".github/workflows/test-mlb-k-shadow.yml";
  const source = `name: Test MLB K Shadow

on:
  pull_request:
    branches: [main]
    paths:
      - "scripts/mlb-k/**"
      - "scripts/generate-mlb-k-workload-shadow.mjs"
      - "scripts/test-k-workload.mjs"
      - "scripts/generate-mlb-hr-props.mjs"
      - "src/pages/MlbHrProps.tsx"
      - ".github/workflows/generate-mlb-hr-props.yml"
      - ".github/workflows/test-mlb-k-shadow.yml"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  validate-shadow:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      MLB_K_PROJECTION_MODE: shadow
      MLB_K_TEST_FIXTURE: "1"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - name: Syntax check K pipeline
        run: |
          node --check scripts/mlb-k/fetch-workload-data.mjs
          node --check scripts/mlb-k/compute-workload-projection.mjs
          node --check scripts/mlb-k/compute-team-k-adjustment.mjs
          node --check scripts/generate-mlb-k-workload-shadow.mjs
          node --check scripts/test-k-workload.mjs
          node --check scripts/generate-mlb-hr-props.mjs
      - name: Run deterministic shadow pipeline
        run: node scripts/test-k-workload.mjs --fixture
      - name: Build site
        run: npm run build
`;
  writeFileSync(file, source, "utf8");
}

patchGenerator();
patchDebugView();
patchDailyWorkflow();
writeValidationWorkflow();
console.log("Applied MLB K workload + team K live integration patches.");
