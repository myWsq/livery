/**
 * A procedural placeholder: a generic two-door sports coupé at real scale, standing
 * in until the owner's real model arrives. Nothing outside this file may depend on
 * how it is built; consumers read the `CarModel` it returns and nothing else.
 */
import {
  buildParts,
  flatFan,
  gridSurface,
  mirrorZ,
  reclass,
  type PartSpec,
  type Triangle,
  type Vec2,
  type Vec3,
} from "./mesh.ts";
import type { CarModel, CarSeam } from "./model.ts";

// Overall size (metres): 4.4 long, 1.85 wide, 1.27 tall, 2.5 wheelbase.
const HALF_LENGTH = 2.2;
const HALF_WIDTH = 0.925;
const FRONT_AXLE = 1.3;
const REAR_AXLE = -1.2;
const AXLES = [FRONT_AXLE, REAR_AXLE] as const;

const WHEEL_RADIUS = 0.335;
const TYRE_WIDTH = 0.25;
const RIM_RADIUS = 0.245;
const ARCH_RADIUS = 0.39;
const SILL_HEIGHT = 0.16;
/** How far the wheel well reaches in from the body side. */
const WELL_DEPTH = 0.34;

/** Exponent of the body cross-section: higher is boxier. */
const BODY_SECTION = 4;
/** Height of the widest point of the body, as a fraction between floor and deck. */
const WAIST = 0.52;
/** How much the body side tucks in toward the sill, as a fraction of the half width. */
const TUCK = 0.06;
/** Radius of the turn-under where the body side rolls into the underside. */
const TURN_UNDER = 0.04;

// Greenhouse (cabin) extent along the car.
const CABIN_REAR = -1.72;
const CABIN_FRONT = 0.92;
const CABIN_SECTION = 3.2;
const TUMBLEHOME = 0.2;

const PAINT: PartSpec = { name: "body", surface: "paint" };
const GLASS: PartSpec = { name: "glass", surface: "glass" };
const HEADLIGHT: PartSpec = { name: "headlights", surface: "light", tint: [0.2, 0.21, 0.23] };
const TAIL_LIGHT: PartSpec = { name: "tail-lights", surface: "light", tint: [0.5, 0.012, 0.01] };
const TRIM: PartSpec = { name: "trim", surface: "trim" };
const UNDERBODY: PartSpec = { name: "underbody", surface: "trim" };
const MIRROR: PartSpec = { name: "mirrors", surface: "trim" };
const TYRE: PartSpec = { name: "tyres", surface: "wheel", tint: [0.016, 0.016, 0.018] };
const RIM: PartSpec = { name: "rims", surface: "wheel", tint: [0.6, 0.61, 0.63] };
const BRAKE: PartSpec = { name: "wheel-barrels", surface: "wheel", tint: [0.07, 0.07, 0.075] };

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** A smooth curve through control points (monotone cubic interpolation). */
function curve(points: readonly Vec2[]): (x: number) => number {
  const n = points.length;
  const slopes: number[] = [];
  for (let i = 0; i + 1 < n; i++) {
    slopes.push((points[i + 1][1] - points[i][1]) / (points[i + 1][0] - points[i][0]));
  }
  const tangents: number[] = [slopes[0]];
  for (let i = 1; i + 1 < n; i++) {
    tangents.push(slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2);
  }
  tangents.push(slopes[n - 2]);
  for (let i = 0; i + 1 < n; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / slopes[i];
    const b = tangents[i + 1] / slopes[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      tangents[i] = t * a * slopes[i];
      tangents[i + 1] = t * b * slopes[i];
    }
  }
  return (x) => {
    if (x <= points[0][0]) return points[0][1];
    if (x >= points[n - 1][0]) return points[n - 1][1];
    let i = 0;
    while (x > points[i + 1][0]) i++;
    const h = points[i + 1][0] - points[i][0];
    const t = (x - points[i][0]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * points[i][1] +
      (t3 - 2 * t2 + t) * h * tangents[i] +
      (-2 * t3 + 3 * t2) * points[i + 1][1] +
      (t3 - t2) * h * tangents[i + 1]
    );
  };
}

// ---------------------------------------------------------------------------
// Lower body: a loft of rounded-box cross-sections along the car.
// ---------------------------------------------------------------------------

/** Half width of the body in plan. */
function halfWidthAt(x: number): number {
  const xi = Math.min(1, Math.abs(x) / HALF_LENGTH);
  const taper = Math.pow(Math.max(0, 1 - Math.pow(xi, x > 0 ? 4 : 5)), 1 / 2.5);
  return HALF_WIDTH * taper;
}

/** How much of the body's height is left at x: 1 along the car, 0 at the very ends. */
function endRounding(x: number): number {
  const xi = Math.min(1, Math.abs(x) / HALF_LENGTH);
  return Math.pow(Math.max(0, 1 - Math.pow(xi, 10)), 1 / 2.2);
}

/** Height the body closes toward at each end. */
function endHeight(x: number): number {
  return x > 0 ? 0.47 : 0.7;
}

const deckProfile = curve([
  [-2.2, 0.9],
  [-1.9, 0.935],
  [-1.5, 0.93],
  [-0.5, 0.91],
  [0.5, 0.91],
  [0.9, 0.89],
  [1.3, 0.83],
  [1.8, 0.735],
  [2.2, 0.67],
]);

/** Height of the body's top surface on the centre line (bonnet, cowl, rear deck). */
function deckAt(x: number): number {
  const centre = endHeight(x);
  return centre + (deckProfile(x) - centre) * endRounding(x);
}

/** Height of the body's underside. */
function floorAt(x: number): number {
  return SILL_HEIGHT + 0.07 * smoothstep(1.7, 2.2, x) + 0.15 * smoothstep(-1.6, -2.2, x);
}

function waistAt(x: number): number {
  const floor = floorAt(x);
  return floor + (deckAt(x) - floor) * WAIST;
}

/** The axle whose wheel arch covers x, if any. */
function archAxle(x: number): number | undefined {
  return AXLES.find((axle) => Math.abs(x - axle) <= ARCH_RADIUS + 1e-9);
}

/**
 * Height of the wheel-arch opening at x, or -Infinity away from the arches. The
 * opening is a half circle above the wheel centre, with straight sides down to the sill.
 */
function archAt(x: number): number {
  const axle = archAxle(x);
  if (axle === undefined) return -Infinity;
  return WHEEL_RADIUS + Math.sqrt(Math.max(0, ARCH_RADIUS ** 2 - (x - axle) ** 2));
}

/** A slight flare of the body side around each wheel arch. */
function flareAt(x: number, y: number): number {
  let flare = 0;
  for (const axle of AXLES) {
    const distance = Math.hypot(x - axle, y - WHEEL_RADIUS) - ARCH_RADIUS;
    if (distance > -0.01) flare += 0.014 * Math.exp(-((distance / 0.13) ** 2));
  }
  return flare;
}

/** Half width of the body skin at height y (the body side and shoulder). */
function sideAt(x: number, y: number): number {
  const width = halfWidthAt(x);
  const waist = waistAt(x);
  const deck = deckAt(x);
  if (y >= waist) {
    const s = Math.pow(Math.min(1, (y - waist) / Math.max(1e-9, deck - waist)), BODY_SECTION / 2);
    return width * Math.pow(Math.max(0, 1 - s * s), 1 / BODY_SECTION) + flareAt(x, y);
  }
  const t = (waist - y) / Math.max(1e-9, waist - floorAt(x));
  return width * (1 - TUCK * t * t) + flareAt(x, y);
}

/** Height of the body's top surface at a point in plan (the bonnet and rear deck). */
function topAt(x: number, z: number): number {
  const waist = waistAt(x);
  const c = Math.pow(Math.min(1, Math.abs(z) / halfWidthAt(x)), BODY_SECTION / 2);
  return waist + (deckAt(x) - waist) * Math.pow(Math.max(0, 1 - c * c), 1 / BODY_SECTION);
}

/**
 * The right half of the body cross-section at x, as `rows + 1` points from the centre
 * of the deck over the shoulder and down the side to the sill or the wheel arch.
 */
function bodySection(x: number, rows: number): Vec2[] {
  const width = halfWidthAt(x);
  const waist = waistAt(x);
  const deck = deckAt(x);
  const floor = floorAt(x);
  const stop = Math.max(floor, archAt(x));

  // Dense polyline of (z, y), top to bottom.
  const dense: Vec2[] = [];
  const upper = 96;
  for (let k = 0; k <= upper; k++) {
    const theta = (Math.PI / 2) * (1 - k / upper);
    const z = width * Math.pow(Math.max(0, Math.cos(theta)), 2 / BODY_SECTION);
    const y = waist + (deck - waist) * Math.pow(Math.max(0, Math.sin(theta)), 2 / BODY_SECTION);
    dense.push([z, y]);
  }
  // Down the side, then a quarter turn under the car onto the floor.
  const turn = Math.min(TURN_UNDER, width * 0.3, (waist - floor) * 0.5);
  const lower = 32;
  const lowest = 1 - turn / Math.max(1e-9, waist - floor);
  for (let k = 1; k <= lower; k++) {
    const t = (lowest * k) / lower;
    dense.push([width * (1 - TUCK * t * t), waist - (waist - floor) * t]);
  }
  const side = width * (1 - TUCK * lowest * lowest);
  const under = 8;
  for (let k = 1; k <= under; k++) {
    const angle = (Math.PI / 2) * (k / under);
    dense.push([side - turn + turn * Math.cos(angle), floor + turn - turn * Math.sin(angle)]);
  }
  for (const point of dense) point[0] += flareAt(x, point[1]);
  dense[0][0] = 0;

  // Cut at the sill or the wheel arch.
  const cut: Vec2[] = [dense[0]];
  for (let k = 1; k < dense.length; k++) {
    const previous = dense[k - 1];
    const current = dense[k];
    if (current[1] <= stop) {
      const t = previous[1] === current[1] ? 0 : (previous[1] - stop) / (previous[1] - current[1]);
      cut.push([previous[0] + (current[0] - previous[0]) * t, stop]);
      break;
    }
    cut.push(current);
  }
  return resample(cut, rows);
}

/** Resamples a polyline to `segments + 1` points evenly spaced along its length. */
function resample(points: readonly Vec2[], segments: number): Vec2[] {
  const lengths = [0];
  for (let k = 1; k < points.length; k++) {
    lengths.push(
      lengths[k - 1] + Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]),
    );
  }
  const total = lengths[lengths.length - 1];
  const result: Vec2[] = [];
  let k = 1;
  for (let s = 0; s <= segments; s++) {
    const target = (total * s) / segments;
    while (k < points.length - 1 && lengths[k] < target) k++;
    const span = lengths[k] - lengths[k - 1];
    const t = span > 0 ? (target - lengths[k - 1]) / span : 0;
    result.push([
      points[k - 1][0] + (points[k][0] - points[k - 1][0]) * t,
      points[k - 1][1] + (points[k][1] - points[k - 1][1]) * t,
    ]);
  }
  return result;
}

/** Stations along the car: dense toward the ends and around the wheel arches. */
function bodyStations(): number[] {
  const stations: number[] = [];
  const count = 150;
  for (let k = 0; k <= count; k++) {
    stations.push(HALF_LENGTH * Math.sin(Math.PI * (k / count - 0.5)));
  }
  stations[0] = -HALF_LENGTH;
  stations[count] = HALF_LENGTH;

  const arch: number[] = [];
  const steps = 40;
  for (const axle of AXLES) {
    for (let k = 0; k <= steps; k++) {
      arch.push(axle + ARCH_RADIUS * Math.cos((Math.PI * k) / steps));
    }
    arch.push(axle - ARCH_RADIUS - 0.003, axle + ARCH_RADIUS + 0.003);
  }
  const kept = stations.filter((x) => arch.every((a) => Math.abs(a - x) > 0.012));
  return [...kept, ...arch].sort((a, b) => a - b);
}

function buildBody(): Triangle[] {
  const stations = bodyStations();
  const rows = 44;
  const sections = stations.map((x) => bodySection(x, rows));
  const outward = (p: Vec3): Vec3 => [p[0] * 0.2, p[1] - 0.5, p[2]];

  // One grid across the whole width so the deck is smooth over the centre line.
  let skin = gridSurface({
    columns: stations.length,
    rows: 2 * rows + 1,
    at: (i, j) => {
      const row = Math.abs(j - rows);
      const [z, y] = sections[i][row];
      return { p: [stations[i], y, j < rows ? -z : z] };
    },
    part: PAINT,
    outward,
  });

  // Lights and unpainted areas are outlines drawn on the body from the front, the
  // rear and the side.
  const frontView = (v: { p: Vec3 }): Vec2 => [v.p[2], v.p[1]];
  const sideView = (v: { p: Vec3 }): Vec2 => [v.p[0], v.p[1]];
  const centroidX = (t: Triangle) => (t.v[0].p[0] + t.v[1].p[0] + t.v[2].p[0]) / 3;
  const centroidZ = (t: Triangle) => (t.v[0].p[2] + t.v[1].p[2] + t.v[2].p[2]) / 3;
  const mirrored = (outline: readonly Vec2[]): Vec2[] => outline.map(([z, y]) => [-z, y]);

  const headlight: Vec2[] = [
    [0.4, 0.52],
    [0.74, 0.545],
    [0.83, 0.6],
    [0.8, 0.66],
    [0.46, 0.6],
  ];
  const grille: Vec2[] = [
    [-0.5, 0.23],
    [0.5, 0.23],
    [0.58, 0.36],
    [-0.58, 0.36],
  ];
  const tailLight: Vec2[] = [
    [-0.84, 0.735],
    [0.84, 0.735],
    [0.84, 0.8],
    [-0.84, 0.8],
  ];
  const diffuser: Vec2[] = [
    [-0.56, 0.2],
    [0.56, 0.2],
    [0.64, 0.4],
    [-0.64, 0.4],
  ];
  const sill: Vec2[] = [
    [REAR_AXLE + 0.3, 0],
    [FRONT_AXLE - 0.3, 0],
    [FRONT_AXLE - 0.3, 0.225],
    [REAR_AXLE + 0.3, 0.225],
  ];

  // A lamp is where an outline seen from the front meets one seen from the side, so
  // that it wraps the corner of the car and ends on a clean line.
  const lamp = (
    front: readonly Vec2[],
    side: readonly Vec2[],
    near: (x: number) => boolean,
    part: PartSpec,
  ) => {
    const wrapped: PartSpec = { name: "lamp-wrap", surface: "paint" };
    skin = reclass(skin, {
      select: (t) => t.part === PAINT && near(centroidX(t)),
      project: frontView,
      outline: front,
      part: wrapped,
    });
    skin = reclass(skin, {
      select: (t) => t.part === wrapped,
      project: sideView,
      outline: side,
      part,
    });
    skin = skin.map((t) => (t.part === wrapped ? { v: t.v, part: PAINT } : t));
  };
  const noseEnd: Vec2[] = [
    [1.74, 0.3],
    [2.3, 0.3],
    [2.3, 0.8],
    [1.8, 0.8],
  ];
  const tailEnd: Vec2[] = [
    [-2.3, 0.6],
    [-1.92, 0.6],
    [-1.92, 0.9],
    [-2.3, 0.9],
  ];
  lamp(headlight, noseEnd, (x) => x > 1.6, HEADLIGHT);
  lamp(mirrored(headlight), noseEnd, (x) => x > 1.6, HEADLIGHT);
  lamp(tailLight, tailEnd, (x) => x < -1.8, TAIL_LIGHT);
  skin = reclass(skin, {
    select: (t) => centroidX(t) > 1.7,
    project: frontView,
    outline: grille,
    part: TRIM,
  });
  skin = reclass(skin, {
    select: (t) => centroidX(t) < -1.7,
    project: frontView,
    outline: diffuser,
    part: TRIM,
  });
  skin = reclass(skin, {
    select: (t) => Math.abs(centroidZ(t)) > 0.5,
    project: sideView,
    outline: sill,
    part: TRIM,
  });

  const triangles = [...skin];

  // Underside: a floor between the sills, narrowing to pass between the wheel wells.
  const edge = (i: number): Vec2 => sections[i][rows];
  const floorHalf = (i: number): number => {
    const axle = archAxle(stations[i]);
    return axle === undefined ? edge(i)[0] : halfWidthAt(axle) - WELL_DEPTH;
  };
  triangles.push(
    ...gridSurface({
      columns: stations.length,
      rows: 2,
      at: (i, j) => ({
        p: [stations[i], floorAt(stations[i]), j === 0 ? -floorHalf(i) : floorHalf(i)],
      }),
      part: UNDERBODY,
      outward: () => [0, -1, 0],
    }),
  );

  // Wheel wells on the right; the left ones are mirrored.
  const wells: Triangle[] = [];
  for (const axle of AXLES) {
    const inner = halfWidthAt(axle) - WELL_DEPTH;
    const columns = stations.map((x, i) => ({ x, i })).filter(({ x }) => archAxle(x) === axle);
    // The lip of the opening: up one straight side, over the arch, down the other.
    const first = columns[0];
    const last = columns[columns.length - 1];
    const lip: Vec3[] = [
      [first.x, SILL_HEIGHT, edge(first.i)[0]],
      ...columns.map(({ x, i }): Vec3 => [x, edge(i)[1], edge(i)[0]]),
      [last.x, SILL_HEIGHT, edge(last.i)[0]],
    ];
    wells.push(
      ...gridSurface({
        columns: lip.length,
        rows: 2,
        at: (c, j) => ({ p: j === 0 ? lip[c] : [lip[c][0], lip[c][1], inner] }),
        part: UNDERBODY,
        outward: (p) => [axle - p[0], WHEEL_RADIUS - p[1], 0],
      }),
    );
    const wall = lip.map((p): Vec3 => [p[0], p[1], inner]);
    wells.push(...flatFan([[axle, SILL_HEIGHT, inner], ...wall], [0, 0, 1], UNDERBODY));
  }
  triangles.push(...wells, ...mirrorZ(wells));
  return triangles;
}

// ---------------------------------------------------------------------------
// Greenhouse: a second loft sitting in the body, re-classed into glass by outlines
// drawn in its own (x, angle) surface parameters.
// ---------------------------------------------------------------------------

const roofProfile = curve([
  [CABIN_REAR, 0.93],
  [-1.3, 1.05],
  [-0.8, 1.19],
  [-0.35, 1.262],
  [-0.1, 1.27],
  [0.2, 1.243],
  [0.55, 1.07],
  [CABIN_FRONT, 0.885],
]);

const cabinWidth = curve([
  [CABIN_REAR, 0.6],
  [-1, 0.73],
  [-0.2, 0.78],
  [0.5, 0.765],
  [CABIN_FRONT, 0.73],
]);

/** Depth of the greenhouse's hidden base below the deck. */
const CABIN_SINK = 0.14;

/** A point of the greenhouse at x and `angle` degrees from straight up (positive to the right). */
function cabinPoint(x: number, angle: number): Vec3 {
  const base = deckAt(x) - CABIN_SINK;
  const height = Math.max(0, roofProfile(x) - base);
  const radians = (angle * Math.PI) / 180;
  const y = base + height * Math.pow(Math.max(0, Math.cos(radians)), 2 / CABIN_SECTION);
  const lean = 1 - (TUMBLEHOME * Math.max(0, y - 0.9)) / (1.27 - 0.9);
  const z =
    cabinWidth(x) *
    lean *
    Math.sign(radians) *
    Math.pow(Math.abs(Math.sin(radians)), 2 / CABIN_SECTION);
  return [x, y, z];
}

function buildCabin(): Triangle[] {
  const columns = 110;
  const rows = 97;
  let cabin = gridSurface({
    columns,
    rows,
    at: (i, j) => {
      const x = CABIN_REAR + ((CABIN_FRONT - CABIN_REAR) * i) / (columns - 1);
      const angle = -90 + (180 * j) / (rows - 1);
      return { p: cabinPoint(x, angle), q: [x, angle] };
    },
    part: PAINT,
    outward: (p) => [0, p[1] - 0.8, p[2]],
  });

  const windscreen: Vec2[] = [
    [0.875, -52],
    [0.875, 52],
    [0.245, 43],
    [0.245, -43],
  ];
  const rearGlass: Vec2[] = [
    [-0.66, -42],
    [-0.66, 42],
    [-1.5, 48],
    [-1.5, -48],
  ];
  const sideWindow: Vec2[] = [
    [0.8, 84],
    [0.2, 52],
    [-0.52, 52],
    [-0.74, 60],
    [-0.98, 84],
  ];
  const outlines = [
    windscreen,
    rearGlass,
    sideWindow,
    sideWindow.map(([x, angle]): Vec2 => [x, -angle]),
  ];
  for (const outline of outlines) {
    cabin = reclass(cabin, { select: () => true, project: (v) => v.q, outline, part: GLASS });
  }
  return cabin;
}

// ---------------------------------------------------------------------------
// Wheels and mirrors.
// ---------------------------------------------------------------------------

/** Revolves a profile of (radius, offset along the axle) around a wheel's axle. */
function lathe(
  centre: Vec3,
  profile: readonly Vec2[],
  part: PartSpec,
  outward: (radius: number, offset: number) => Vec2,
): Triangle[] {
  const segments = 56;
  return gridSurface({
    columns: segments + 1,
    rows: profile.length,
    at: (i, j) => {
      const angle = (2 * Math.PI * (i % segments)) / segments;
      const [radius, offset] = profile[j];
      return {
        p: [
          centre[0] + radius * Math.cos(angle),
          centre[1] + radius * Math.sin(angle),
          centre[2] + offset,
        ],
      };
    },
    part,
    outward: (p) => {
      const dx = p[0] - centre[0];
      const dy = p[1] - centre[1];
      const radius = Math.hypot(dx, dy) || 1;
      const [radial, axial] = outward(radius, p[2] - centre[2]);
      return [(dx / radius) * radial, (dy / radius) * radial, axial];
    },
  });
}

/** A wheel on the right side of the car, with its outer face toward +Z. */
function buildWheel(axle: number): Triangle[] {
  const half = TYRE_WIDTH / 2;
  const centre: Vec3 = [axle, WHEEL_RADIUS, halfWidthAt(axle) - 0.03 - half];
  const triangles: Triangle[] = [];

  // Tyre: a rounded section from bead to bead.
  const tyre: Vec2[] = [];
  const steps = 28;
  for (let k = 0; k <= steps; k++) {
    const t = (Math.PI * k) / steps;
    tyre.push([
      RIM_RADIUS + (WHEEL_RADIUS - RIM_RADIUS) * Math.pow(Math.sin(t), 2 / 5),
      half * Math.sign(Math.cos(t)) * Math.pow(Math.abs(Math.cos(t)), 2 / 5),
    ]);
  }
  triangles.push(...lathe(centre, tyre, TYRE, (radius, offset) => [radius - 0.28, offset * 3]));

  // Rim lip, then the barrel running back into the wheel.
  triangles.push(
    ...lathe(
      centre,
      [
        [RIM_RADIUS, half - 0.004],
        [RIM_RADIUS - 0.014, half - 0.004],
        [RIM_RADIUS - 0.022, half - 0.022],
      ],
      RIM,
      () => [-0.3, 1],
    ),
    ...lathe(
      centre,
      [
        [RIM_RADIUS - 0.022, half - 0.022],
        [RIM_RADIUS - 0.022, -half],
      ],
      BRAKE,
      () => [-1, 0],
    ),
  );
  // The dark disc behind the spokes, and the hub cap.
  const backdrop = half - 0.1;
  triangles.push(
    ...lathe(
      centre,
      [
        [0, backdrop],
        [RIM_RADIUS - 0.022, backdrop],
      ],
      BRAKE,
      () => [0, 1],
    ),
    ...lathe(
      centre,
      [
        [0, half - 0.04],
        [0.05, half - 0.042],
        [0.07, half - 0.06],
        [0.07, backdrop],
      ],
      RIM,
      () => [0.5, 1],
    ),
  );

  // Five twin spokes, dished in toward the hub.
  const spokes = 10;
  for (let s = 0; s < spokes; s++) {
    const pair = Math.floor(s / 2);
    const angle = (2 * Math.PI * pair) / 5 + (s % 2 === 0 ? -0.2 : 0.2) + Math.PI / 2;
    const radial: Vec2 = [Math.cos(angle), Math.sin(angle)];
    const tangent: Vec2 = [-radial[1], radial[0]];
    const at = (radius: number, across: number, offset: number): Vec3 => [
      centre[0] + radial[0] * radius + tangent[0] * across,
      centre[1] + radial[1] * radius + tangent[1] * across,
      centre[2] + offset,
    ];
    const inner = 0.055;
    const outer = RIM_RADIUS - 0.018;
    const faceIn = half - 0.05;
    const faceOut = half - 0.022;
    const width = 0.02;
    const a = at(inner, -width, faceIn);
    const b = at(inner, width, faceIn);
    const c = at(outer, width * 0.8, faceOut);
    const d = at(outer, -width * 0.8, faceOut);
    const depth = 0.03;
    const back = (p: Vec3): Vec3 => [p[0], p[1], p[2] - depth];
    triangles.push(
      ...flatFan([a, b, c, d], [0, 0, 1], RIM),
      ...flatFan([b, back(b), back(c), c], [tangent[0], tangent[1], 0], RIM),
      ...flatFan([a, d, back(d), back(a)], [-tangent[0], -tangent[1], 0], RIM),
    );
  }
  return triangles;
}

/** The right door mirror: a housing and the stalk that carries it. */
function buildMirror(): Triangle[] {
  const ellipsoid = (centre: Vec3, radii: Vec3): Triangle[] => {
    const columns = 20;
    const rows = 12;
    return gridSurface({
      columns: columns + 1,
      rows: rows + 1,
      at: (i, j) => {
        const around = (2 * Math.PI * (i % columns)) / columns;
        const down = (Math.PI * j) / rows;
        return {
          p: [
            centre[0] + radii[0] * Math.sin(down) * Math.cos(around),
            centre[1] + radii[1] * Math.cos(down),
            centre[2] + radii[2] * Math.sin(down) * Math.sin(around),
          ],
        };
      },
      part: MIRROR,
      outward: (p) => [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]],
    });
  };
  return [
    ...ellipsoid([0.6, 0.95, 0.875], [0.065, 0.045, 0.095]),
    ...ellipsoid([0.62, 0.915, 0.76], [0.04, 0.024, 0.12]),
  ];
}

// ---------------------------------------------------------------------------
// Panel seams.
// ---------------------------------------------------------------------------

/** Rounds every corner of a closed outline with an arc-like curve of the given radius. */
function rounded(points: readonly Vec2[], radius: number): Vec2[] {
  const result: Vec2[] = [];
  const steps = 8;
  for (let i = 0; i < points.length; i++) {
    const corner = points[i];
    const before = points[(i + points.length - 1) % points.length];
    const after = points[(i + 1) % points.length];
    const toward = (other: Vec2): Vec2 => {
      const length = Math.hypot(other[0] - corner[0], other[1] - corner[1]);
      const reach = Math.min(radius, length * 0.45) / length;
      return [
        corner[0] + (other[0] - corner[0]) * reach,
        corner[1] + (other[1] - corner[1]) * reach,
      ];
    };
    const a = toward(before);
    const b = toward(after);
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      result.push([
        u * u * a[0] + 2 * u * t * corner[0] + t * t * b[0],
        u * u * a[1] + 2 * u * t * corner[1] + t * t * b[1],
      ]);
    }
  }
  return result;
}

/** Subdivides a closed outline so that no segment is longer than `step`. */
function densify(points: readonly Vec2[], step: number): Vec2[] {
  const result: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const pieces = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < pieces; k++) {
      result.push([a[0] + ((b[0] - a[0]) * k) / pieces, a[1] + ((b[1] - a[1]) * k) / pieces]);
    }
  }
  return result;
}

function seam(name: string, outline: readonly Vec2[], lift: (point: Vec2) => Vec3): CarSeam {
  const points = densify(outline, 0.02).flatMap(lift);
  return { name, points: new Float32Array(points), closed: true };
}

function buildSeams(): CarSeam[] {
  // Outlines drawn in side view (x, y) and laid on the body side.
  const door = rounded(
    [
      [0.84, 0.25],
      [0.86, 0.85],
      [-0.44, 0.86],
      [-0.5, 0.25],
    ],
    0.09,
  );
  const fuelFlap: Vec2[] = [];
  for (let k = 0; k < 24; k++) {
    const angle = (2 * Math.PI * k) / 24;
    fuelFlap.push([-1.74 + 0.065 * Math.cos(angle), 0.63 + 0.065 * Math.sin(angle)]);
  }
  const onSide =
    (sign: number) =>
    ([x, y]: Vec2): Vec3 => [x, y, sign * sideAt(x, y)];

  // Outlines drawn in plan (x, z) and laid on the deck.
  const bonnet = rounded(
    [
      [0.97, -0.7],
      [1.62, -0.66],
      [1.97, -0.4],
      [1.97, 0.4],
      [1.62, 0.66],
      [0.97, 0.7],
    ],
    0.14,
  );
  const bootLid = rounded(
    [
      [-1.76, -0.6],
      [-1.76, 0.6],
      [-2.07, 0.44],
      [-2.07, -0.44],
    ],
    0.07,
  );
  const onDeck = ([x, z]: Vec2): Vec3 => [x, topAt(x, z), z];

  return [
    seam("door-left", door, onSide(-1)),
    seam("door-right", door, onSide(1)),
    seam("bonnet", bonnet, onDeck),
    seam("boot-lid", bootLid, onDeck),
    seam("fuel-flap", fuelFlap, onSide(1)),
  ];
}

export function createPlaceholderCar(): CarModel {
  const wheels = AXLES.flatMap((axle) => buildWheel(axle));
  const mirror = buildMirror();
  const triangles = [
    ...buildBody(),
    ...buildCabin(),
    ...wheels,
    ...mirrorZ(wheels),
    ...mirror,
    ...mirrorZ(mirror),
  ];
  return { name: "placeholder-coupe", parts: buildParts(triangles), seams: buildSeams() };
}
