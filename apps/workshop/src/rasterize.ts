/** Rasterises an artboard's SVG text in the browser. Node does this with resvg instead. */
import { rasterSize, type ArtboardRaster } from "./artboards.ts";
import type { View } from "./frames.ts";

/**
 * Draws an artboard's SVG at the artboard texture's size and returns its pixels.
 * The element with `id="guide"` is removed first, so the guide never reaches the car.
 * Rejects when the text is not well-formed SVG or the browser cannot draw it.
 */
export async function rasterizeArtboard(svg: string, view: View): Promise<ArtboardRaster> {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  // A parse failure does not throw: it comes back as a document holding a <parsererror>.
  const parserError = parsed.querySelector("parsererror");
  if (parserError) {
    throw new Error(`XML 格式错误：${parserError.textContent?.trim().split("\n")[0] ?? ""}`);
  }
  const root = parsed.documentElement;
  if (root.localName !== "svg") throw new Error(`根元素不是 <svg>，而是 <${root.localName}>`);
  if (!root.hasAttribute("viewBox")) throw new Error("根元素缺少 viewBox");

  parsed.querySelector('[id="guide"]')?.remove();

  // Rasterise at exactly the texture's size, whatever physical size the file declares.
  const [width, height] = rasterSize(view);
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));

  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(parsed)], { type: "image/svg+xml" }),
  );
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`浏览器无法绘制这份 SVG：${reason}`);
    }
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("无法创建 2D 画布");
    context.drawImage(image, 0, 0, width, height);
    // getImageData returns sRGB with straight alpha, which is what the texture expects.
    return { width, height, data: context.getImageData(0, 0, width, height).data };
  } finally {
    URL.revokeObjectURL(url);
  }
}
