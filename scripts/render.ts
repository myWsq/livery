/**
 * Renders the lit car to a PNG without a browser.
 *
 *   pnpm render [--design name] [--env id] [--out file.png]
 *     [--yaw deg] [--pitch deg] [--distance metres] [--width px] [--height px]
 *     [--turn deg] [--exposure n] [--heading deg] [--capture-height metres]
 *     [--ground-radius metres]
 *
 * `--env` names the lighting environment of `src/environments.ts` (default `day`),
 * and `--turn` turns it about the car by that many degrees on top of its heading
 * (default 0). `--exposure`, `--heading`, `--capture-height` and `--ground-radius`
 * override that environment's settings for this run only, to tune them by eye before
 * writing them into `src/environments.ts`.
 *
 * Angles are in degrees: yaw 90 looks at the nose, 0 at the car's right side, 180 at
 * its left, 270 at the tail; pitch 0 is level with the car and 90 straight down.
 * Distance is from the car's centre. Without them the view is the one the workshop
 * opens with. `--out` is relative to the directory the command is run from and
 * defaults to `livery-<design>-<env>.png` in the system's temporary directory. Prints
 * the file it wrote. A value that is not a number, or a width or height that is not a
 * positive whole number, ends the script with a message naming the option; so does a
 * `--design` that names no design under `designs/`, or an `--env` that names no
 * environment, with a message listing the ones there are.
 */
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { frame, init, target } from "vgpu/node";

import { artboardPath } from "../src/artboards.ts";
import { cameraView, initialOrbit } from "../src/camera.ts";
import { loadCarModel } from "../src/car/index.ts";
import { ENVIRONMENTS, environmentById } from "../src/environments.ts";
import { aspectOf, createScene, render, setEnvironmentTurn } from "../src/scene.ts";
import { applyDesign, listDesigns } from "./lib/design.ts";
import { applyEnvironment } from "./lib/environment.ts";
import { writePng } from "./lib/png.ts";
import { loadSceneShaders } from "./lib/shaders.ts";

function readOptions() {
  try {
    return parseArgs({
      options: {
        design: { type: "string", default: "calibration" },
        env: { type: "string", default: "day" },
        out: { type: "string" },
        yaw: { type: "string" },
        pitch: { type: "string" },
        distance: { type: "string" },
        width: { type: "string", default: "1600" },
        height: { type: "string", default: "900" },
        turn: { type: "string", default: "0" },
        exposure: { type: "string" },
        heading: { type: "string" },
        "capture-height": { type: "string" },
        "ground-radius": { type: "string" },
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
const environment = environmentById(values.env);
if (!environment) {
  const ids = ENVIRONMENTS.map(({ id }) => id).join(", ");
  console.error(`render: no environment named "${values.env}"; environments: ${ids}`);
  process.exit(2);
}
const turn = radians(numberOption("turn", values.turn));
/** An environment setting: the option's value when it is given, else the environment's. */
const setting = (option: string, value: string | undefined, fallback: number) =>
  value === undefined ? fallback : numberOption(option, value);
const settings = {
  exposure: setting("exposure", values.exposure, environment.settings.exposure),
  heading: setting("heading", values.heading, environment.settings.heading),
  captureHeight: setting(
    "capture-height",
    values["capture-height"],
    environment.settings.captureHeight,
  ),
  groundRadius: setting(
    "ground-radius",
    values["ground-radius"],
    environment.settings.groundRadius,
  ),
};

const gpu = await init();
try {
  const output = target(gpu, { size });
  const scene = await createScene(gpu, output, await loadSceneShaders(), loadCarModel());
  applyEnvironment(gpu, scene, environment, settings);
  setEnvironmentTurn(scene, turn);
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
      ? join(tmpdir(), `livery-${values.design}-${environment.id}.png`)
      : resolve(process.env.INIT_CWD ?? process.cwd(), values.out);
  writePng(file, size[0], size[1], pixels);
  console.log(file);
} finally {
  gpu.dispose();
}
