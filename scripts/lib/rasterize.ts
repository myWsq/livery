/**
 * Rasterises an artboard's SVG text in Node, and decodes the environments' JPEG detail
 * images with the same rasteriser. The browser rasterises with a canvas and decodes
 * with `createImageBitmap` instead.
 */
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

/** A decoded JPEG: RGBA bytes, rows from the top, alpha 255 throughout. */
export interface DecodedJpeg {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array<ArrayBuffer>;
}

/**
 * Decodes a JPEG at its own size: it is wrapped as a data URL in an SVG of that size
 * holding one `<image>`, which resvg renders at original size.
 */
export function decodeJpeg(bytes: Uint8Array): DecodedJpeg {
  const [width, height] = jpegSize(bytes);
  const href = `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}">` +
    `<image width="${width}" height="${height}" image-rendering="optimizeSpeed" xlink:href="${href}"/></svg>`;
  const image = new Resvg(svg, { fitTo: { mode: "original" } }).render();
  if (image.width !== width || image.height !== height) {
    throw new Error(`decoded to ${image.width}x${image.height}, expected ${width}x${height}`);
  }
  // The image is opaque, so resvg's colour premultiplied by alpha is the colour itself.
  return { width, height, pixels: new Uint8Array(image.pixels) };
}

/** A JPEG's width and height, read from its frame header. */
function jpegSize(bytes: Uint8Array): [width: number, height: number] {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("not a JPEG file");
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) throw new Error("not a JPEG file: a marker is missing");
    const marker = bytes[at + 1];
    // A fill byte before a marker.
    if (marker === 0xff) {
      at++;
      continue;
    }
    // Every start-of-frame marker, c0 to cf, but DHT (c4), JPG (c8) and DAC (cc): its
    // segment holds the precision, then the height and width.
    const frame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (frame && at + 9 <= bytes.length) {
      return [(bytes[at + 7] << 8) | bytes[at + 8], (bytes[at + 5] << 8) | bytes[at + 6]];
    }
    at += 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
  }
  throw new Error("not a JPEG file: no frame header");
}
