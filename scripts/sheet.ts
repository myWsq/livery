/**
 * Renders a comparison sheet without a browser: several designs, each from the same
 * named camera positions, side by side in one PNG.
 *
 *   pnpm sheet [--design a,b,…] [--env id] [--views id,id,…]
 *     [--width px] [--height px] [--out file.png]
 *
 * `--design` lists the designs to compare, one row each, in the order given (default:
 * every design under `designs/`); `_bare` stands for the bare car. `--env` names the
 * lighting environment of `src/environments.ts` (default `day`). `--views` lists the
 * shots of `src/shots.ts`, one column each (default `front,left,rear,above`).
 * `--width` and `--height` are the size of one cell in pixels (default 640 × 370).
 * `--out` is relative to the directory the command is run from and defaults to
 * `livery-sheet-<env>.png` in the system's temporary directory. Prints the file it
 * wrote. An artboard that cannot be shown is reported on stderr, and the sheet is
 * still written. A width or height that is not a positive whole number ends the
 * script with a message naming the option; so does a design, environment or view
 * that does not exist, with a message listing the ones there are.
 */
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { Resvg } from "@resvg/resvg-js";
import { frame, init, target } from "vgpu/node";

import { artboardPath } from "../src/artboards.ts";
import { cameraView } from "../src/camera.ts";
import { ENVIRONMENTS, environmentById } from "../src/environments.ts";
import { aspectOf, createScene, render } from "../src/scene.ts";
import { DEFAULT_SHOTS, orbitOf, SHOTS, shotById, type Shot } from "../src/shots.ts";
import { BARE_CAR } from "../src/wardrobe.ts";
import { readCarModel } from "./lib/car.ts";
import { applyDesign, listDesigns } from "./lib/design.ts";
import { applyEnvironment } from "./lib/environment.ts";
import { encodePng, writePng } from "./lib/png.ts";
import { loadSceneShaders } from "./lib/shaders.ts";

/** Space around the sheet and between cells, in pixels. */
const MARGIN = 16;
const GAP = 6;
/** Height of the header row of shot names. */
const HEADER = 40;
/** Text size, and the padding either side of a label. */
const FONT_SIZE = 18;
const LABEL_PAD = 16;
const BACKGROUND = "#16181c";
const TEXT = "#c9ced6";
/** Generic sans-serif, after faces that hold the Chinese shot names. */
const FONT_FAMILY = "'PingFang SC', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif";

function readOptions() {
  try {
    return parseArgs({
      options: {
        design: { type: "string" },
        env: { type: "string", default: "day" },
        views: { type: "string" },
        width: { type: "string", default: "640" },
        height: { type: "string", default: "370" },
        out: { type: "string" },
      },
    }).values;
  } catch (error) {
    // The parser's own complaint (an unknown option, or a missing value), on one line
    // like the checks below.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`sheet: ${message.replace(/\s*\n\s*/g, " ")}`);
    process.exit(2);
  }
}

const values = readOptions();

/** Ends the script over a bad option, before anything is rendered. */
function fail(message: string): never {
  console.error(`sheet: ${message}`);
  process.exit(2);
}

function pixelsOption(option: string, value: string): number {
  // Number("") is 0, so an empty value is checked for separately.
  const number = value.trim() === "" ? Number.NaN : Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    fail(`--${option} must be a positive whole number, got "${value}"`);
  }
  return number;
}

/** A comma-separated list, each item trimmed. */
const listOf = (value: string) => value.split(",").map((item) => item.trim());

const size: [number, number] = [
  pixelsOption("width", values.width),
  pixelsOption("height", values.height),
];
const known = listDesigns();
const designs = values.design === undefined ? known : listOf(values.design);
for (const design of designs) {
  if (design !== BARE_CAR && !known.includes(design)) {
    fail(`no design named "${design}"; designs: ${[...known, BARE_CAR].join(", ")}`);
  }
}
const environment = environmentById(values.env);
if (!environment) {
  const ids = ENVIRONMENTS.map(({ id }) => id).join(", ");
  fail(`no environment named "${values.env}"; environments: ${ids}`);
}
const shots: Shot[] = (values.views === undefined ? DEFAULT_SHOTS : listOf(values.views)).map(
  (id) =>
    shotById(id) ??
    fail(`no view named "${id}"; views: ${SHOTS.map((shot) => shot.id).join(", ")}`),
);

const gpu = await init();
try {
  const output = target(gpu, { size });
  const scene = await createScene(gpu, output, await loadSceneShaders(), readCarModel());
  applyEnvironment(gpu, scene, environment);

  /** Each design's cells, in the order of `shots`, as PNG data URLs. */
  const rows: string[][] = [];
  for (const design of designs) {
    const worn = design === BARE_CAR ? undefined : await applyDesign(gpu, scene, design);
    try {
      for (const [view, problem] of worn?.problems ?? []) {
        console.error(`${artboardPath(design, view)}: ${problem}`);
      }
      const cells: string[] = [];
      for (const shot of shots) {
        frame(gpu, (currentFrame) =>
          render(
            currentFrame,
            scene,
            output,
            cameraView(orbitOf(shot), aspectOf(output), scene.bounds),
          ),
        );
        const pixels = await output.color.read({ mipLevel: 0, region: "all" });
        cells.push(
          `data:image/png;base64,${encodePng(size[0], size[1], pixels).toString("base64")}`,
        );
      }
      rows.push(cells);
    } finally {
      // Back to bare paint, and the film off the GPU, before the next design.
      worn?.release();
    }
  }

  const [cellWidth, cellHeight] = size;
  const labels = designs.map((design) => (design === BARE_CAR ? "裸车" : design));
  // Roughly the widest label at this text size, allowing 0.6 em a character.
  const labelWidth = Math.ceil(
    Math.max(...labels.map((label) => label.length * FONT_SIZE * 0.6)) + 2 * LABEL_PAD,
  );
  const left = MARGIN + labelWidth;
  const top = MARGIN + HEADER;
  const width = left + shots.length * cellWidth + (shots.length - 1) * GAP + MARGIN;
  const height = top + designs.length * cellHeight + (designs.length - 1) * GAP + MARGIN;
  const columnX = (column: number) => left + column * (cellWidth + GAP);
  const rowY = (row: number) => top + row * (cellHeight + GAP);

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${BACKGROUND}"/>`,
    `<g fill="${TEXT}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}">`,
  ];
  shots.forEach((shot, column) => {
    const x = columnX(column) + cellWidth / 2;
    parts.push(
      `<text x="${x}" y="${MARGIN + HEADER / 2 + FONT_SIZE * 0.35}" text-anchor="middle">${escapeXml(shot.name)}</text>`,
    );
  });
  labels.forEach((label, row) => {
    const y = rowY(row) + cellHeight / 2 + FONT_SIZE * 0.35;
    parts.push(`<text x="${MARGIN + LABEL_PAD}" y="${y}">${escapeXml(label)}</text>`);
  });
  parts.push("</g>");
  rows.forEach((cells, row) => {
    cells.forEach((href, column) => {
      parts.push(
        `<image x="${columnX(column)}" y="${rowY(row)}" width="${cellWidth}" height="${cellHeight}" image-rendering="optimizeSpeed" xlink:href="${href}"/>`,
      );
    });
  });
  parts.push("</svg>");

  const image = new Resvg(parts.join(""), {
    fitTo: { mode: "original" },
    font: { loadSystemFonts: true },
  }).render();
  if (image.width !== width || image.height !== height) {
    throw new Error(`rasterised to ${image.width}x${image.height}, expected ${width}x${height}`);
  }
  const file =
    values.out === undefined
      ? join(tmpdir(), `livery-sheet-${environment.id}.png`)
      : resolve(process.env.INIT_CWD ?? process.cwd(), values.out);
  // The background is opaque, so resvg's colour premultiplied by alpha is the colour itself.
  writePng(file, width, height, new Uint8Array(image.pixels));
  console.log(file);
} finally {
  gpu.dispose();
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
