/**
 * Renders the lit car to a PNG without a browser.
 *
 *   pnpm --filter @livery/workshop render [--design name] [--out file.png]
 *     [--yaw deg] [--pitch deg] [--distance metres] [--width px] [--height px]
 *
 * Angles are in degrees: yaw 90 looks at the nose, 0 at the car's right side, 180 at
 * its left, 270 at the tail; pitch 0 is level with the car and 90 straight down.
 * Distance is from the car's centre. Without them the view is the one the workshop
 * opens with. `--out` is relative to the directory the command is run from and
 * defaults to a file in the system's temporary directory. Prints the file it wrote.
 */
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { frame, init, target } from "vgpu/node";

import { artboardPath } from "../src/artboards.ts";
import { cameraView, initialOrbit } from "../src/camera.ts";
import { loadCarModel } from "../src/car/index.ts";
import { aspectOf, createScene, render } from "../src/scene.ts";
import { applyDesign } from "./lib/design.ts";
import { writePng } from "./lib/png.ts";
import { loadSceneShaders } from "./lib/shaders.ts";

const { values } = parseArgs({
  options: {
    design: { type: "string", default: "calibration" },
    out: { type: "string" },
    yaw: { type: "string" },
    pitch: { type: "string" },
    distance: { type: "string" },
    width: { type: "string", default: "1600" },
    height: { type: "string", default: "900" },
  },
});

const orbit = initialOrbit();
const radians = (degrees: string) => (Number(degrees) * Math.PI) / 180;
if (values.yaw !== undefined) orbit.yaw = radians(values.yaw);
if (values.pitch !== undefined) orbit.pitch = radians(values.pitch);
if (values.distance !== undefined) orbit.distance = Number(values.distance);
const size: [number, number] = [Number(values.width), Number(values.height)];

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
