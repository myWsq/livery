/** Reads a design from the repository and puts it on the car, in Node. */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Gpu } from "vgpu";

import {
  artboardPath,
  createArtboardLoader,
  type ArtboardRaster,
  type DesignSources,
} from "../../src/artboards.ts";
import { VIEWS, type View } from "../../src/frames.ts";
import { setArtboard, type Scene } from "../../src/scene.ts";
import { rasterizeArtboard } from "./rasterize.ts";

/** The repository root, where `designs/` lives. */
export const REPOSITORY = fileURLToPath(new URL("../../../../", import.meta.url));

export function readDesign(design: string): DesignSources {
  const sources: DesignSources = {};
  for (const view of VIEWS) {
    const file = `${REPOSITORY}${artboardPath(design, view)}`;
    if (existsSync(file)) sources[view] = readFileSync(file, "utf8");
  }
  return sources;
}

/**
 * Rasterises a design and applies it to the scene. Returns the rasters it applied and
 * the artboards that failed, by view.
 */
export async function applyDesign(gpu: Gpu, scene: Scene, design: string) {
  const rasters = new Map<View, ArtboardRaster>();
  let problems: ReadonlyMap<View, string> = new Map();
  const loader = createArtboardLoader({
    rasterize: rasterizeArtboard,
    apply: (view, raster) => {
      setArtboard(gpu, scene, view, raster);
      rasters.set(view, raster);
    },
    report: (current) => (problems = current),
  });
  await loader.update(readDesign(design));
  return { rasters, problems };
}
