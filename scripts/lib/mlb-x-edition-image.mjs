/**
 * Image collaborator for the edition posters: wraps ensureImageBundle around
 * the existing writeMlbSocialGraphic renderer.
 *
 * The render callback ensureImageBundle invokes is responsible for producing
 * a fully published bundle, so this writes the graphic directly to the
 * bundle's own paths and publishes the sidecar from what the renderer
 * actually drew (not from the input rows), which is what lets
 * assertRowConsistency catch a renderer that silently dropped or reordered a
 * row.
 */
import { createHash } from "node:crypto";
import { ensureImageBundle, imageKindForMarket, publishImageBundle } from "./mlb-x-image-bundle.mjs";

/**
 * Deterministic content fingerprint for the edition plan's `selectedRows`
 * (a shape distinct from the canonical `SocialPostPlan.rowFingerprint` --
 * edition rows carry market-specific fields like kLine/hrScore directly,
 * not a `content` sub-object -- so this is a self-contained equivalent for
 * this plan shape, not a competing algorithm for the canonical one). Hashes
 * the frozen rows verbatim: same rows, same order -> same fingerprint;
 * anything about the visible content (or its order) changing flips it.
 *
 * TRANSITIONAL (Phase 4). This exists only because the scheduled edition
 * planner (mlb-x-edition-plan.mjs) still produces its own pre-canonical row
 * shape rather than a `SocialPostPlan`. It is not the future fingerprint
 * authority: once the canonical publisher consumes `SocialPostPlan` end to
 * end (Phase 5+), the poster should pass `SocialPostPlan.rowFingerprint`
 * (computeRowFingerprint in mlb-social-post-plan.mjs) directly, and this
 * function -- along with every caller of it -- should be deleted once no
 * caller needs an edition-shaped fingerprint anymore. Do not extend or reuse
 * it for anything canonical.
 */
export function computeEditionRowFingerprint(rows) {
  return createHash("sha256").update(JSON.stringify(Array.isArray(rows) ? rows : [])).digest("hex");
}

/**
 * @param {Function} params.renderGraphic ({ market, slateDate, rows, svgPath, pngPath }) -> { pngPath, svgPath, renderedRows, width?, height? }
 *        Injected so tests never need Playwright or a browser.
 * @param {string} [params.rowFingerprint] content fingerprint of `rows` (see
 *        computeEditionRowFingerprint). Omit entirely to get the pre-Phase-4
 *        kind+slateDate-only reuse behavior; pass it to gate reuse on content
 *        as well.
 */
export async function ensureEditionImage({
  market,
  slateDate,
  rows,
  directory,
  renderGraphic,
  rowFingerprint,
  expectExternalRender = false,
  defaultWidth = 1600,
  defaultHeight = 900,
}) {
  const kind = imageKindForMarket(market);
  let capturedRenderedRows = null;

  const bundle = await ensureImageBundle({
    kind,
    slateDate,
    directory,
    expectExternalRender,
    rowFingerprint,
    render: renderGraphic
      ? async ({ paths }) => {
          const rendered = await renderGraphic({ market, slateDate, rows, svgPath: paths.svgPath, pngPath: paths.pngPath });
          capturedRenderedRows = rendered.renderedRows ?? [];
          publishImageBundle({
            kind,
            slateDate,
            directory,
            pngSource: rendered.pngPath ?? paths.pngPath,
            svgSource: rendered.svgPath ?? paths.svgPath,
            width: rendered.width ?? defaultWidth,
            height: rendered.height ?? defaultHeight,
            rowCount: capturedRenderedRows.length,
            rowFingerprint: rowFingerprint ?? null,
          });
        }
      : null,
  });

  return { ...bundle, renderedRows: bundle.source === "rendered" ? capturedRenderedRows : null };
}
