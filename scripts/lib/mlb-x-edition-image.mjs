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
import { ensureImageBundle, imageKindForMarket, publishImageBundle } from "./mlb-x-image-bundle.mjs";

/**
 * @param {Function} params.renderGraphic ({ market, slateDate, rows, svgPath, pngPath }) -> { pngPath, svgPath, renderedRows, width?, height? }
 *        Injected so tests never need Playwright or a browser.
 */
export async function ensureEditionImage({
  market,
  slateDate,
  rows,
  directory,
  renderGraphic,
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
          });
        }
      : null,
  });

  return { ...bundle, renderedRows: bundle.source === "rendered" ? capturedRenderedRows : null };
}
