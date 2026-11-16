/** Reads a lighting photograph from the repository and puts it on the scene, in Node. */
import { readFileSync } from "node:fs";

import type { Gpu } from "vgpu";

import type { Environment, EnvironmentSettings } from "../../src/environments.ts";
import { decodeHdr, type HdrImage } from "../../src/hdr.ts";
import { createEnvironmentTexture, setEnvironment, type Scene } from "../../src/scene.ts";
import { REPOSITORY } from "./design.ts";

/**
 * Lights the scene with an environment's photograph, fitted by `settings` (by default
 * the environment's own). The texture stays on the scene for as long as the GPU lives.
 */
export function applyEnvironment(
  gpu: Gpu,
  scene: Scene,
  environment: Environment,
  settings: EnvironmentSettings = environment.settings,
): void {
  const path = `environments/${environment.file}`;
  let image: HdrImage;
  try {
    image = decodeHdr(readFileSync(`${REPOSITORY}${path}`));
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
  setEnvironment(scene, createEnvironmentTexture(gpu, scene, image), settings);
}
