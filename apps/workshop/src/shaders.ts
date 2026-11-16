/**
 * The scene's shaders as the Vite loader prepares them. Browser only: Node loads the
 * same files through `resolveShader()` (see `scripts/lib/shaders.ts`).
 */
import blur from "./blur.wgsl";
import car from "./car.wgsl";
import ground from "./ground.wgsl";
import present from "./present.wgsl";
import type { SceneShaders } from "./scene.ts";
import seams from "./seams.wgsl";
import sky from "./sky.wgsl";

export const sceneShaders: SceneShaders = { car, seams, ground, present, sky, blur };
