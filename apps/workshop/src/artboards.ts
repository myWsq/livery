/**
 * Artboard images as the paint shader samples them: turning a rasterised artboard
 * into a texture, and keeping the five artboards of a design up to date.
 *
 * Shared by the browser app and the Node scripts. Rasterising SVG text is the one
 * step that differs between them, so it is passed in.
 */
import { texture, type Gpu, type Texture } from "vgpu";

import { FRAMES, VIEWS, type View } from "./frames.ts";

/** Texels per artboard millimetre. At 1 a 5 mm line is five texels wide. */
export const TEXELS_PER_MM = 1;

/** An artboard as rasterised from its SVG: sRGB colour with straight alpha, 8 bits each. */
export interface ArtboardRaster {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

/** Pixel size an artboard is rasterised at. */
export function rasterSize(view: View): [width: number, height: number] {
  const frame = FRAMES[view];
  return [Math.round(frame.width * TEXELS_PER_MM), Math.round(frame.height * TEXELS_PER_MM)];
}

/** A design's artboards as SVG text; a missing view has no file. */
export type DesignSources = Partial<Record<View, string>>;

/** Where a design's artboard lives in the repository. */
export function artboardPath(design: string, view: View): string {
  return `designs/${design}/${view}.svg`;
}

const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(x: number): number {
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

/** sRGB bytes for linear values in 0..1, in steps fine enough for mip levels. */
const LINEAR_TO_SRGB = new Uint8Array(4096);
for (let i = 0; i < 4096; i++) LINEAR_TO_SRGB[i] = Math.round(linearToSrgb(i / 4095) * 255);

/**
 * Converts straight-alpha sRGB to what the texture stores: linear colour
 * premultiplied by alpha, sRGB-encoded. An `rgba8unorm-srgb` texture decodes that
 * back to premultiplied linear colour before filtering, so the edges of shapes blend
 * toward transparent without a dark or light fringe.
 */
function premultiply(source: Uint8Array | Uint8ClampedArray): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(source.length);
  for (let i = 0; i < source.length; i += 4) {
    const alpha = source[i + 3];
    if (alpha === 0) continue;
    if (alpha === 255) {
      result[i] = source[i];
      result[i + 1] = source[i + 1];
      result[i + 2] = source[i + 2];
    } else {
      const coverage = alpha / 255;
      result[i] = Math.round(linearToSrgb(SRGB_TO_LINEAR[source[i]] * coverage) * 255);
      result[i + 1] = Math.round(linearToSrgb(SRGB_TO_LINEAR[source[i + 1]] * coverage) * 255);
      result[i + 2] = Math.round(linearToSrgb(SRGB_TO_LINEAR[source[i + 2]] * coverage) * 255);
    }
    result[i + 3] = alpha;
  }
  return result;
}

/** The next mip level: a 2x2 box filter in premultiplied linear colour. */
function downsample(
  source: Uint8Array<ArrayBuffer>,
  width: number,
  height: number,
): { data: Uint8Array<ArrayBuffer>; width: number; height: number } {
  const nextWidth = Math.max(1, width >> 1);
  const nextHeight = Math.max(1, height >> 1);
  const data = new Uint8Array(nextWidth * nextHeight * 4);
  const sourceWords = new Uint32Array(source.buffer, 0, width * height);
  const words = new Uint32Array(data.buffer);
  for (let y = 0; y < nextHeight; y++) {
    const row0 = Math.min(2 * y, height - 1) * width;
    const row1 = Math.min(2 * y + 1, height - 1) * width;
    for (let x = 0; x < nextWidth; x++) {
      const x0 = Math.min(2 * x, width - 1);
      const x1 = Math.min(2 * x + 1, width - 1);
      const a = row0 + x0;
      const b = row0 + x1;
      const c = row1 + x0;
      const d = row1 + x1;
      const target = y * nextWidth + x;
      const word = sourceWords[a];
      if (word === sourceWords[b] && word === sourceWords[c] && word === sourceWords[d]) {
        words[target] = word;
        continue;
      }
      for (let channel = 0; channel < 3; channel++) {
        const mean =
          (SRGB_TO_LINEAR[source[a * 4 + channel]] +
            SRGB_TO_LINEAR[source[b * 4 + channel]] +
            SRGB_TO_LINEAR[source[c * 4 + channel]] +
            SRGB_TO_LINEAR[source[d * 4 + channel]]) /
          4;
        data[target * 4 + channel] = LINEAR_TO_SRGB[Math.round(mean * 4095)];
      }
      data[target * 4 + 3] =
        (source[a * 4 + 3] + source[b * 4 + 3] + source[c * 4 + 3] + source[d * 4 + 3] + 2) >> 2;
    }
  }
  return { data, width: nextWidth, height: nextHeight };
}

const FILM_FORMAT: GPUTextureFormat = "rgba8unorm-srgb";

function writeLevel(
  gpu: Gpu,
  target: Texture,
  mipLevel: number,
  data: Uint8Array<ArrayBuffer>,
  width: number,
  height: number,
): void {
  gpu.gpu.queue.writeTexture(
    { texture: target.gpu, mipLevel },
    data,
    { bytesPerRow: width * 4, rowsPerImage: height },
    [width, height],
  );
}

/**
 * Uploads a rasterised artboard as a mipmapped texture. vgpu does not generate mip
 * levels, so the whole chain is filtered here.
 */
export function createArtboardTexture(gpu: Gpu, raster: ArtboardRaster): Texture {
  const { width, height } = raster;
  if (raster.data.length !== width * height * 4) {
    throw new Error(`artboard raster is not ${width}x${height} RGBA`);
  }
  const mipLevelCount = Math.floor(Math.log2(Math.max(width, height))) + 1;
  const result = texture(gpu, {
    kind: "2d",
    size: [width, height],
    format: FILM_FORMAT,
    mipLevelCount,
    usage: ["texture_binding", "copy_dst"],
  });
  let level = { data: premultiply(raster.data), width, height };
  for (let mipLevel = 0; mipLevel < mipLevelCount; mipLevel++) {
    if (mipLevel > 0) level = downsample(level.data, level.width, level.height);
    writeLevel(gpu, result, mipLevel, level.data, level.width, level.height);
  }
  return result;
}

/** A fully transparent artboard: no film anywhere. */
export function createEmptyArtboardTexture(gpu: Gpu): Texture {
  const result = texture(gpu, {
    kind: "2d",
    size: [1, 1],
    format: FILM_FORMAT,
    usage: ["texture_binding", "copy_dst"],
  });
  writeLevel(gpu, result, 0, new Uint8Array(4), 1, 1);
  return result;
}

export interface ArtboardLoaderOptions {
  /** Turns an artboard's SVG text into pixels; rejects when the SVG is broken. */
  readonly rasterize: (svg: string, view: View) => Promise<ArtboardRaster>;
  /** Puts a freshly rasterised artboard on the car. */
  readonly apply: (view: View, raster: ArtboardRaster) => void;
  /** Called with every artboard that currently fails, whenever that set may have changed. */
  readonly report?: (problems: ReadonlyMap<View, string>) => void;
}

/**
 * Keeps the car's artboards in step with a design's SVG sources. Only artboards whose
 * text changed are rasterised again; a late result never replaces a newer one; and an
 * artboard that fails keeps whatever was applied for it before.
 */
export function createArtboardLoader({ rasterize, apply, report }: ArtboardLoaderOptions) {
  const current = new Map<View, string | undefined>();
  const tickets = new Map<View, number>();
  const problems = new Map<View, string>();

  async function refresh(view: View, svg: string | undefined): Promise<void> {
    const ticket = (tickets.get(view) ?? 0) + 1;
    tickets.set(view, ticket);
    let problem: string | undefined;
    try {
      if (svg === undefined) throw new Error("file not found");
      const raster = await rasterize(svg, view);
      // A newer save has taken over while this one was rasterising.
      if (tickets.get(view) !== ticket) return;
      apply(view, raster);
    } catch (error) {
      if (tickets.get(view) !== ticket) return;
      problem = error instanceof Error ? error.message : String(error);
    }
    if (problem === undefined) problems.delete(view);
    else problems.set(view, problem);
    report?.(problems);
  }

  return {
    /** Brings the car up to date with `sources`; resolves when every change is settled. */
    async update(sources: DesignSources): Promise<void> {
      const changed = VIEWS.filter((view) => {
        const known = current.has(view);
        const svg = sources[view];
        if (known && current.get(view) === svg) return false;
        current.set(view, svg);
        return true;
      });
      // One at a time: rasterising a large artboard is heavy, and frames should keep
      // flowing between them.
      for (const view of changed) await refresh(view, sources[view]);
    },
  };
}
