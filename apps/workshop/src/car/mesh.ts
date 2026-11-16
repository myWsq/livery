/**
 * Small triangle-soup toolkit used to build procedural car models: lofted grids with
 * smooth normals, re-classing a region of a surface by clipping against a convex
 * outline, and welding the result into the indexed parts of the car model contract.
 */
import type { CarPart, Rgb, SurfaceClass } from "./model.ts";

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export interface PartSpec {
  readonly name: string;
  readonly surface: SurfaceClass;
  readonly tint?: Rgb;
}

export interface Vertex {
  /** Position in the car frame. */
  readonly p: Vec3;
  /** Unit normal. */
  readonly n: Vec3;
  /** Surface parameters of the patch the vertex came from; used only for clipping. */
  readonly q: Vec2;
}

export interface Triangle {
  readonly v: readonly [Vertex, Vertex, Vertex];
  readonly part: PartSpec;
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > 0 ? [v[0] / length, v[1] / length, v[2] / length] : [0, 1, 0];
}

function positionKey(p: Vec3): string {
  return `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)},${Math.round(p[2] * 1e5)}`;
}

export interface GridOptions {
  readonly columns: number;
  readonly rows: number;
  /** Point of the grid at column i, row j, with optional surface parameters. */
  readonly at: (i: number, j: number) => { p: Vec3; q?: Vec2 };
  readonly part: PartSpec;
  /**
   * A direction that points away from the surface at a given point. It only decides
   * which way the whole grid faces, so a rough direction is enough.
   */
  readonly outward: (p: Vec3) => Vec3;
}

/**
 * Triangulates a grid of points and gives it smooth normals. Grid points that share
 * a position (a pole, a wrap-around seam) share a normal, so the surface stays smooth
 * there; separate grids never share normals, which is how creases are made.
 */
export function gridSurface({ columns, rows, at, part, outward }: GridOptions): Triangle[] {
  const points: { p: Vec3; q: Vec2 }[] = [];
  for (let i = 0; i < columns; i++) {
    for (let j = 0; j < rows; j++) {
      const point = at(i, j);
      points.push({ p: point.p, q: point.q ?? [i, j] });
    }
  }
  const index = (i: number, j: number) => i * rows + j;

  const cells: [number, number, number][] = [];
  for (let i = 0; i + 1 < columns; i++) {
    for (let j = 0; j + 1 < rows; j++) {
      cells.push([index(i, j), index(i + 1, j), index(i, j + 1)]);
      cells.push([index(i + 1, j), index(i + 1, j + 1), index(i, j + 1)]);
    }
  }

  // Area-weighted face normals, accumulated per position.
  const sums = new Map<string, Vec3>();
  const keys = points.map((point) => positionKey(point.p));
  let facing = 0;
  const faces: ([number, number, number] | undefined)[] = cells.map((cell) => {
    const [a, b, c] = cell;
    const normal = cross(sub(points[b].p, points[a].p), sub(points[c].p, points[a].p));
    if (Math.hypot(normal[0], normal[1], normal[2]) < 1e-14) return undefined;
    facing += dot(normal, outward(points[a].p));
    for (const corner of cell) {
      const sum = sums.get(keys[corner]);
      if (sum) {
        sum[0] += normal[0];
        sum[1] += normal[1];
        sum[2] += normal[2];
      } else {
        sums.set(keys[corner], [...normal]);
      }
    }
    return cell;
  });

  const sign = facing < 0 ? -1 : 1;
  const vertices: Vertex[] = points.map((point, i) => {
    const sum = sums.get(keys[i]) ?? [0, 1, 0];
    return { p: point.p, n: normalize([sum[0] * sign, sum[1] * sign, sum[2] * sign]), q: point.q };
  });

  const triangles: Triangle[] = [];
  for (const face of faces) {
    if (!face) continue;
    const [a, b, c] = face;
    triangles.push({
      v:
        sign > 0
          ? [vertices[a], vertices[b], vertices[c]]
          : [vertices[a], vertices[c], vertices[b]],
      part,
    });
  }
  return triangles;
}

/** A flat polygon as a triangle fan around its first point, with one given normal. */
export function flatFan(points: readonly Vec3[], normal: Vec3, part: PartSpec): Triangle[] {
  const n = normalize(normal);
  const vertices = points.map((p): Vertex => ({ p, n, q: [0, 0] }));
  const triangles: Triangle[] = [];
  for (let i = 1; i + 1 < vertices.length; i++) {
    const a = vertices[0];
    let b = vertices[i];
    let c = vertices[i + 1];
    if (dot(cross(sub(b.p, a.p), sub(c.p, a.p)), n) < 0) [b, c] = [c, b];
    triangles.push({ v: [a, b, c], part });
  }
  return triangles;
}

function lexicographicallyBefore(a: Vertex, b: Vertex): boolean {
  for (let axis = 0; axis < 3; axis++) {
    if (a.p[axis] !== b.p[axis]) return a.p[axis] < b.p[axis];
  }
  return true;
}

function mix(a: Vertex, b: Vertex, t: number): Vertex {
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    p: [lerp(a.p[0], b.p[0]), lerp(a.p[1], b.p[1]), lerp(a.p[2], b.p[2])],
    n: normalize([lerp(a.n[0], b.n[0]), lerp(a.n[1], b.n[1]), lerp(a.n[2], b.n[2])]),
    q: [lerp(a.q[0], b.q[0]), lerp(a.q[1], b.q[1])],
  };
}

export interface ReclassOptions {
  /** Which triangles the outline may cut. */
  readonly select: (triangle: Triangle) => boolean;
  /** Maps a vertex into the plane the outline is drawn in. */
  readonly project: (vertex: Vertex) => Vec2;
  /** A convex outline in that plane, in either winding. */
  readonly outline: readonly Vec2[];
  /** The part that takes over the surface inside the outline. */
  readonly part: PartSpec;
}

/**
 * Hands the region of a surface that falls inside a convex outline to another part,
 * cutting triangles along the outline so the boundary is exact. Normals are
 * interpolated, so shading stays continuous across the new boundary.
 */
export function reclass(triangles: readonly Triangle[], options: ReclassOptions): Triangle[] {
  const { select, project, outline, part } = options;
  let area = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const orientation = area < 0 ? -1 : 1;
  // Signed distance-like value: positive inside edge i.
  const side = (edge: number, point: Vec2): number => {
    const a = outline[edge];
    const b = outline[(edge + 1) % outline.length];
    return orientation * ((b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]));
  };

  const result: Triangle[] = [];
  const emit = (polygon: readonly Vertex[], target: PartSpec) => {
    for (let i = 1; i + 1 < polygon.length; i++) {
      const tri: [Vertex, Vertex, Vertex] = [polygon[0], polygon[i], polygon[i + 1]];
      const normal = cross(sub(tri[1].p, tri[0].p), sub(tri[2].p, tri[0].p));
      if (Math.hypot(normal[0], normal[1], normal[2]) < 1e-14) continue;
      result.push({ v: tri, part: target });
    }
  };

  for (const triangle of triangles) {
    if (!select(triangle)) {
      result.push(triangle);
      continue;
    }
    const projected = triangle.v.map(project);
    // Entirely beyond one edge: untouched.
    let outside = false;
    for (let edge = 0; edge < outline.length && !outside; edge++) {
      outside = projected.every((point) => side(edge, point) <= 0);
    }
    if (outside) {
      result.push(triangle);
      continue;
    }

    let inside: Vertex[] = [...triangle.v];
    const leftovers: Vertex[][] = [];
    for (let edge = 0; edge < outline.length && inside.length >= 3; edge++) {
      const distances = inside.map((vertex) => side(edge, project(vertex)));
      if (distances.every((d) => d >= 0)) continue;
      const keep: Vertex[] = [];
      const drop: Vertex[] = [];
      for (let i = 0; i < inside.length; i++) {
        const current = inside[i];
        const next = inside[(i + 1) % inside.length];
        const dc = distances[i];
        const dn = distances[(i + 1) % inside.length];
        if (dc >= 0) keep.push(current);
        if (dc <= 0) drop.push(current);
        if ((dc > 0 && dn < 0) || (dc < 0 && dn > 0)) {
          // Interpolate from a canonical end so both triangles sharing this edge
          // compute the very same point.
          const forward = lexicographicallyBefore(current, next);
          const from = forward ? current : next;
          const to = forward ? next : current;
          const df = forward ? dc : dn;
          const dt = forward ? dn : dc;
          const cut = mix(from, to, df / (df - dt));
          keep.push(cut);
          drop.push(cut);
        }
      }
      if (drop.length >= 3) leftovers.push(drop);
      inside = keep;
    }

    if (inside.length < 3) {
      result.push(triangle);
      continue;
    }
    for (const leftover of leftovers) emit(leftover, triangle.part);
    emit(inside, part);
  }
  return result;
}

/** Mirrors triangles across the car's centre plane (z -> -z), keeping them outward-facing. */
export function mirrorZ(triangles: readonly Triangle[]): Triangle[] {
  const flip = (vertex: Vertex): Vertex => ({
    p: [vertex.p[0], vertex.p[1], -vertex.p[2]],
    n: [vertex.n[0], vertex.n[1], -vertex.n[2]],
    q: vertex.q,
  });
  return triangles.map((triangle) => ({
    v: [flip(triangle.v[0]), flip(triangle.v[2]), flip(triangle.v[1])],
    part: triangle.part,
  }));
}

/** Groups triangles by part and welds shared vertices into indexed geometry. */
export function buildParts(triangles: readonly Triangle[]): CarPart[] {
  const groups = new Map<PartSpec, Triangle[]>();
  for (const triangle of triangles) {
    const group = groups.get(triangle.part);
    if (group) group.push(triangle);
    else groups.set(triangle.part, [triangle]);
  }

  const parts: CarPart[] = [];
  for (const [spec, group] of groups) {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const welded = new Map<string, number>();
    for (const triangle of group) {
      for (const vertex of triangle.v) {
        const key = `${positionKey(vertex.p)}|${Math.round(vertex.n[0] * 1e3)},${Math.round(vertex.n[1] * 1e3)},${Math.round(vertex.n[2] * 1e3)}`;
        let index = welded.get(key);
        if (index === undefined) {
          index = positions.length / 3;
          welded.set(key, index);
          positions.push(...vertex.p);
          normals.push(...vertex.n);
        }
        indices.push(index);
      }
    }
    parts.push({
      name: spec.name,
      surface: spec.surface,
      ...(spec.tint ? { tint: spec.tint } : {}),
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      indices: new Uint32Array(indices),
    });
  }
  return parts;
}
