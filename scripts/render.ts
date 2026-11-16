/**
 * Renders the lit car to a PNG without a browser.
 *
 *   pnpm render [--design name] [--out file.png]
 *     [--yaw deg] [--pitch deg] [--distance metres] [--width px] [--height px]
 *
 * Angles are in degrees: yaw 90 looks at the nose, 0 at the car's right side, 180 at
 * its left, 270 at the tail; pitch 0 is level with the car and 90 straight down.
 * Distance is from the car's centre. Without them the view is the one the workshop
 * opens with. `--out` is relative to the directory the command is run from and
 * defaults to a file in the system's temporary directory. Prints the file it wrote.
 * A value that is not a number, or a width or height that is not a positive whole
 * number, ends the script with a message naming the option; so does a `--design` that
 * names no design under `designs/`, with a message listing the ones there are.
 */
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { frame, init, target } from "vgpu/node";

import { artboardPath } from "../src/artboards.ts";
import { cameraView, initialOrbit } from "../src/camera.ts";
import { loadCarModel } from "../src/car/index.ts";
import { aspectOf, createScene, render } from "../src/scene.ts";
import { applyDesign, listDesigns } from "./lib/design.ts";
import { writePng } from "./lib/png.ts";
import { loadSceneShaders } from "./lib/shaders.ts";

function readOptions() {
  try {
    return parseArgs({
      options: {
        design: { type: "string", default: "calibration" },
        out: { type: "string" },
        yaw: { type: "string" },
        pitch: { type: "string" },
        distance: { type: "string" },
        width: { type: "string", default: "1600" },
        height: { type: "string", default: "900" },
      },
    }).values;
  } catch (error) {
    // The parser's own complaint (an unknown option, or a value starting with a dash
    // that must be written as --yaw=-30), on one line like the checks below.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`render: ${message.replace(/\s*\n\s*/g, " ")}`);
    process.exit(2);
  }
}

const values = readOptions();

/** Ends the script over a bad option, before anything is rendered. */
function reject(option: string, value: string, wanted: string): never {
  console.error(`render: --${option} must be ${wanted}, got "${value}"`);
  process.exit(2);
}

function numberOption(option: string, value: string): number {
  // Number("") is 0, so an empty value is checked for separately.
  const number = value.trim() === "" ? Number.NaN : Number(value);
  if (!Number.isFinite(number)) reject(option, value, "a number");
  return number;
}

function pixelsOption(option: string, value: string): number {
  const number = value.trim() === "" ? Number.NaN : Number(value);
  if (!Number.isInteger(number) || number <= 0) reject(option, value, "a positive whole number");
  return number;
}

const orbit = initialOrbit();
const radians = (degrees: number) => (degrees * Math.PI) / 180;
if (values.yaw !== undefined) orbit.yaw = radians(numberOption("yaw", values.yaw));
if (values.pitch !== undefined) orbit.pitch = radians(numberOption("pitch", values.pitch));
if (values.distance !== undefined) orbit.distance = numberOption("distance", values.distance);
const size: [number, number] = [
  pixelsOption("width", values.width),
  pixelsOption("height", values.height),
];
const designs = listDesigns();
if (!designs.includes(values.design)) {
  console.error(`render: no design named "${values.design}"; designs: ${designs.join(", ")}`);
  process.exit(2);
}

const gpu = await init();
try {
  const output = target(gpu, { size });
  const scene = await createScene(gpu, output, await loadSceneShaders(), loadCarModel());
  const { problems } = await applyDesign(gpu, scene, values.design);
  for (const [view, problem] of problems) {
    console.error(`${artboardPath(values.design, view)}: ${problem}`);
  }
  frame(gpu, (currentFrame) =>
    render(currentFrame, scene, output, cameraView(orbit, aspectOf(output), scene.bounds)),
  );
  const pixels = await output.color.read({ mipLevel: 0, region: "all" });
  const file =
    values.out === undefined
      ? join(tmpdir(), `livery-${values.design}.png`)
      : resolve(process.env.INIT_CWD ?? process.cwd(), values.out);
  writePng(file, size[0], size[1], pixels);
  console.log(file);
} finally {
  gpu.dispose();
}
