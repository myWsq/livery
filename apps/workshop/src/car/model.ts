/**
 * The car model contract.
 *
 * Everything downstream of a car model (the scene, the livery projection, the guide
 * images, the projection check) consumes this shape and nothing else, so the model
 * can be swapped without touching them.
 *
 * All coordinates are in the car frame: metres; +X toward the nose, +Y up, +Z toward
 * the car's right; the origin lies on the ground plane under the centre of the car's
 * length and width, and the wheels touch y = 0.
 */

/** What a surface is made of. Only `paint` receives livery. */
export type SurfaceClass = "paint" | "glass" | "wheel" | "light" | "trim";

/** The closed set of surface classes, in the order the renderer numbers them. */
export const SURFACE_CLASSES = [
  "paint",
  "glass",
  "wheel",
  "light",
  "trim",
] as const satisfies readonly SurfaceClass[];

export type Rgb = readonly [red: number, green: number, blue: number];

export interface CarPart {
  readonly name: string;
  readonly surface: SurfaceClass;
  /**
   * Optional base colour of the part, linear RGB in 0..1. It tells apart parts that
   * share a class (a tyre from a rim, a tail light from a headlight). When absent the
   * renderer uses its default for the class. `paint` ignores it.
   */
  readonly tint?: Rgb;
  /** Vertex positions, xyz per vertex. */
  readonly positions: Float32Array;
  /** Unit vertex normals, xyz per vertex: smooth across curved panels, split at creases. */
  readonly normals: Float32Array;
  /** Triangle list, three vertex indices per triangle. */
  readonly indices: Uint32Array;
}

/** A panel seam: a polyline lying on the body (door outline, bonnet, boot lid, fuel flap). */
export interface CarSeam {
  readonly name: string;
  /** Polyline points, xyz per point. */
  readonly points: Float32Array;
  /** Whether the last point connects back to the first. */
  readonly closed: boolean;
}

export interface CarModel {
  readonly name: string;
  readonly parts: readonly CarPart[];
  readonly seams: readonly CarSeam[];
}

export interface Bounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** Axis-aligned bounds of every part of a model. */
export function modelBounds(model: CarModel): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const part of model.parts) {
    for (let i = 0; i < part.positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        const value = part.positions[i + axis];
        if (value < min[axis]) min[axis] = value;
        if (value > max[axis]) max[axis] = value;
      }
    }
  }
  return { min, max };
}
