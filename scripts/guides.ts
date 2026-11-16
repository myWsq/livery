/**
 * Renders the guide images: one orthographic drawing of the car per artboard, aligned
 * exactly to the artboard's frame, to draw a design over.
 *
 *   pnpm guides
 *
 * Writes designs/_guides/<view>.png. Run it again whenever the car model changes.
 * It reads only the car model contract.
 */
import { mkdirSync } from "node:fs";

import { init, target } from "vgpu/node";

import type { SurfaceClass } from "../src/car/index.ts";
import { FRAMES, VIEWS } from "../src/frames.ts";
import { createScene } from "../src/scene.ts";
import { decodeSurface, renderAligned, surfaceCode } from "./lib/aligned.ts";
import { readCarModel } from "./lib/car.ts";
import { REPOSITORY } from "./lib/design.ts";
import { writePng } from "./lib/png.ts";
import { loadSceneShaders } from "./lib/shaders.ts";

/** Guide pixels per artboard millimetre. */
const SCALE = 0.5;
/** The car is rendered this many times larger, then averaged down. */
const SUPERSAMPLE = 2;

type Tone = readonly [number, number, number];
const BACKGROUND: Tone = [255, 255, 255];
const OUTLINE: Tone = [84, 90, 100];
const SEAM: Tone = [112, 118, 128];
/** Flat, light tones: glass, wheels, lights and trim read against paint. */
const TONES: Record<SurfaceClass, Tone> = {
  paint: [228, 231, 236],
  glass: [164, 198, 228],
  wheel: [158, 160, 166],
  light: [250, 208, 122],
  trim: [124, 128, 136],
};

const gpu = await init();
try {
  const scene = await createScene(
    gpu,
    target(gpu, { size: [8, 8] }),
    await loadSceneShaders(),
    readCarModel(),
  );
  const directory = `${REPOSITORY}designs/_guides`;
  mkdirSync(directory, { recursive: true });

  for (const view of VIEWS) {
    const { width, height, values } = await renderAligned(
      gpu,
      scene,
      FRAMES[view],
      SCALE * SUPERSAMPLE,
      { output: "surface", seamPixels: 1.5 * SUPERSAMPLE },
    );

    // One code per pixel: 0 background, 1..5 a surface class, 6 a seam.
    const codes = new Uint8Array(width * height);
    for (let i = 0; i < codes.length; i++) {
      const sample = decodeSurface(surfaceCode(values[i * 4 + 3]));
      if (!sample) continue;
      codes[i] = sample.seam ? 6 : 1 + Object.keys(TONES).indexOf(sample.surface);
    }
    const tones = [BACKGROUND, ...Object.values(TONES), SEAM];

    // Outline wherever the class changes: the silhouette and every part boundary.
    const outline = new Uint8Array(width * height);
    const reach = SUPERSAMPLE;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const code = codes[y * width + x];
        if (code === 6) continue;
        const right = x + 1 < width ? codes[y * width + x + 1] : code;
        const below = y + 1 < height ? codes[(y + 1) * width + x] : code;
        if ((right === code || right === 6) && (below === code || below === 6)) continue;
        for (let dy = -reach + 1; dy <= reach; dy++) {
          for (let dx = -reach + 1; dx <= reach; dx++) {
            const ox = x + dx;
            const oy = y + dy;
            if (ox >= 0 && ox < width && oy >= 0 && oy < height) outline[oy * width + ox] = 1;
          }
        }
      }
    }

    // Average down to the guide's size.
    const guideWidth = width / SUPERSAMPLE;
    const guideHeight = height / SUPERSAMPLE;
    const rgba = new Uint8Array(guideWidth * guideHeight * 4);
    for (let y = 0; y < guideHeight; y++) {
      for (let x = 0; x < guideWidth; x++) {
        const sum = [0, 0, 0];
        for (let sy = 0; sy < SUPERSAMPLE; sy++) {
          for (let sx = 0; sx < SUPERSAMPLE; sx++) {
            const i = (y * SUPERSAMPLE + sy) * width + x * SUPERSAMPLE + sx;
            const tone = outline[i] ? OUTLINE : tones[codes[i]];
            sum[0] += tone[0];
            sum[1] += tone[1];
            sum[2] += tone[2];
          }
        }
        const at = (y * guideWidth + x) * 4;
        const samples = SUPERSAMPLE * SUPERSAMPLE;
        rgba[at] = Math.round(sum[0] / samples);
        rgba[at + 1] = Math.round(sum[1] / samples);
        rgba[at + 2] = Math.round(sum[2] / samples);
        rgba[at + 3] = 255;
      }
    }
    const file = `${directory}/${view}.png`;
    writePng(file, guideWidth, guideHeight, rgba);
    console.log(file);
  }
} finally {
  gpu.dispose();
}
