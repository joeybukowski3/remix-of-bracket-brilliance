/**
 * dry-run-mlb-social-post-plan.mjs
 *
 * Phase 3 developer/manual preview entry point. Builds a canonical
 * SocialPostPlan (via the existing, unmodified Phase-1 composition layer),
 * renders the canonical K/HR graphic, builds the canonical caption from the
 * SAME frozen plan, and writes everything to a local dry-run artifact
 * directory for inspection.
 *
 * NEVER posts to X. NEVER touches X_ALLOW_LIVE_POST, the image-bundle
 * system, publication receipts/leases, or any legacy posting script. Output
 * goes to artifacts/mlb-x-dry-run/<slateDate>/ -- a directory the live
 * image-bundle system (mlb-x-image-bundle.mjs, which watches fixed
 * artifacts/mlb-strikeout-props-x.* / mlb-hr-props-x.* paths) never reads
 * from or writes to, so this can never trigger stale same-day bundle reuse.
 *
 * Usage:
 *   node scripts/dry-run-mlb-social-post-plan.mjs --product=k|hr|all
 *     [--source=fixture|local] [--rows=2|3|4|5] [--slate-date=YYYY-MM-DD]
 *
 * --source=fixture (default): deterministic, network-free, hand-authored
 *   candidate rows (includes a doubleheader example) fed through the real
 *   composeSocialPostPlan builder. Always available, always deterministic.
 * --source=local (HR only, for now): reads public/data/mlb/hr-props-raw.json
 *   and runs it through the real getHrCandidatePool -> composeSocialPostPlan
 *   pipeline, same as the live HR posting script's own composition would.
 *   K has no equivalent local raw-data source in this phase (the live K
 *   pipeline sources from a live page scrape); --source=local for K is not
 *   supported here and falls back to fixture with a warning.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { getHrCandidatePool, SOCIAL_PRODUCT } from "./lib/mlb-social-composition.mjs";
import { composeSocialPostPlan } from "./lib/mlb-social-composition.mjs";
import { buildHrCanonicalCaption, buildKCanonicalCaption, buildCanonicalOmittedReply, weightedLength } from "./lib/mlb-social-canonical-caption.mjs";
import { extractCanonicalRenderedRows, renderCanonicalSocialSvg, writeCanonicalSocialGraphic } from "./lib/mlb-social-canonical-renderer.mjs";
import { assertGraphicCaptionConsistency, getPlanRowIdentities, planRowIdentity } from "./lib/mlb-social-plan-consistency.mjs";

const ROOT = process.cwd();
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "true"];
  }),
);

function getTodayEt() {
  // Kept dependency-free here (no live slate-timing import) since this is a
  // manual preview tool; callers who need the exact ET slate boundary can
  // pass --slate-date explicitly.
  return new Date().toISOString().slice(0, 10);
}

const product = args.get("product") ?? "all";
const source = args.get("source") ?? "fixture";
const rowsArg = args.get("rows") ? Number(args.get("rows")) : null;
const slateDate = args.get("slate-date") ?? getTodayEt();

if (!["k", "hr", "all"].includes(product)) throw new Error(`Unknown --product="${product}". Expected k, hr, or all.`);
if (!["fixture", "local"].includes(source)) throw new Error(`Unknown --source="${source}". Expected fixture or local.`);
if (rowsArg != null && (!Number.isInteger(rowsArg) || rowsArg < 2 || rowsArg > 5)) throw new Error(`--rows must be an integer 2-5, got "${args.get("rows")}".`);

// ---------------------------------------------------------------------------
// Fixture candidate pools -- deterministic, network-free, includes one
// doubleheader example (same pitcher/batter, two distinct gameIds) so the
// preview always exercises G1/G2 rendering without depending on today's
// real schedule containing one.
// ---------------------------------------------------------------------------
function kFixturePool() {
  return [
    { pitcher: "Zack Wheeler", pitcherId: 1001, team: "PHI", opponent: "ATL", gameId: 9001, kLine: 6.5, projectedKs: 7.4, direction: "OVER", projectionEdge: 0.9, oddsOver: "+105", oddsUnder: "-125", projectedIP: 6.1 },
    { pitcher: "Tarik Skubal", pitcherId: 1002, team: "DET", opponent: "CLE", gameId: 9002, kLine: 7.5, projectedKs: 8.1, direction: "OVER", projectionEdge: 0.6, oddsOver: "-110", oddsUnder: "-115", projectedIP: 6.4 },
    { pitcher: "Doubleheader Ace", pitcherId: 1003, team: "NYY", opponent: "BOS", gameId: 9003, gameNumber: 1, isDoubleheader: true, kLine: 5.5, projectedKs: 4.2, direction: "UNDER", projectionEdge: -1.3, oddsOver: "+120", oddsUnder: "-140", projectedIP: 5.2 },
    { pitcher: "Doubleheader Ace", pitcherId: 1003, team: "NYY", opponent: "BOS", gameId: 9004, gameNumber: 2, isDoubleheader: true, kLine: 5.0, projectedKs: 6.1, direction: "OVER", projectionEdge: 1.1, oddsOver: "-105", oddsUnder: "-115", projectedIP: 5.8 },
    { pitcher: "George Kirby", pitcherId: 1005, team: "SEA", opponent: "HOU", gameId: 9005, kLine: 5.5, projectedKs: 6.0, direction: "OVER", projectionEdge: 0.5, oddsOver: "-115", oddsUnder: "-105", projectedIP: 6.0 },
  ];
}

function hrFixturePool() {
  return [
    { player: "Aaron Judge", playerId: 2001, team: "NYY", opponent: "BOS", gameId: 9003, gameNumber: 1, isDoubleheader: true, hrScore: 87.1, hrOddsYes: "+230", opposingPitcher: "Brayan Bello", barrelRate: 22.4, hardHitRate: 58.1, last7HR: 4, last30HR: 11 },
    { player: "Shohei Ohtani", playerId: 2002, team: "LAD", opponent: "SF", gameId: 9006, hrScore: 84.3, hrOddsYes: "+202", opposingPitcher: "Logan Webb", barrelRate: 20.9, hardHitRate: 55.3, last7HR: 3, last30HR: 9 },
    { player: "Aaron Judge", playerId: 2001, team: "NYY", opponent: "BOS", gameId: 9004, gameNumber: 2, isDoubleheader: true, hrScore: 79.8, hrOddsYes: "+260", opposingPitcher: "Kutter Crawford", barrelRate: 22.4, hardHitRate: 58.1, last7HR: 4, last30HR: 11 },
    { player: "Kyle Schwarber", playerId: 2004, team: "PHI", opponent: "ATL", gameId: 9001, hrScore: 75.8, hrOddsYes: "+350", opposingPitcher: "Spencer Strider", barrelRate: 18.6, hardHitRate: 52.7, last7HR: 2, last30HR: 8 },
    { player: "Marcell Ozuna", playerId: 2005, team: "ATL", opponent: "PHI", gameId: 9001, hrScore: 73.4, hrOddsYes: "+320", opposingPitcher: "Zack Wheeler", barrelRate: 17.1, hardHitRate: 50.2, last7HR: 1, last30HR: 6 },
  ];
}

function slicePool(pool, count) {
  if (!count) return pool;
  return pool.slice(0, Math.min(count, pool.length));
}

// ---------------------------------------------------------------------------
// Real-slate HR loading. Mirrors post-mlb-hr-props-to-x.mjs's own local
// normalizer, but is a standalone read-only copy here -- it never imports
// from or calls that posting script, so this tool can never accidentally
// share state, receipts, or side effects with it.
// ---------------------------------------------------------------------------
function normalizeHrBatterForSelection(value) {
  const player = String(value?.player ?? "").trim();
  const team = String(value?.team ?? "").trim().toUpperCase();
  if (!player || !team) return null;
  const num = (v) => {
    const n = Number(v);
    return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
  };
  return {
    player,
    playerId: value?.playerId ?? null,
    gameId: value?.gameId ?? null,
    team,
    opponent: String(value?.opponent ?? "").trim().toUpperCase(),
    opposingPitcher: String(value?.opposingPitcher ?? "").trim() || "TBD",
    hrScore: num(value?.hrScore),
    hrOddsYes: String(value?.hrOddsYes ?? "").trim() || null,
    barrelRate: num(value?.barrelRate),
    hardHitRate: num(value?.hardHitRate),
    last7HR: num(value?.last7HR),
    last30HR: num(value?.last30HR),
    lineupStatus: value?.lineupStatus ?? "unknown",
    battingOrder: value?.battingOrder ?? null,
  };
}

function loadLocalHrCandidatePool() {
  const rawPath = path.join(ROOT, "public", "data", "mlb", "hr-props-raw.json");
  if (!existsSync(rawPath)) throw new Error(`--source=local requires ${rawPath}, which does not exist.`);
  const raw = JSON.parse(readFileSync(rawPath, "utf8"));
  const batters = (Array.isArray(raw?.batters) ? raw.batters : Array.isArray(raw) ? raw : [])
    .map(normalizeHrBatterForSelection)
    .filter(Boolean);
  // Treat every lineup status as confirmed for preview purposes only -- this
  // tool never posts, so it is not subject to the live confirmation gate.
  // selectConfirmedHrProps only promotes a PROJECTED row on an explicit
  // `=== true` from liveConfirm (see mlb-hr-x-selection-core.mjs), so this
  // must return the literal boolean, not a truthy object.
  return getHrCandidatePool({ batters, isGameStarted: () => false, liveConfirm: () => true });
}

function buildPlan(productKey, { source, slateDate, rows }) {
  const isK = productKey === "k";
  if (isK && source === "local") {
    console.warn("[dry-run] --source=local is not supported for K in Phase 3 (no local raw K data source yet); falling back to fixture.");
  }

  const useLocal = !isK && source === "local";
  const candidatePool = useLocal ? loadLocalHrCandidatePool() : slicePool(isK ? kFixturePool() : hrFixturePool(), rows);

  return composeSocialPostPlan({
    product: isK ? SOCIAL_PRODUCT.K : SOCIAL_PRODUCT.HR,
    slateDate,
    candidatePool,
    title: isK ? "MLB STRIKEOUT PROPS" : "MLB HOME RUN TARGETS",
    generatedAt: new Date().toISOString(),
    sourceSummary: [useLocal ? "local hr-props-raw.json" : "fixture"],
  });
}

async function renderOneProduct(productKey, outDir) {
  const plan = buildPlan(productKey, { source, slateDate, rows: rowsArg });
  if (!plan) {
    console.warn(`[dry-run] ${productKey}: no plan could be composed (fewer than 2 distinct qualified opportunities). Skipping.`);
    return null;
  }

  const captionResult = productKey === "k" ? buildKCanonicalCaption(plan) : buildHrCanonicalCaption(plan);
  const reply = captionResult.omittedRows?.length ? buildCanonicalOmittedReply({ omittedRows: captionResult.omittedRows, product: productKey }) : { shouldReply: false };

  const svgPath = path.join(outDir, `${productKey}-card.svg`);
  const pngPath = path.join(outDir, `${productKey}-card.png`);
  const captionPath = path.join(outDir, `${productKey}-caption.txt`);
  const planPath = path.join(outDir, `${productKey}-plan.json`);
  const replyPath = path.join(outDir, `${productKey}-reply.txt`);

  const written = await writeCanonicalSocialGraphic({ plan, svgPath, pngPath });

  // Shared-plan consistency invariant, proven at generation time (not just
  // in tests): the graphic and caption for THIS run must trace back to the
  // exact same plan rows, in the exact same order.
  const graphicRowIdentities = written.renderedRows.map((row) => `${row.gameId}:${row.playerId}`);
  const captionRowIdentities = captionResult.captionRows.map(planRowIdentity);
  assertGraphicCaptionConsistency({ plan, graphicRowIdentities, captionRowIdentities });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(captionPath, `${captionResult.caption}\n`, "utf8");
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  if (reply.shouldReply) writeFileSync(replyPath, `${reply.caption}\n`, "utf8");

  console.log(`[dry-run] ${productKey}: ${plan.rows.length} row(s), consistency OK`);
  console.log(`  graphic: ${pngPath}`);
  console.log(`  svg:     ${svgPath}`);
  console.log(`  caption: ${captionPath} (${weightedLength(captionResult.caption)}/280 weighted chars, ${plan.rows.length - captionResult.omittedRows.length}/${plan.rows.length} rows included)`);
  if (reply.shouldReply) console.log(`  reply:   ${replyPath}`);
  console.log(`  plan:    ${planPath}`);

  return { plan, captionResult, pngPath, svgPath, captionPath, planPath, replyPath: reply.shouldReply ? replyPath : null };
}

async function main() {
  const outDir = path.join(ROOT, "artifacts", "mlb-x-dry-run", slateDate);
  mkdirSync(outDir, { recursive: true });
  const products = product === "all" ? ["k", "hr"] : [product];
  for (const productKey of products) {
    await renderOneProduct(productKey, outDir);
  }
}

main().catch((error) => {
  console.error(`[dry-run] failed: ${error.stack ?? error}`);
  process.exitCode = 1;
});
