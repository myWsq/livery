/**
 * Turns pixel masks into vector lines: the outlines of a mask, its top or bottom edge
 * column by column, and its connected pieces. A mask is one byte per pixel, rows from
 * the top, non-zero where set. Pixel (x, y) spans [x, x + 1] × [y, y + 1], so every
 * coordinate returned is in pixels on that grid. Pure functions, no I/O.
 */

/** Steps along the pixel-corner grid, in clockwise order on screen (y down): east, south, west, north. */
const STEP_X = [1, 0, -1, 0];
const STEP_Y = [0, 1, 0, -1];

/**
 * The boundaries of the set pixels as closed polylines through pixel corners, holes
 * included. Each polyline lists only the corners where it turns and does not repeat
 * its first point. Outer boundaries run clockwise on screen and holes the other way.
 * Diagonal neighbours count as apart, as in `components`: two pixels touching at a
 * corner get two outlines.
 */
export function traceContours(mask: Uint8Array, width: number, height: number): number[][][] {
  const stride = width + 1;
  // Every boundary edge, as a bit for its direction on the corner it leaves from. An
  // edge runs with the set pixel on its right.
  const edges = new Uint8Array(stride * (height + 1));
  const set = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] !== 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 0) continue;
      if (!set(x, y - 1)) edges[y * stride + x] |= 1 << 0;
      if (!set(x + 1, y)) edges[y * stride + x + 1] |= 1 << 1;
      if (!set(x, y + 1)) edges[(y + 1) * stride + x + 1] |= 1 << 2;
      if (!set(x - 1, y)) edges[(y + 1) * stride + x] |= 1 << 3;
    }
  }

  const used = new Uint8Array(edges.length);
  const contours: number[][][] = [];
  for (let start = 0; start < edges.length; start++) {
    const free = edges[start] & ~used[start];
    if (free === 0) continue;
    let direction = 0;
    while (!(free & (1 << direction))) direction++;

    const contour: number[][] = [];
    let corner = start;
    let previous = -1;
    while (!(used[corner] & (1 << direction))) {
      used[corner] |= 1 << direction;
      if (direction !== previous) contour.push([corner % stride, Math.floor(corner / stride)]);
      previous = direction;
      corner += STEP_Y[direction] * stride + STEP_X[direction];
      // Turn right first: on a corner shared by two diagonal pixels that keeps to the
      // pixel already on the right. Elsewhere a corner has a single way on.
      const out = edges[corner];
      const right = (previous + 1) % 4;
      const left = (previous + 3) % 4;
      if (out & (1 << right)) direction = right;
      else if (out & (1 << previous)) direction = previous;
      else direction = left;
    }
    // The loop may have started mid-way along a straight run.
    if (contour.length > 1 && direction === previous) contour.shift();
    contours.push(contour);
  }
  return contours;
}

/**
 * Douglas–Peucker: drops points that lie within `tolerance` of the line through the
 * points kept on either side. A closed polyline does not repeat its first point, in
 * and out.
 */
export function simplify(points: number[][], tolerance: number, closed: boolean): number[][] {
  if (points.length < 3) return points.slice();
  if (!closed) {
    const keep = new Uint8Array(points.length);
    keep[0] = 1;
    keep[points.length - 1] = 1;
    mark(points, 0, points.length - 1, tolerance, keep);
    return points.filter((_, i) => keep[i]);
  }
  // Split the loop at its first point and the point farthest from it, and simplify the
  // two halves as open polylines.
  let far = 0;
  let farDistance = -1;
  for (let i = 1; i < points.length; i++) {
    const distance = Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]);
    if (distance > farDistance) {
      far = i;
      farDistance = distance;
    }
  }
  const loop = [...points, points[0]];
  const keep = new Uint8Array(loop.length);
  keep[0] = 1;
  keep[far] = 1;
  mark(loop, 0, far, tolerance, keep);
  mark(loop, far, loop.length - 1, tolerance, keep);
  return points.filter((_, i) => keep[i]);
}

/** Marks the points between `first` and `last` that Douglas–Peucker keeps. */
function mark(
  points: number[][],
  first: number,
  last: number,
  tolerance: number,
  keep: Uint8Array,
): void {
  // A stack of ranges rather than recursion: an outline can have many thousand points.
  const ranges = [first, last];
  while (ranges.length > 0) {
    const end = ranges.pop()!;
    const begin = ranges.pop()!;
    let worst = -1;
    let worstDistance = tolerance;
    for (let i = begin + 1; i < end; i++) {
      const distance = distanceToSegment(points[i], points[begin], points[end]);
      if (distance > worstDistance) {
        worst = i;
        worstDistance = distance;
      }
    }
    if (worst < 0) continue;
    keep[worst] = 1;
    ranges.push(begin, worst, worst, end);
  }
}

function distanceToSegment(point: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy));
}

/**
 * The top or bottom edge of a mask, column by column: for each column with set pixels,
 * the top of its first set pixel or the bottom of its last, at the column's centre.
 * Returned as open polylines, broken wherever a column has no set pixel.
 */
export function columnExtremes(
  mask: Uint8Array,
  width: number,
  height: number,
  which: "top" | "bottom",
): number[][][] {
  const lines: number[][][] = [];
  let line: number[][] | undefined;
  for (let x = 0; x < width; x++) {
    let edge = -1;
    if (which === "top") {
      for (let y = 0; y < height; y++) {
        if (mask[y * width + x] !== 0) {
          edge = y;
          break;
        }
      }
    } else {
      for (let y = height - 1; y >= 0; y--) {
        if (mask[y * width + x] !== 0) {
          edge = y + 1;
          break;
        }
      }
    }
    if (edge < 0) {
      line = undefined;
      continue;
    }
    if (!line) {
      line = [];
      lines.push(line);
    }
    line.push([x + 0.5, edge]);
  }
  return lines;
}

/** A 4-connected piece of a mask: its pixel count and the pixels its bounding box spans, inclusive. */
export interface Component {
  readonly area: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** The 4-connected pieces of a mask, in the order their first pixel is met row by row. */
export function components(mask: Uint8Array, width: number, height: number): Component[] {
  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const found: Component[] = [];
  for (let first = 0; first < mask.length; first++) {
    if (mask[first] === 0 || seen[first]) continue;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let top = 0;
    stack[top++] = first;
    seen[first] = 1;
    while (top > 0) {
      const pixel = stack[--top];
      const x = pixel % width;
      const y = (pixel - x) / width;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const visit = (next: number) => {
        if (mask[next] !== 0 && !seen[next]) {
          seen[next] = 1;
          stack[top++] = next;
        }
      };
      if (x > 0) visit(pixel - 1);
      if (x + 1 < width) visit(pixel + 1);
      if (y > 0) visit(pixel - width);
      if (y + 1 < height) visit(pixel + width);
    }
    found.push({ area, minX, minY, maxX, maxY });
  }
  return found;
}
