/** Rasterises an artboard's SVG text in Node. The browser does this with a canvas instead. */
import { Resvg } from "@resvg/resvg-js";

import { rasterSize, type ArtboardRaster } from "../../src/artboards.ts";
import type { View } from "../../src/frames.ts";

/**
 * Removes the element with `id="guide"` and everything inside it: the guide is a
 * drawing aid and must never reach the car. Works on the text, as Node has no DOM.
 */
export function stripGuide(svg: string): string {
  const open = /<([A-Za-z][\w:.-]*)\b[^>]*?\bid\s*=\s*(["'])guide\2[^>]*>/.exec(svg);
  if (!open) return svg;
  const start = open.index;
  const afterOpen = start + open[0].length;
  if (open[0].endsWith("/>")) return svg.slice(0, start) + svg.slice(afterOpen);

  // Walk tags of the same name to find the matching close.
  const tag = new RegExp(`<(/?)${open[1].replace(/[.]/g, "\\.")}\\b[^>]*>`, "g");
  tag.lastIndex = afterOpen;
  let depth = 1;
  for (let match = tag.exec(svg); match; match = tag.exec(svg)) {
    if (match[1] === "/") depth--;
    else if (!match[0].endsWith("/>")) depth++;
    if (depth === 0) return svg.slice(0, start) + svg.slice(tag.lastIndex);
  }
  throw new Error('the element with id="guide" is never closed');
}

export async function rasterizeArtboard(svg: string, view: View): Promise<ArtboardRaster> {
  const [width, height] = rasterSize(view);
  // resvg throws on malformed XML.
  const image = new Resvg(stripGuide(svg), {
    fitTo: { mode: "width", value: width },
    font: { loadSystemFonts: true },
  }).render();
  if (image.width !== width || image.height !== height) {
    throw new Error(
      `rasterised to ${image.width}x${image.height}, expected ${width}x${height}: check viewBox`,
    );
  }
  // resvg hands back colour premultiplied by alpha; the contract is straight alpha.
  const data = new Uint8Array(image.pixels);
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0 || alpha === 255) continue;
    data[i] = Math.min(255, Math.round((data[i] * 255) / alpha));
    data[i + 1] = Math.min(255, Math.round((data[i + 1] * 255) / alpha));
    data[i + 2] = Math.min(255, Math.round((data[i + 2] * 255) / alpha));
  }
  return { width, height, data };
}
