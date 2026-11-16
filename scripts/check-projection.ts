/**
 * Proves the livery projection from pixels, for the `calibration` design.
 *
 *   pnpm check:projection
 *
 * Exits 0 only when every assertion holds, and prints the ones that fail otherwise.
 *
 * Two things are proven, by two parts:
 *
 * 1. The frame definition is the agreed one. `FRAMES`, `toArtboard` and `viewFacing`
 *    are compared with literal expectations written in this file (`EXPECTED_FRAMES`,
 *    `EXPECTED_FACING`). Everything else here, the shader included, derives from
 *    `frames.ts`, so without this part a wrong sign, offset, size or facing there
 *    would pass unnoticed.
 * 2. The shader follows that definition. The car is rendered orthographically through
 *    each artboard's frame with the paint shader's debug outputs, so a pixel of the
 *    render is the artboard pixel that should land there. What the render must show
 *    is worked out here in TypeScript, from the rasterised artboard and the frame
 *    definition, never from the shader's own code. Both sides come from Node: the
 *    render and the resvg raster it is compared with.
 */
import { init, target, type Gpu } from "vgpu/node";

import { TEXELS_PER_MM, type ArtboardRaster } from "../src/artboards.ts";
import { loadCarModel, type CarModel } from "../src/car/index.ts";
import {
  FRAMES,
  toArtboard,
  viewFacing,
  VIEWS,
  type ArtboardFrame,
  type View,
} from "../src/frames.ts";
import { createScene, type Scene } from "../src/scene.ts";
import { decodeSurface, renderAligned, surfaceCode, type SurfaceSample } from "./lib/aligned.ts";
import { applyDesign } from "./lib/design.ts";
import { loadSceneShaders } from "./lib/shaders.ts";

const DESIGN = "calibration";

/** Largest difference allowed between a rendered and an expected channel, in 8-bit steps. */
const TOLERANCE = 2;
/**
 * On top of that, the share of the contrast between an artboard pixel and its eight
 * neighbours that a rendered pixel may be off by: a fiftieth of a texel of sampling
 * error, which can only show where the artboard has a hard edge. Measured on this
 * machine, every compared pixel is within 1.5/255 except one, 2.7/255 off on an edge
 * of contrast 176 (1.5% of a texel) where the body mesh has a 3 mm sliver beside the
 * front wheel arch; where the artboard is locally flat the largest difference is
 * 0.2/255. A projection that is off by half a millimetre fails at every edge.
 */
const EDGE_SLACK = 0.02;
/** Normals this close to a tie between two axes are left out of the selection test. */
const TIE_MARGIN = 0.02;
/** Fewest pixels of an artboard that must be compared for the comparison to count. */
const MIN_COMPARED = 50_000;
/** Fewest compared pixels that must lie on grid lines or text, and on coloured markers. */
const MIN_INK = 5_000;
const MIN_MARKER = 1_000;
/** Fewest downward-facing paint pixels the underside view must find. */
const MIN_DOWNWARD = 500;

/** A view of the car from straight below, for the surfaces that must stay bare. */
const UNDERSIDE: Omit<ArtboardFrame, "view"> = {
  width: 5200,
  height: 2400,
  u: [-1000, 0, 0, 2600],
  v: [0, 0, 1000, 1200],
  facing: [0, -1, 0],
};

/**
 * The agreed frame definition, as this check expects it. This is deliberately a second
 * statement of the numbers in `frames.ts`: it is the test's expectation, so it is
 * written out as literals and must never be imported from `frames.ts`, computed from
 * `FRAMES`, or derived from anything the shader also reads.
 *
 * Per view: the artboard's size in millimetres, and where two car-frame points land
 * on it, in millimetres (u to the right, v down). Every coordinate of both points is
 * non-zero, so any single wrong sign, scale or offset moves at least one of them.
 */
const P1 = [1.5, 0.5, -0.4] as const;
const P2 = [-1.0, 1.0, 0.7] as const;
const EXPECTED_FRAMES: Record<
  View,
  { size: [number, number]; p1: [number, number]; p2: [number, number] }
> = {
  left: { size: [5200, 1800], p1: [1100, 1100], p2: [3600, 600] },
  right: { size: [5200, 1800], p1: [4100, 1100], p2: [1600, 600] },
  top: { size: [5200, 2400], p1: [1100, 1600], p2: [3600, 500] },
  front: { size: [2400, 1800], p1: [1600, 1100], p2: [500, 600] },
  rear: { size: [2400, 1800], p1: [800, 1100], p2: [1900, 600] },
};
/** The artboard a surface facing squarely along each axis takes its livery from. */
const EXPECTED_FACING: [normal: [number, number, number], view: View | undefined][] = [
  [[0, 0, -1], "left"],
  [[0, 0, 1], "right"],
  [[0, 1, 0], "top"],
  [[1, 0, 0], "front"],
  [[-1, 0, 0], "rear"],
  [[0, -1, 0], undefined],
];

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
  console.log(`${condition ? "ok  " : "FAIL"} ${message}`);
}

function srgbToLinear(byte: number): number {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgbByte(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
}

interface AlignedRender {
  readonly width: number;
  readonly height: number;
  /** The surface output's code for each pixel; see `decodeSurface`. */
  readonly codes: Uint8Array;
  /** The film output: premultiplied linear colour and alpha, four floats per pixel. */
  readonly film: Float32Array;
  /** Paint pixels whose selected artboard disagrees with the rule evaluated here. */
  readonly misselected: number;
  /** Paint pixels facing mostly down. */
  readonly downward: readonly number[];
}

/** Renders both debug outputs through a frame and digests the surface output. */
async function renderThrough(
  gpu: Gpu,
  scene: Scene,
  frame: Omit<ArtboardFrame, "view">,
  scale: number,
): Promise<AlignedRender> {
  const surface = await renderAligned(gpu, scene, frame, scale, { output: "surface" });
  const { width, height } = surface;
  const codes = new Uint8Array(width * height);
  const downward: number[] = [];
  let misselected = 0;
  for (let i = 0; i < codes.length; i++) {
    codes[i] = surfaceCode(surface.values[i * 4 + 3]);
    const sample = decodeSurface(codes[i]);
    if (!sample || sample.surface !== "paint") continue;
    const nx = surface.values[i * 4] * 2 - 1;
    const ny = surface.values[i * 4 + 1] * 2 - 1;
    const nz = surface.values[i * 4 + 2] * 2 - 1;
    // How strongly the normal faces each axis direction, strongest first.
    const facings = [nx, -nx, ny, -ny, nz, -nz].sort((a, b) => b - a);
    if (facings[0] - facings[1] < TIE_MARGIN) continue;
    // The selection rule, evaluated here from the frame definition.
    if (sample.artboard !== viewFacing([nx, ny, nz])) misselected++;
    if (-ny === facings[0]) downward.push(i);
  }
  const film = (await renderAligned(gpu, scene, frame, scale, { output: "film" })).values;
  return { width, height, codes, film, misselected, downward };
}

/** Counts pixels of an unpainted class, or without a selected artboard, that carry film. */
function strayFilm(render: AlignedRender): number {
  let stray = 0;
  for (let i = 0; i < render.codes.length; i++) {
    const sample = decodeSurface(render.codes[i]);
    if (!sample) continue;
    const filmed = render.film[i * 4 + 3] > 0 || render.film[i * 4] > 0;
    const mayCarryFilm = sample.surface === "paint" && sample.artboard !== undefined;
    if (filmed && !mayCarryFilm) stray++;
    if (sample.surface !== "paint" && sample.artboard !== undefined) stray++;
  }
  return stray;
}

/** Every pixel that selected `view` must show the artboard pixel under it. */
function compareWithArtboard(view: View, render: AlignedRender, raster: ArtboardRaster): void {
  // What the film output should hold for an artboard pixel: linear colour
  // premultiplied by alpha, here sRGB-encoded so that differences are in 8-bit steps.
  const expectedAt = (pixel: number, channel: number): number => {
    const alpha = raster.data[pixel * 4 + 3];
    if (channel === 3) return alpha;
    return linearToSrgbByte(srgbToLinear(raster.data[pixel * 4 + channel]) * (alpha / 255));
  };
  // The largest step from an artboard pixel to any of its eight neighbours.
  const contrastAt = (pixel: number): number => {
    const x = pixel % raster.width;
    const y = (pixel - x) / raster.width;
    let contrast = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= raster.width || ny >= raster.height) continue;
        for (let channel = 0; channel < 4; channel++) {
          const step = expectedAt(ny * raster.width + nx, channel) - expectedAt(pixel, channel);
          contrast = Math.max(contrast, Math.abs(step));
        }
      }
    }
    return contrast;
  };

  let compared = 0;
  let ink = 0;
  let marker = 0;
  let wrong = 0;
  let worst = 0;
  let example = "";
  for (let i = 0; i < render.codes.length; i++) {
    if (decodeSurface(render.codes[i])?.artboard !== view) continue;
    compared++;
    const alpha = raster.data[i * 4 + 3];
    let difference = Math.abs(render.film[i * 4 + 3] * 255 - alpha);
    let brightest = 0;
    let darkest = 255;
    for (let channel = 0; channel < 3; channel++) {
      const byte = raster.data[i * 4 + channel];
      brightest = Math.max(brightest, byte);
      darkest = Math.min(darkest, byte);
      const rendered = linearToSrgbByte(render.film[i * 4 + channel]);
      difference = Math.max(difference, Math.abs(rendered - expectedAt(i, channel)));
    }
    if (alpha === 255) {
      // Markers are the only saturated colours on a calibration artboard.
      if (brightest - darkest > 96) marker++;
      else ink++;
    }
    if (difference > TOLERANCE && difference > TOLERANCE + EDGE_SLACK * contrastAt(i)) {
      wrong++;
      if (difference > worst) {
        worst = difference;
        const x = i % render.width;
        const y = (i - x) / render.width;
        example = `; worst at u=${x} v=${y}: off by ${difference.toFixed(1)}/255`;
      }
    }
  }
  expect(
    wrong === 0,
    `${view}: all ${compared} pixels that selected it match the artboard within ${TOLERANCE}/255 (${wrong} do not${example})`,
  );
  expect(
    compared >= MIN_COMPARED,
    `${view}: at least ${MIN_COMPARED} pixels are compared (${compared})`,
  );
  expect(ink >= MIN_INK, `${view}: grid lines and text are among them (${ink} pixels)`);
  expect(marker >= MIN_MARKER, `${view}: a coloured marker is among them (${marker} pixels)`);
}

/** The surface sample at the artboard position of a car-frame point. */
function sampleAt(
  render: AlignedRender | undefined,
  view: View,
  point: readonly number[],
): SurfaceSample | undefined {
  if (!render) return undefined;
  const [u, v] = toArtboard(FRAMES[view], point);
  const x = Math.floor(u * TEXELS_PER_MM);
  const y = Math.floor(v * TEXELS_PER_MM);
  if (x < 0 || y < 0 || x >= render.width || y >= render.height) return undefined;
  return decodeSurface(render.codes[y * render.width + x]);
}

/**
 * The centre of the paint triangle that lies farthest along `axis` among those facing
 * it squarely. Reads only the car model contract.
 */
function extremePaintPoint(model: CarModel, axis: readonly [number, number, number]): number[] {
  let best: number[] | undefined;
  let bestReach = -Infinity;
  for (const part of model.parts) {
    if (part.surface !== "paint") continue;
    for (let t = 0; t < part.indices.length; t += 3) {
      const centre = [0, 0, 0];
      let facing = 0;
      for (let corner = 0; corner < 3; corner++) {
        const vertex = part.indices[t + corner] * 3;
        for (let k = 0; k < 3; k++) {
          centre[k] += part.positions[vertex + k] / 3;
          facing += (part.normals[vertex + k] * axis[k]) / 3;
        }
      }
      const reach = centre[0] * axis[0] + centre[1] * axis[1] + centre[2] * axis[2];
      if (facing > 0.97 && reach > bestReach) {
        best = centre;
        bestReach = reach;
      }
    }
  }
  if (!best) throw new Error(`the model has no paint facing ${axis.join(", ")}`);
  return best;
}

/** Part 1: the frame definition matches the literal expectations above. */
function checkFrameDefinition(): void {
  const views = Object.keys(EXPECTED_FRAMES) as View[];
  expect(
    VIEWS.length === views.length && views.every((view) => VIEWS.includes(view)),
    `the views are ${views.join(", ")} (${VIEWS.join(", ")})`,
  );
  for (const view of views) {
    const expected = EXPECTED_FRAMES[view];
    const frame: ArtboardFrame | undefined = FRAMES[view];
    if (!frame) {
      expect(false, `${view}: the frame is defined`);
      continue;
    }
    expect(
      frame.width === expected.size[0] && frame.height === expected.size[1],
      `${view}: the artboard is ${expected.size[0]}x${expected.size[1]} mm (${frame.width}x${frame.height})`,
    );
    const points = [
      ["P1", P1, expected.p1],
      ["P2", P2, expected.p2],
    ] as const;
    for (const [name, point, [u, v]] of points) {
      const found = toArtboard(frame, point);
      expect(
        Math.abs(found[0] - u) < 1e-6 && Math.abs(found[1] - v) < 1e-6,
        `${view}: ${name} (${point.join(", ")}) lands at u=${u} v=${v} mm (u=${found[0]} v=${found[1]})`,
      );
    }
  }
  for (const [normal, view] of EXPECTED_FACING) {
    const found = viewFacing(normal);
    expect(
      found === view,
      `a surface facing (${normal.join(", ")}) takes its livery from ${view ?? "no artboard"} (${found ?? "no artboard"})`,
    );
  }
}

checkFrameDefinition();

// Part 2: the shader follows the frame definition.
const gpu = await init();
try {
  const model = loadCarModel();
  const scene = await createScene(
    gpu,
    target(gpu, { size: [8, 8] }),
    await loadSceneShaders(),
    model,
  );
  const { rasters, problems } = await applyDesign(gpu, scene, DESIGN);
  const broken = [...problems].map(([view, problem]) => ` (${view}: ${problem})`).join("");
  expect(
    problems.size === 0 && rasters.size === VIEWS.length,
    `all five artboards of "${DESIGN}" rasterise${broken}`,
  );

  // Through each artboard's frame: the artboard itself, the selection rule, and the
  // classes that must stay bare.
  const renders = new Map<View, AlignedRender>();
  for (const view of VIEWS) {
    const raster = rasters.get(view);
    if (!raster) continue;
    const render = await renderThrough(gpu, scene, FRAMES[view], TEXELS_PER_MM);
    renders.set(view, render);
    expect(
      render.width === raster.width && render.height === raster.height,
      `${view}: the aligned render is the artboard's size (${raster.width}x${raster.height})`,
    );
    compareWithArtboard(view, render, raster);
    expect(
      render.misselected === 0,
      `${view}: every paint fragment selects the artboard its normal's dominant axis faces (${render.misselected} do not)`,
    );
    const stray = strayFilm(render);
    expect(
      stray === 0,
      `${view}: no glass, wheel, light or trim fragment carries film (${stray} do)`,
    );
  }

  // Named points. The door centres are where the contract puts them: seen through a
  // side artboard, the nearest fragment at that height is the body side on that side
  // of the car. The roof, nose and tail points are found on the model.
  const points: [View, readonly number[], string][] = [
    ["left", [0, 0.6, -1], "the door centre on the left side"],
    ["right", [0, 0.6, 1], "the door centre on the right side"],
    ["top", extremePaintPoint(model, [0, 1, 0]), "the highest roof point"],
    ["front", extremePaintPoint(model, [1, 0, 0]), "the foremost nose point"],
    ["rear", extremePaintPoint(model, [-1, 0, 0]), "the rearmost tail point"],
  ];
  for (const [view, point, what] of points) {
    const sample = sampleAt(renders.get(view), view, point);
    const where = point.map((value) => value.toFixed(2)).join(", ");
    const found = sample ? `${sample.surface}, ${sample.artboard ?? "none"}` : "nothing drawn";
    expect(
      sample?.surface === "paint" && sample.artboard === view,
      `${what} (${where}) is paint and selects ${view} (${found})`,
    );
  }

  // From below: nothing that faces mostly down carries film.
  const underside = await renderThrough(gpu, scene, UNDERSIDE, 0.5);
  let downwardWithFilm = 0;
  for (const i of underside.downward) {
    const selected = decodeSurface(underside.codes[i])?.artboard;
    if (selected !== undefined || underside.film[i * 4 + 3] > 0) downwardWithFilm++;
  }
  expect(
    underside.downward.length >= MIN_DOWNWARD,
    `underside: at least ${MIN_DOWNWARD} paint pixels face mostly down (${underside.downward.length})`,
  );
  expect(
    downwardWithFilm === 0,
    `underside: no fragment facing mostly down carries film (${downwardWithFilm} do)`,
  );
  expect(
    underside.misselected === 0,
    `underside: every paint fragment selects the artboard its normal's dominant axis faces (${underside.misselected} do not)`,
  );
  const stray = strayFilm(underside);
  expect(
    stray === 0,
    `underside: no glass, wheel, light or trim fragment carries film (${stray} do)`,
  );
} finally {
  gpu.dispose();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} assertion(s) failed:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log("\nThe projection holds.");
}
