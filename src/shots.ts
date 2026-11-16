/**
 * Named camera positions, to look at every design from the same places: a comparison
 * sheet renders each design from a few of them. Shared by the browser app and the Node
 * scripts, so free of DOM and bundler-only imports.
 */
import type { OrbitState } from "./camera.ts";

export interface Shot {
  readonly id: string;
  /** What the shot is called on a sheet. */
  readonly name: string;
  /** Degrees: 90 looks at the nose, 0 at the car's right side, 180 at its left, 270 at the tail. */
  readonly yaw: number;
  /** Degrees: 0 is level with the car, 90 straight down. */
  readonly pitch: number;
  /** Metres from the car's centre; the camera clamps it as usual. */
  readonly distance: number;
}

export const SHOTS: readonly Shot[] = [
  { id: "front", name: "右前", yaw: 54, pitch: 9, distance: 5.2 },
  { id: "left", name: "左侧", yaw: 180, pitch: 3, distance: 6.0 },
  { id: "rear", name: "左后", yaw: 225, pitch: 12, distance: 5.4 },
  { id: "above", name: "俯视", yaw: 54, pitch: 38, distance: 6.2 },
  { id: "right", name: "右侧", yaw: 0, pitch: 3, distance: 6.0 },
  { id: "nose", name: "车头", yaw: 90, pitch: 6, distance: 5.6 },
  { id: "tail", name: "车尾", yaw: 270, pitch: 6, distance: 5.6 },
];

/** The shots a comparison sheet shows unless told otherwise. */
export const DEFAULT_SHOTS: readonly string[] = ["front", "left", "rear", "above"];

export function shotById(id: string): Shot | undefined {
  return SHOTS.find((shot) => shot.id === id);
}

/** The orbit position of a shot, with its angles in radians. */
export function orbitOf(shot: Shot): OrbitState {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  return { yaw: radians(shot.yaw), pitch: radians(shot.pitch), distance: shot.distance };
}
