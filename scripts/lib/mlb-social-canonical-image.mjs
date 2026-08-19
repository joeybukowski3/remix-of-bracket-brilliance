/**
 * mlb-social-canonical-image.mjs
 *
 * Phase 5 image collaborator for the canonical publisher. Wraps
 * ensureImageBundle (mlb-x-image-bundle.mjs) around the canonical renderer
 * (mlb-social-canonical-renderer.mjs) -- never the legacy edition renderer.
 *
 * `plan.rowFingerprint` is passed straight through to ensureImageBundle as
 * the content-aware reuse gate: this module never recomputes a fingerprint of
 * its own (unlike the transitional computeEditionRowFingerprint in
 * mlb-x-edition-image.mjs, which this module does not import or use).
 */
import { ensureImageBundle, imageKindForMarket, publishImageBundle } from "./mlb-x-image-bundle.mjs";
import { CANONICAL_GEOMETRY, writeCanonicalSocialGraphic } from "./mlb-social-canonical-renderer.mjs";
import { marketForProduct } from "./mlb-social-composition.mjs";

/** Real renderer: canonical SVG + Playwright PNG rasterization. The production default. */
async function defaultRenderGraphic({ plan, svgPath, pngPath, resolveLogo, browser, fetchImpl }) {
  return writeCanonicalSocialGraphic({ plan, svgPath, pngPath, resolveLogo, browser, fetchImpl });
}

/**
 * Returns a validated canonical image bundle for `plan`, rendering with the
 * canonical renderer if no valid bundle already matches
 * (kind + slateDate + plan.rowFingerprint).
 *
 * @param {object} params
 * @param {import("./mlb-social-post-plan.mjs").SocialPostPlan} params.plan
 * @param {string} params.directory  canonical image directory (never the
 *        legacy live artifacts/mlb-x-images path this phase's scheduled
 *        edition posters still watch -- callers must point this at a
 *        canonical-only directory so the two publishers can never collide)
 * @param {Function} [params.renderGraphic] injected for testing (defaults to
 *        the real canonical renderer + Playwright rasterizer); test doubles
 *        must return {pngPath, svgPath, renderedRows}, matching
 *        writeCanonicalSocialGraphic's own return shape
 * @param {boolean} [params.expectExternalRender]
 */
export async function ensureCanonicalImage({ plan, directory, browser, resolveLogo, fetchImpl, renderGraphic = defaultRenderGraphic, expectExternalRender = false }) {
  const kind = imageKindForMarket(marketForProduct(plan.product));
  let capturedRenderedRows = null;

  const bundle = await ensureImageBundle({
    kind,
    slateDate: plan.slateDate,
    directory,
    expectExternalRender,
    rowFingerprint: plan.rowFingerprint,
    render: async ({ paths }) => {
      const written = await renderGraphic({ plan, svgPath: paths.svgPath, pngPath: paths.pngPath, resolveLogo, browser, fetchImpl });
      capturedRenderedRows = written.renderedRows;
      publishImageBundle({
        kind,
        slateDate: plan.slateDate,
        directory,
        pngSource: written.pngPath,
        svgSource: written.svgPath,
        width: CANONICAL_GEOMETRY.width,
        height: CANONICAL_GEOMETRY.height,
        rowCount: plan.rows.length,
        rowFingerprint: plan.rowFingerprint,
      });
    },
  });

  return { ...bundle, renderedRows: bundle.source === "rendered" ? capturedRenderedRows : null };
}
