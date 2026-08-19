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
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { buildHrCanonicalCaption, buildKCanonicalCaption, buildCanonicalOmittedReply, weightedLength } from "./lib/mlb-social-canonical-caption.mjs";
import { writeCanonicalSocialGraphic } from "./lib/mlb-social-canonical-renderer.mjs";
import { assertGraphicCaptionConsistency, planRowIdentity } from "./lib/mlb-social-plan-consistency.mjs";
import { buildPlanFromSource } from "./lib/mlb-social-plan-source.mjs";

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

async function renderOneProduct(productKey, outDir) {
  const { plan } = buildPlanFromSource(productKey, { source, slateDate, rows: rowsArg, root: ROOT, warn: (m) => console.warn(`[dry-run] ${m}`) });
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
