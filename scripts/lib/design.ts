/** Reads designs from the repository and puts one on the car, in Node. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Gpu } from "vgpu";

import { artboardPath, type ArtboardRaster, type DesignSources } from "../../src/artboards.ts";
import { VIEWS, type View } from "../../src/frames.ts";
import type { Scene } from "../../src/scene.ts";
import { createWardrobe, isDesignName } from "../../src/wardrobe.ts";
import { rasterizeArtboard } from "./rasterize.ts";

/** The repository root, where `designs/` lives. */
export const REPOSITORY = fileURLToPath(new URL("../../", import.meta.url));

export function readDesign(design: string): DesignSources {
  const sources: DesignSources = {};
  for (const view of VIEWS) {
    const file = `${REPOSITORY}${artboardPath(design, view)}`;
    if (existsSync(file)) sources[view] = readFileSync(file, "utf8");
  }
  return sources;
}

/**
 * The designs in the repository, sorted by name: every directory under `designs/`
 * whose name is a design name and that holds at least one artboard.
 */
export function listDesigns(): string[] {
  return (
    readdirSync(`${REPOSITORY}designs`, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isDesignName(entry.name))
      .map((entry) => entry.name)
      .filter((design) =>
        VIEWS.some((view) => existsSync(`${REPOSITORY}${artboardPath(design, view)}`)),
      )
      // Plain code-unit order, the same order the browser lists them in.
      .sort()
  );
}

/**
 * Rasterises a design and puts it on the scene. Resolves once every artboard has
 * settled, with the raster of each view that has film and the artboards that failed,
 * by view. The film stays on the car for as long as the GPU lives.
 */
export async function applyDesign(gpu: Gpu, scene: Scene, design: string) {
  const rasters = new Map<View, ArtboardRaster>();
  let problems: ReadonlyMap<View, string> = new Map();
  const wardrobe = createWardrobe(gpu, scene, {
    rasterize: rasterizeArtboard,
    report: (_worn, current) => (problems = current),
    onFilm: (_design, view, raster) => rasters.set(view, raster),
  });
  wardrobe.wear(design);
  wardrobe.setDesigns(new Map([[design, readDesign(design)]]));
  await wardrobe.settled();
  return { rasters, problems };
}
