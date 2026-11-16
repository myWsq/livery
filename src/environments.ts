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
  /** Radius of the dome the backdrop is projected on, in metres. */
  readonly groundRadius: number;
}

export interface Environment {
  readonly id: EnvironmentId;
  /** The name shown to the owner. */
  readonly name: string;
  /** File name under `environments/`. */
  readonly file: string;
  /** Where the photograph comes from: a Poly Haven asset and its author. */
  readonly source: { readonly asset: string; readonly author: string };
  readonly settings: EnvironmentSettings;
}

/** The size every photograph must have: an equirectangular panorama, 2:1. */
export const ENVIRONMENT_SIZE: readonly [width: number, height: number] = [2048, 1024];

export const ENVIRONMENTS: readonly Environment[] = [
  {
    id: "day",
    name: "日光",
    file: "day.hdr",
    source: { asset: "wide_street_01", author: "Sergej Majboroda" },
    settings: { exposure: 0.4, heading: 46, captureHeight: 1.5, groundRadius: 30 },
  },
  {
    id: "overcast",
    name: "阴天",
    file: "overcast.hdr",
    source: { asset: "round_platform", author: "Sergej Majboroda" },
    settings: { exposure: 0.9, heading: 0, captureHeight: 1.5, groundRadius: 30 },
  },
  {
    id: "night",
    name: "夜晚街灯",
    file: "night.hdr",
    source: { asset: "hansaplatz", author: "Greg Zaal" },
    settings: { exposure: 0.45, heading: 0, captureHeight: 1.5, groundRadius: 30 },
  },
  {
    id: "garage",
    name: "车库",
    file: "garage.hdr",
    source: { asset: "empty_warehouse_01", author: "Sergej Majboroda" },
    settings: { exposure: 0.7, heading: 0, captureHeight: 1.5, groundRadius: 30 },
  },
];

/** The environment with this id, or undefined when there is none. */
export function environmentById(id: string): Environment | undefined {
  return ENVIRONMENTS.find((environment) => environment.id === id);
}
