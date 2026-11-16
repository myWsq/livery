/** Orthographic renders of the car aligned to an artboard, read back as raw values. */
import { frame, type Gpu } from "vgpu";

import { SURFACE_CLASSES, type SurfaceClass } from "../../src/car/index.ts";
import { orthographicView, VIEWS, type ArtboardFrame, type View } from "../../src/frames.ts";
import { createSceneTarget, renderCar, type CarPassOptions, type Scene } from "../../src/scene.ts";

/**
 * Renders the car as seen through an artboard's frame, `scale` pixels per millimetre,
 * and returns the scene target's values: four floats per pixel, rows from the top.
 */
export async function renderAligned(
  gpu: Gpu,
  scene: Scene,
  artboard: Omit<ArtboardFrame, "view">,
  scale: number,
  options: CarPassOptions,
): Promise<{ width: number; height: number; values: Float32Array }> {
  const width = Math.round(artboard.width * scale);
  const height = Math.round(artboard.height * scale);
  const sceneTarget = createSceneTarget(gpu, [width, height]);
  try {
    frame(gpu, (currentFrame) =>
      renderCar(currentFrame, scene, sceneTarget, orthographicView(artboard), options),
    );
    const values = await sceneTarget.color.readFloats({ mipLevel: 0, region: "all" });
    return { width, height, values };
  } finally {
    sceneTarget.destroy();
  }
}

/** What the car shader's `surface` output says about one pixel. */
export interface SurfaceSample {
  /** A panel seam drawn over the car. */
  readonly seam: boolean;
  readonly surface: SurfaceClass;
  /** The artboard the fragment selected, if any. */
  readonly artboard: View | undefined;
}

/**
 * The integer the `surface` output packs into its alpha channel (see OUTPUT_SURFACE
 * in car.wgsl): 0 where no fragment was drawn, 64 on a panel seam.
 */
export function surfaceCode(alpha: number): number {
  return Math.min(64, Math.max(0, Math.round(alpha * 64)));
}

const SAMPLES: (SurfaceSample | undefined)[] = Array.from({ length: 65 }, (_, code) => {
  if (code === 0) return undefined;
  if (code === 64) return { seam: true, surface: "paint", artboard: undefined };
  const artboard = ((code - 1) % 8) - 1;
  return {
    seam: false,
    surface: SURFACE_CLASSES[(code - 1) >> 3],
    artboard: artboard < 0 ? undefined : VIEWS[artboard],
  };
});

/** What a surface code says; undefined where no fragment was drawn. */
export function decodeSurface(code: number): SurfaceSample | undefined {
  return SAMPLES[code];
}
