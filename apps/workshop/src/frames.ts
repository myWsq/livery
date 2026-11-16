/**
 * The five artboards a livery design is drawn on, and how each maps onto the car.
 *
 * This is the single definition of the artboard frames. They are a contract with
 * every design file: a design is drawn in these millimetre coordinates, so a frame
 * never follows a car model's size. Shader uniforms, guide images and the projection
 * check all derive from here. It must stay free of DOM and bundler-only imports: the
 * browser app and the Node scripts both load it.
 */

export const VIEWS = ["left", "right", "top", "front", "rear"] as const;

export type View = (typeof VIEWS)[number];

/** Millimetres per car-frame metre along x, y and z, then an offset in millimetres. */
export type FrameAxis = readonly [x: number, y: number, z: number, offset: number];

export interface ArtboardFrame {
  readonly view: View;
  /** Artboard size in millimetres. One SVG user unit is one millimetre. */
  readonly width: number;
  readonly height: number;
  /** Millimetres from the artboard's left edge, for a point in car-frame metres. */
  readonly u: FrameAxis;
  /** Millimetres down from the artboard's top edge, for a point in car-frame metres. */
  readonly v: FrameAxis;
  /** The way a surface faces to take its livery from this artboard (a car-frame axis). */
  readonly facing: readonly [x: number, y: number, z: number];
}

export const FRAMES: Readonly<Record<View, ArtboardFrame>> = {
  left: {
    view: "left",
    width: 5200,
    height: 1800,
    u: [-1000, 0, 0, 2600],
    v: [0, -1000, 0, 1600],
    facing: [0, 0, -1],
  },
  right: {
    view: "right",
    width: 5200,
    height: 1800,
    u: [1000, 0, 0, 2600],
    v: [0, -1000, 0, 1600],
    facing: [0, 0, 1],
  },
  top: {
    view: "top",
    width: 5200,
    height: 2400,
    u: [-1000, 0, 0, 2600],
    v: [0, 0, -1000, 1200],
    facing: [0, 1, 0],
  },
  front: {
    view: "front",
    width: 2400,
    height: 1800,
    u: [0, 0, -1000, 1200],
    v: [0, -1000, 0, 1600],
    facing: [1, 0, 0],
  },
  rear: {
    view: "rear",
    width: 2400,
    height: 1800,
    u: [0, 0, 1000, 1200],
    v: [0, -1000, 0, 1600],
    facing: [-1, 0, 0],
  },
};

type Point = ArrayLike<number>;

function along(axis: FrameAxis, point: Point): number {
  return axis[0] * point[0] + axis[1] * point[1] + axis[2] * point[2] + axis[3];
}

/** Artboard millimetres (u to the right, v down) of a point in car-frame metres. */
export function toArtboard(frame: ArtboardFrame, point: Point): [u: number, v: number] {
  return [along(frame.u, point), along(frame.v, point)];
}

/**
 * The artboard a surface with the given car-frame normal takes its livery from: the
 * one the normal's dominant axis faces. A surface facing mostly down takes none.
 */
export function viewFacing(normal: Point): View | undefined {
  let best: View | undefined;
  let bestDot = -normal[1];
  for (const view of VIEWS) {
    const facing = FRAMES[view].facing;
    const dot = facing[0] * normal[0] + facing[1] * normal[1] + facing[2] * normal[2];
    if (dot > bestDot) {
      best = view;
      bestDot = dot;
    }
  }
  return best;
}

/**
 * The frames as the paint shader reads them, in the order of `VIEWS`: `u` and `v`
 * scaled so that the artboard spans 0..1, and the facing axis.
 */
export function frameUniforms() {
  return VIEWS.map((view) => {
    const frame = FRAMES[view];
    return {
      u: frame.u.map((value) => value / frame.width),
      v: frame.v.map((value) => value / frame.height),
      facing: [...frame.facing, 0],
    };
  });
}

/** How far an orthographic view reaches either side of the car's origin, in metres. */
const ORTHOGRAPHIC_REACH = 8;

/**
 * An orthographic view of the car aligned exactly with an artboard: a point of the
 * car lands on the pixel its `toArtboard` millimetres name, whatever the image size.
 */
export function orthographicView(frame: Omit<ArtboardFrame, "view">) {
  const { u, v, facing, width, height } = frame;
  // Column-major, mapping car-frame metres to clip space; nearer the viewer is
  // smaller depth.
  const viewProjection = new Float32Array(16);
  for (let axis = 0; axis < 4; axis++) {
    const offset = axis === 3 ? 1 : 0;
    viewProjection[axis * 4] = (2 * u[axis]) / width - offset;
    viewProjection[axis * 4 + 1] = offset - (2 * v[axis]) / height;
    viewProjection[axis * 4 + 2] = axis === 3 ? 0.5 : -facing[axis] / (2 * ORTHOGRAPHIC_REACH);
    viewProjection[axis * 4 + 3] = offset;
  }
  const eye: readonly [number, number, number, number] = [facing[0], facing[1], facing[2], 0];
  return {
    viewProjection,
    /** Direction toward the viewer, with w = 0 marking it as a direction. */
    eye,
    /** Clip-space height of one metre. */
    projectionScale: (2 * Math.hypot(v[0], v[1], v[2])) / height,
  };
}
