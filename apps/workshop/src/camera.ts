import { group, perspective, viewMatrices } from "vgpu/scene";

import type { Bounds } from "./car/index.ts";

export const FOV_DEGREES = 36;

/** Where the orbiting camera is: angles in radians, distance in metres from the car's centre. */
export interface OrbitState {
  yaw: number;
  pitch: number;
  distance: number;
}

/** Pitch runs from near the horizon to nearly straight down. */
export const PITCH_RANGE: readonly [number, number] = [0.03, 1.5];
/** Distance runs from a door filling the screen to the whole car with room to spare. */
export const DISTANCE_RANGE: readonly [number, number] = [1.2, 11];
/** How close the camera may come to the car's bounding shape. */
const CLEARANCE = 1.15;

/** The front three-quarter view the workshop opens with. */
export function initialOrbit(): OrbitState {
  return { yaw: 0.95, pitch: 0.21, distance: 5.4 };
}

export function clampOrbit(orbit: OrbitState): void {
  orbit.pitch = Math.max(PITCH_RANGE[0], Math.min(PITCH_RANGE[1], orbit.pitch));
  orbit.distance = Math.max(DISTANCE_RANGE[0], Math.min(DISTANCE_RANGE[1], orbit.distance));
}

/**
 * The camera looking at the centre of `subject` from an orbit position. Zooming in
 * stops at a shell around the subject rather than at a fixed radius, so the closest
 * view is a body panel filling the screen from any side.
 */
export function cameraView(orbit: OrbitState, aspect: number, subject: Bounds) {
  const pitch = Math.max(PITCH_RANGE[0], Math.min(PITCH_RANGE[1], orbit.pitch));
  const cosPitch = Math.cos(pitch);
  const direction: Vec3 = [
    Math.sin(orbit.yaw) * cosPitch,
    Math.sin(pitch),
    Math.cos(orbit.yaw) * cosPitch,
  ];
  const focus: [number, number, number] = [
    (subject.min[0] + subject.max[0]) / 2,
    (subject.min[1] + subject.max[1]) / 2,
    (subject.min[2] + subject.max[2]) / 2,
  ];
  // Radius of an ellipsoid around the subject along the viewing direction.
  const shell = Math.hypot(
    direction[0] / ((subject.max[0] - subject.min[0]) / 2 + CLEARANCE),
    direction[1] / ((subject.max[1] - subject.min[1]) / 2 + CLEARANCE),
    direction[2] / ((subject.max[2] - subject.min[2]) / 2 + CLEARANCE),
  );
  const distance = Math.max(orbit.distance, 1 / shell);
  const position: [number, number, number] = [
    focus[0] + direction[0] * distance,
    focus[1] + direction[1] * distance,
    focus[2] + direction[2] * distance,
  ];
  const forward: Vec3 = [-direction[0], -direction[1], -direction[2]];
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);

  const poseNode = group({ position }).lookAt(focus);
  const projection = perspective(
    { fov: FOV_DEGREES, near: 0.1, far: 80 },
    aspect,
    new Float32Array(16),
  );
  const camera = {
    position: new Float32Array(position),
    quaternion: new Float32Array(poseNode.quaternion),
    projection,
    view: new Float32Array(16),
    viewProjection: new Float32Array(16),
  };
  viewMatrices(camera, projection, camera);

  return {
    camera,
    position,
    forward,
    right,
    up,
    tanHalfFov: Math.tan((FOV_DEGREES * Math.PI) / 360),
    aspect,
  };
}

export type CameraView = ReturnType<typeof cameraView>;

type Vec3 = readonly [number, number, number];

function cross(a: Vec3, b: Vec3): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v: Vec3): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}
