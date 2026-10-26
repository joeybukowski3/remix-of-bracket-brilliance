/**
 * NBA data containment rules (pure; I/O is injected).
 *
 * Restricted material: stats.nba.com raw responses, canonical tables built
 * from them, prediction/outcome snapshots, backtest artifacts, and local
 * research reports. NBA.com Terms of Use (Section 9) limit it to private,
 * non-commercial use, and this repository is public.
 *
 * Findings carry a path and a rule id only, never file content, so running
 * the check in CI cannot itself leak data into logs.
 */

/** Restricted-report marker; assembled so this file does not itself match. */
export const RESTRICTED_REPORT_MARKER = `${["JKB", "RESTRICTED"].join("-")}: NBA.com-derived`;

/** Files that define the rules and therefore contain the patterns. */
const RULE_DEFINITION_FILES = new Set([
  "scripts/lib/nba-data-containment.mjs",
  "scripts/check-nba-data-containment.mjs",
]);

const DATA_EXTENSIONS = /\.(json|jsonl|ndjson|csv|tsv|txt|md|parquet|xml)$/i;
const SOURCE_EXTENSIONS = /\.(ts|tsx|mts|cts|js|mjs|cjs|json|md)$/i;

/** NBA.com retrieval tooling kept local-only (Phase 2B review decision). */
export const LOCAL_ONLY_RETRIEVAL_TOOLS = new Set([
  "scripts/nba-fetch-game-logs.ts",
  "src/lib/nba/props/ingest/statsNbaClient.ts",
  "src/lib/nba/props/ingest/statsNbaClient.test.ts",
]);
const DEPLOYABLE_TEXT_EXTENSIONS = /\.(js|mjs|cjs|css|html?|json|jsonl|ndjson|csv|tsv|txt|xml|map|md|webmanifest)$/i;

export const PATH_RULES = [
  { id: "nba-data-directory", test: (p) => /(^|\/)data\/nba(\/|$)/.test(p) },
  { id: "stats-nba-raw-snapshot", test: (p) => /(^|\/)stats-nba\//.test(p) || (/nba/i.test(p) && /\.(body|meta)\.json$/.test(p)) },
  { id: "nba-canonical-or-prediction-table", test: (p) => /nba/i.test(p) && /(^|\/)(player-games|team-games|predictions-[^/]+|outcomes-[^/]+)\.jsonl$/.test(p) },
  // Private V1 artifacts (hoopR/ESPN-derived): caught by name wherever they are copied, not only under data/nba/.
  {
    id: "nba-v1-private-artifact",
    test: (p) =>
      /(^|\/)(player-games\.json|hoopr-import-report\.json|position-map-report\.json|position-review-list\.(json|csv)|private-preview-board\.json|positions-20\d\d-\d\d\.json|player-features\.json|position-proposals\.(json|csv)|backtest-report\.json|validation-report\.json|manifest-prior-season\.json)$/.test(p) ||
      /(^|\/)props-v1\/raw\//.test(p),
  },
  { id: "nba-backtest-artifact", test: (p) => /nba[^/]*\/(backtest|canonical|reports)\//i.test(p) },
  { id: "nba-com-retrieval-tool", test: (p) => LOCAL_ONLY_RETRIEVAL_TOOLS.has(p) },
];

/**
 * Baseline-v0 values tuned on NBA.com data, held locally pending a rights
 * determination (data/nba/reports/v0-tuned-benchmark.json). Matched in code,
 * JSON and prose form, in every committable source or doc file.
 */
export const TUNED_VALUE_RULES = [
  {
    id: "nba-tuned-v0-params",
    test: (text) =>
      /"?rateShrinkMinutes"?\s*:\s*(?:Object\.freeze\()?\{\s*"?pts"?\s*:\s*50\s*,\s*"?reb"?\s*:\s*100\s*,\s*"?ast"?\s*:\s*50\s*\}/.test(text) ||
      /PTS\s*50\s*\/\s*REB\s*100\s*\/\s*AST\s*50/i.test(text) ||
      /"?newPlayerMinutes"?\s*[=:]\s*6(?![\d.])/.test(text) ||
      /"?newPlayerMinutes"?\s*:\s*\[\s*4\s*,\s*6\s*,\s*8\s*,\s*12\s*,\s*16\s*,\s*20\s*\]/.test(text),
  },
];

export const CONTENT_RULES = [
  {
    id: "raw-stats-nba-payload",
    test: (text) => /"resultSets"\s*:/.test(text) && /"GAME_ID"/.test(text) && /"(PLAYER_ID|TEAM_ID)"/.test(text),
  },
  { id: "raw-snapshot-metadata", test: (text) => /"nba-raw-snapshot-meta-v1"/.test(text) },
  {
    id: "nba-canonical-or-model-record",
    test: (text) =>
      /"schemaVersion"\s*:\s*"nba-(player-game|team-game|prediction-snapshot|outcome|canonical-manifest|pregame-snapshot|final-result|prop-evaluation|capture-attempt|job-run|pipeline-game|line-import-batch|prop-partition)-v1"/.test(
        text,
      ),
  },
  {
    id: "nba-v1-private-record",
    test: (text) => /"schemaVersion"\s*:\s*"jkb-(player-games-import|hoopr-manifest|position-estimates|player-features|position-proposals|v1-backtest-report|v1-validation-report)-v1"/.test(text) || /"privatePreview"\s*:\s*\{/.test(text),
  },
  { id: "nba-model-output", test: (text) => /"modelVersion"\s*:\s*"nba-(props-baseline|minutes)-/.test(text) },
  { id: "restricted-report-marker", test: (text) => text.includes(RESTRICTED_REPORT_MARKER) },
];

/** Signs that NBA ingestion or model code reached a deployable bundle. */
export const DEPLOYABLE_ONLY_RULES = [
  { id: "nba-ingest-code-in-bundle", test: (text) => text.includes("stats.nba.com/stats") },
  { id: "nba-model-code-in-bundle", test: (text) => /nba-(props-baseline-v0|minutes-v1-candidate)/.test(text) },
];

const normalizePath = (p) => p.replace(/\\/g, "/").replace(/^\.\//, "");

export function classifyPath(path) {
  const p = normalizePath(path);
  return PATH_RULES.filter((rule) => rule.test(p)).map((rule) => rule.id);
}

export function classifyContent(text, { deployable = false } = {}) {
  const rules = deployable ? [...CONTENT_RULES, ...DEPLOYABLE_ONLY_RULES, ...TUNED_VALUE_RULES] : CONTENT_RULES;
  return rules.filter((rule) => rule.test(text)).map((rule) => rule.id);
}

export function classifySourceContent(text) {
  return TUNED_VALUE_RULES.filter((rule) => rule.test(text)).map((rule) => rule.id);
}

/**
 * @param {object} input
 * @param {string[]} input.paths candidate paths (tracked + committable, or staged, or deployable files)
 * @param {(path: string) => string | null} input.readText returns text, or null to skip (binary, missing, too large)
 * @param {"git" | "deployable"} input.scope
 * @returns {{ path: string, rules: string[] }[]}
 */
export function findViolations({ paths, readText, scope }) {
  const deployable = scope === "deployable";
  const findings = [];
  for (const raw of paths) {
    const path = normalizePath(raw);
    if (RULE_DEFINITION_FILES.has(path)) continue;
    const rules = classifyPath(path);
    const scanData = deployable ? DEPLOYABLE_TEXT_EXTENSIONS.test(path) : DATA_EXTENSIONS.test(path);
    const scanSource = !deployable && SOURCE_EXTENSIONS.test(path);
    if (scanData || scanSource) {
      const text = readText(raw);
      if (text !== null) {
        if (scanData) rules.push(...classifyContent(text, { deployable }));
        if (scanSource) rules.push(...classifySourceContent(text));
      }
    }
    if (rules.length > 0) findings.push({ path, rules: [...new Set(rules)] });
  }
  return findings;
}

/** NBA source that must stay committable (not gitignored). */
export const REQUIRED_NBA_SOURCE = [
  "src/lib/nba/props/projection.ts",
  "src/lib/nba/props/features.ts",
  "src/lib/nba/props/minutesV1.ts",
  "src/lib/nba/props/baselineV0.golden.test.ts",
  "src/lib/nba/props/__fixtures__/synthetic.ts",
  "src/lib/nba/props/sources/types.ts",
  "src/lib/nba/props/sources/licenses.ts",
  "src/lib/nba/props/ingest/statsNbaPayload.ts",
  "scripts/nba-build-dataset.ts",
  "scripts/lib/nba-data-containment.mjs",
  "docs/nba-player-props-phase-1.md",
];

/**
 * @param {object} input
 * @param {(path: string) => boolean} input.exists
 * @param {(path: string) => boolean} input.isIgnored
 * @returns {{ path: string, problem: "missing" | "gitignored" }[]}
 */
export function findMissingSource({ exists, isIgnored, required = REQUIRED_NBA_SOURCE }) {
  return required.flatMap((path) => {
    if (!exists(path)) return [{ path, problem: "missing" }];
    if (isIgnored(path)) return [{ path, problem: "gitignored" }];
    return [];
  });
}

/** `.vercelignore` must exclude data/nba (CLI uploads otherwise include gitignored files). */
export function vercelIgnoreProtects(text) {
  if (text === null) return false;
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => /^\/?data\/nba\/?(\*\*)?$/.test(line));
}
