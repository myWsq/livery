/**
 * The lighting environments: real panoramic photographs under `environments/`, in the
 * order the workshop steps through them, with the numbers that fit each one to the
 * car. Shared by the browser and the Node scripts; the settings are plain data, tuned
 * by eye with `render`'s `--exposure`, `--heading`, `--capture-height` and
 * `--ground-radius`.
 */

export type EnvironmentId = "day" | "overcast" | "night" | "garage";

/** How one photograph is fitted to the car. */
export interface EnvironmentSettings {
  /** Multiplier on the whole picture before tone mapping. */
  readonly exposure: number;
  /**
   * The environment's own turn about +Y, in degrees: what the photograph shows at
   * azimuth a (from +X toward +Z) is seen at azimuth a + heading.
   */
  readonly heading: number;
  /** Height above the ground the photograph was taken from, in metres. */
  readonly captureHeight: number;
  /**
   * Radius of the dome the backdrop is projected on, in metres: about how far the
   * nearest upright things (walls, fences, tree trunks) stood from the camera.
   * Larger, and their lower parts are laid on the floor and lean outward; it must
   * also stay above the camera's farthest distance (`DISTANCE_RANGE` in camera.ts).
   */
  readonly groundRadius: number;
}

export interface Environment {
  readonly id: EnvironmentId;
  /** The name shown to the owner. */
  readonly name: string;
  /**
   * File name under `environments/` of the HDR that lights the car and sets the
   * backdrop's brightness.
   */
  readonly file: string;
  /**
   * File name under `environments/` of the tone-mapped JPEG of the same panorama, at
   * `BACKDROP_SIZE`, aligned to the pixel with `file`: it gives the backdrop its fine
   * detail.
   */
  readonly backdrop: string;
  /** Where the photograph comes from: a Poly Haven asset and its author. */
  readonly source: { readonly asset: string; readonly author: string };
  readonly settings: EnvironmentSettings;
}

/** The size every photograph must have: an equirectangular panorama, 2:1. */
export const ENVIRONMENT_SIZE: readonly [width: number, height: number] = [2048, 1024];

/** The size every detail image must have: four times `ENVIRONMENT_SIZE` each way. */
export const BACKDROP_SIZE: readonly [width: number, height: number] = [
  ENVIRONMENT_SIZE[0] * 4,
  ENVIRONMENT_SIZE[1] * 4,
];

export const ENVIRONMENTS: readonly Environment[] = [
  {
    id: "day",
    name: "日光",
    file: "day.hdr",
    backdrop: "day.jpg",
    source: { asset: "wide_street_01", author: "Sergej Majboroda" },
    settings: { exposure: 0.4, heading: 46, captureHeight: 1.5, groundRadius: 12 },
  },
  {
    id: "overcast",
    name: "阴天",
    file: "overcast.hdr",
    backdrop: "overcast.jpg",
    source: { asset: "round_platform", author: "Sergej Majboroda" },
    settings: { exposure: 0.9, heading: 0, captureHeight: 1.5, groundRadius: 14 },
  },
  {
    id: "night",
    name: "夜晚街灯",
    file: "night.hdr",
    backdrop: "night.jpg",
    source: { asset: "hansaplatz", author: "Greg Zaal" },
    settings: { exposure: 0.45, heading: 0, captureHeight: 1.5, groundRadius: 12 },
  },
  {
    id: "garage",
    name: "车库",
    file: "garage.hdr",
    backdrop: "garage.jpg",
    source: { asset: "empty_warehouse_01", author: "Sergej Majboroda" },
    settings: { exposure: 0.7, heading: 0, captureHeight: 1.5, groundRadius: 8 },
  },
];

/** The environment with this id, or undefined when there is none. */
export function environmentById(id: string): Environment | undefined {
  return ENVIRONMENTS.find((environment) => environment.id === id);
}
