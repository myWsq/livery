/**
 * Reads a lighting photograph and its detail image from the repository and puts them
 * on the scene, in Node.
 */
import { readFileSync } from "node:fs";

import type { Gpu } from "vgpu";

import type { Environment, EnvironmentSettings } from "../../src/environments.ts";
import { decodeHdr } from "../../src/hdr.ts";
import {
  createDetailTexture,
  createEnvironmentTexture,
  setBackdropDetail,
  setEnvironment,
  type DetailImage,
  type Scene,
} from "../../src/scene.ts";
import { REPOSITORY } from "./design.ts";
import { decodeJpeg, type DecodedJpeg } from "./rasterize.ts";

/**
 * Lights the scene with an environment's photograph, fitted by `settings` (by default
 * the environment's own), and gives the backdrop the detail of its detail image. The
 * textures stay on the scene for as long as the GPU lives.
 */
export function applyEnvironment(
  gpu: Gpu,
  scene: Scene,
  environment: Environment,
  settings: EnvironmentSettings = environment.settings,
): void {
  const image = readEnvironmentFile(environment.file, decodeHdr);
  setEnvironment(scene, createEnvironmentTexture(gpu, scene, image), settings);
  const detail = readEnvironmentFile(environment.backdrop, decodeJpeg);
  setBackdropDetail(scene, createDetailTexture(gpu, scene, detailImageOf(gpu, detail)));
}

/** Reads and decodes a file under `environments/`; an error names the file. */
function readEnvironmentFile<T>(file: string, decode: (bytes: Uint8Array) => T): T {
  const path = `environments/${file}`;
  try {
    return decode(readFileSync(`${REPOSITORY}${path}`));
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

/** A decoded detail image as the scene takes it: Node writes its bytes into the texture. */
function detailImageOf(gpu: Gpu, { width, height, pixels }: DecodedJpeg): DetailImage {
  return {
    width,
    height,
    writeLevel0: (texture) =>
      gpu.gpu.queue.writeTexture(
        { texture: texture.gpu, mipLevel: 0 },
        pixels,
        { bytesPerRow: width * 4, rowsPerImage: height },
        [width, height, 1],
      ),
  };
}
