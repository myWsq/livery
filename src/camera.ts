import { group, perspective, viewMatrices } from "vgpu/scene";

import type { Bounds } from "./car/index.ts";

/**
 * Vertical field of view. Wide enough that the backdrop photograph is not magnified
 * far beyond its resolution, and narrow enough that the car is not bulged by
 * perspective: at 60 the nose swells visibly.
 */
export const FOV_DEGREES = 50;

/** Where the orbiting camera is: angles in radians, distance in metres from the car's centre. */
export interface OrbitState {
  yaw: number;
  pitch: number;
  distance: number;
}

/** Pitch runs from near the horizon to nearly straight down. */
export const PITCH_RANGE: readonly [number, number] = [0.03, 1.5];
/**
 * Distance runs from a door filling the screen to the whole car with room to spare.
 * The far end also keeps the camera inside the wall of the smallest backdrop room
 * (`groundRadius` in environments.ts): outside it the backdrop would jump.
 */
export const DISTANCE_RANGE: readonly [number, number] = [1.2, 6.5];
/** How close the camera may come to the car's bounding shape. */
const CLEARANCE = 1.15;

/**
 * How far below level the camera may look by shifting its picture instead of tilting,
 * in radians. A camera that tilts down makes everything upright behind the car lean
 * outward, the more so the wider the view; a camera that stays level and slides its
 * picture down, as a shift lens does, keeps uprights upright. Up to about this angle
 * the camera only shifts; past it the shift stays near this much and the rest is tilt,
 * so a view from above still looks down.
 */
const SHIFT_LIMIT = 0.3;

/** The front three-quarter view the workshop opens with. */
export function initialOrbit(): OrbitState {
  return { yaw: 0.95, pitch: 0.21, distance: 4.2 };
}

export function clampOrbit(orbit: OrbitState): void {
  orbit.pitch = Math.max(PITCH_RANGE[0], Math.min(PITCH_RANGE[1], orbit.pitch));
  orbit.distance = Math.max(DISTANCE_RANGE[0], Math.min(DISTANCE_RANGE[1], orbit.distance));
}

/**
 * The camera looking at the centre of `subject` from an orbit position. Zooming in
 * stops at a shell around the subject rather than at a fixed radius, so the closest
 * view is a body panel filling the screen from any side. The subject is always at the
 * centre of the picture, whether the camera reaches it by shifting or by tilting.
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
  // The subject lies `pitch` below level as seen from the camera. `shifted` of that is
  // taken up by sliding the picture, the rest by tilting the camera.
  const shifted = SHIFT_LIMIT * Math.tanh(pitch / SHIFT_LIMIT);
  const tilt = pitch - shifted;
  const shift = Math.tan(shifted);
  const axis: Vec3 = [
    -Math.sin(orbit.yaw) * Math.cos(tilt),
    -Math.sin(tilt),
    -Math.cos(orbit.yaw) * Math.cos(tilt),
  ];
  const right = normalize(cross(axis, [0, 1, 0]));
  const up = cross(right, axis);

  const poseNode = group({ position }).lookAt([
    position[0] + axis[0],
    position[1] + axis[1],
    position[2] + axis[2],
  ]);
  const projection = perspective(
    { fov: FOV_DEGREES, near: 0.1, far: 80 },
    aspect,
    new Float32Array(16),
  );
  // Slides the picture down by `shift` (in units of distance along the axis), which
  // brings the subject back to the centre: clip y gains shift times the depth.
  projection[9] = -projection[5] * shift;
  const camera = {
    position: new Float32Array(position),
    quaternion: new Float32Array(poseNode.quaternion),
    projection,
    view: new Float32Array(16),
    viewProjection: new Float32Array(16),
  };
  viewMatrices(camera, projection, camera);
  // The direction through the centre of the picture, not normalised: the axis moved
  // down by the shift. A pixel's ray is this plus its offsets along `right` and `up`.
  const forward: Vec3 = [axis[0] - up[0] * shift, axis[1] - up[1] * shift, axis[2] - up[2] * shift];

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
