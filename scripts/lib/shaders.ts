/** Loads the scene's shaders in Node, where there is no bundler loader. */
import { fileURLToPath } from "node:url";

import { prepareShader } from "@vgpu/wgsl/prepare";
import { resolveShader } from "@vgpu/wgsl/runtime";
import type { ShaderSource } from "vgpu";

import type { SceneShaders } from "../../src/scene.ts";

async function load(name: string): Promise<ShaderSource> {
  const entry = fileURLToPath(new URL(`../../src/${name}.wgsl`, import.meta.url));
  return prepareShader(await resolveShader({ entry }), entry);
}

export async function loadSceneShaders(): Promise<SceneShaders> {
  const [car, seams, ground, present, sky, blur] = await Promise.all(
    ["car", "seams", "ground", "present", "sky", "blur"].map(load),
  );
  return { car, seams, ground, present, sky, blur };
}
