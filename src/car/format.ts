/**
 * The `.car` file: the workshop's own compact form of a `CarModel`, written by
 * `scripts/import-car.ts` and read by the browser and the Node scripts alike.
 *
 * Layout, little-endian:
 *
 * - the 4 bytes `LCAR`;
 * - a `uint32` format version (`VERSION`);
 * - a `uint32` byte length of the header JSON;
 * - the header JSON, UTF-8, padded with spaces to a multiple of 4 bytes (`CarHeader`);
 * - the binary data, which the header's byte offsets count from.
 *
 * A part is stored as chunks of at most 65 536 vertices, so that every index fits a
 * `uint16`. Per chunk, each array padded to a multiple of 4 bytes: positions as
 * 3 × `uint16` per vertex, quantised over the model's bounds; normals as 2 × `int16`
 * per vertex, octahedral; triangle indices as `uint16`, local to the chunk.
 */
import { modelBounds, SURFACE_CLASSES, type CarModel, type CarPart, type Rgb } from "./model.ts";

const MAGIC = "LCAR";
const VERSION = 1;
/** Bytes before the header JSON: magic, version, JSON length. */
const PREAMBLE = 12;
/** The most vertices one chunk holds: every local index fits a `uint16`. */
const CHUNK_VERTICES = 65_536;
const QUANTUM = 65_535;
const NORMAL_SCALE = 32_767;

/** The header JSON. */
interface CarHeader {
  readonly name: string;
  /** Position `p` on axis `a` is stored as `round((p - origin[a]) / step[a])`. */
  readonly quantization: {
    readonly origin: readonly [number, number, number];
    readonly step: readonly [number, number, number];
  };
  readonly parts: readonly PartHeader[];
}

interface PartHeader {
  readonly name: string;
  readonly surface: CarPart["surface"];
  readonly tint?: Rgb;
  readonly chunks: readonly ChunkHeader[];
}

/** One chunk: its counts, and where its arrays start in the binary data. */
interface ChunkHeader {
  readonly vertices: number;
  readonly indices: number;
  readonly positionOffset: number;
  readonly normalOffset: number;
  readonly indexOffset: number;
}

/** A chunk before it is written: global vertex numbers and local triangle indices. */
interface ChunkPlan {
  readonly vertices: number[];
  readonly indices: number[];
}

export function encodeCar(model: CarModel): Uint8Array {
  const bounds = modelBounds(model);
  const origin: [number, number, number] = [0, 0, 0];
  const step: [number, number, number] = [1, 1, 1];
  for (let axis = 0; axis < 3; axis++) {
    const min = Number.isFinite(bounds.min[axis]) ? bounds.min[axis] : 0;
    const extent = Number.isFinite(bounds.max[axis]) ? bounds.max[axis] - min : 0;
    origin[axis] = min;
    // A flat axis keeps a step of 1: every value on it is stored as 0.
    step[axis] = extent > 0 ? extent / QUANTUM : 1;
  }

  // Lay out every chunk's arrays first, so the header can name their offsets.
  let offset = 0;
  const reserve = (bytes: number) => {
    const at = offset;
    offset += align4(bytes);
    return at;
  };
  const plans = model.parts.map((part) => splitIntoChunks(part));
  const parts: PartHeader[] = model.parts.map((part, p) => ({
    name: part.name,
    surface: part.surface,
    ...(part.tint ? { tint: [part.tint[0], part.tint[1], part.tint[2]] as const } : {}),
    chunks: plans[p].map((chunk) => ({
      vertices: chunk.vertices.length,
      indices: chunk.indices.length,
      positionOffset: reserve(chunk.vertices.length * 6),
      normalOffset: reserve(chunk.vertices.length * 4),
      indexOffset: reserve(chunk.indices.length * 2),
    })),
  }));
  const header: CarHeader = { name: model.name, quantization: { origin, step }, parts };

  let json = new TextEncoder().encode(JSON.stringify(header));
  if (json.length % 4 !== 0) {
    const padded = new Uint8Array(align4(json.length)).fill(0x20);
    padded.set(json);
    json = padded;
  }

  const bytes = new Uint8Array(PREAMBLE + json.length + offset);
  const data = new DataView(bytes.buffer);
  for (let i = 0; i < 4; i++) bytes[i] = MAGIC.charCodeAt(i);
  data.setUint32(4, VERSION, true);
  data.setUint32(8, json.length, true);
  bytes.set(json, PREAMBLE);
  const base = PREAMBLE + json.length;

  model.parts.forEach((part, p) => {
    plans[p].forEach((chunk, c) => {
      const layout = parts[p].chunks[c];
      chunk.vertices.forEach((vertex, local) => {
        const at = base + layout.positionOffset + local * 6;
        for (let axis = 0; axis < 3; axis++) {
          const value = (part.positions[vertex * 3 + axis] - origin[axis]) / step[axis];
          data.setUint16(at + axis * 2, Math.min(QUANTUM, Math.max(0, Math.round(value))), true);
        }
        const [u, v] = encodeOctahedral(
          part.normals[vertex * 3],
          part.normals[vertex * 3 + 1],
          part.normals[vertex * 3 + 2],
        );
        const normalAt = base + layout.normalOffset + local * 4;
        data.setInt16(normalAt, u, true);
        data.setInt16(normalAt + 2, v, true);
      });
      chunk.indices.forEach((index, i) => {
        data.setUint16(base + layout.indexOffset + i * 2, index, true);
      });
    });
  });
  return bytes;
}

export function decodeCar(bytes: Uint8Array): CarModel {
  if (bytes.length < PREAMBLE) throw new Error("data ends early, in the preamble");
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== MAGIC.charCodeAt(i)) throw new Error("not a car file");
  }
  // The bytes may be a view at any offset of their buffer: DataView reads need no
  // alignment.
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = data.getUint32(4, true);
  if (version !== VERSION) throw new Error(`unknown format version ${version}`);
  const jsonLength = data.getUint32(8, true);
  const base = PREAMBLE + jsonLength;
  if (base > bytes.length) throw new Error("data ends early, in the header");
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(PREAMBLE, base))) as CarHeader;
  const { origin, step } = header.quantization;

  const parts = header.parts.map((partHeader): CarPart => {
    if (!SURFACE_CLASSES.includes(partHeader.surface)) {
      throw new Error(`unknown surface class ${String(partHeader.surface)}`);
    }
    let vertexCount = 0;
    let indexCount = 0;
    for (const chunk of partHeader.chunks) {
      vertexCount += chunk.vertices;
      indexCount += chunk.indices;
    }
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const indices = new Uint32Array(indexCount);
    let vertex = 0;
    let index = 0;
    for (const chunk of partHeader.chunks) {
      const within = (offset: number, length: number) => {
        if (base + offset + length > bytes.length) throw new Error("data ends early");
        return base + offset;
      };
      const positionAt = within(chunk.positionOffset, chunk.vertices * 6);
      const normalAt = within(chunk.normalOffset, chunk.vertices * 4);
      const indexAt = within(chunk.indexOffset, chunk.indices * 2);
      for (let local = 0; local < chunk.vertices; local++) {
        const out = (vertex + local) * 3;
        for (let axis = 0; axis < 3; axis++) {
          const stored = data.getUint16(positionAt + local * 6 + axis * 2, true);
          positions[out + axis] = origin[axis] + stored * step[axis];
        }
        decodeOctahedral(
          data.getInt16(normalAt + local * 4, true),
          data.getInt16(normalAt + local * 4 + 2, true),
          normals,
          out,
        );
      }
      for (let i = 0; i < chunk.indices; i++) {
        const local = data.getUint16(indexAt + i * 2, true);
        if (local >= chunk.vertices) throw new Error("a triangle index is out of range");
        indices[index++] = vertex + local;
      }
      vertex += chunk.vertices;
    }
    return {
      name: partHeader.name,
      surface: partHeader.surface,
      ...(partHeader.tint ? { tint: partHeader.tint } : {}),
      positions,
      normals,
      indices,
    };
  });
  return { name: header.name, parts, seams: [] };
}

/**
 * Splits a part's triangles, in order, into chunks of at most `CHUNK_VERTICES`
 * vertices. A vertex used on both sides of a chunk boundary is stored in both.
 */
function splitIntoChunks(part: CarPart): ChunkPlan[] {
  const chunks: ChunkPlan[] = [];
  // Each vertex's local number in the current chunk, or -1 when it has none yet.
  const local = new Int32Array(part.positions.length / 3).fill(-1);
  let current: ChunkPlan = { vertices: [], indices: [] };
  const finish = () => {
    for (const vertex of current.vertices) local[vertex] = -1;
    chunks.push(current);
    current = { vertices: [], indices: [] };
  };
  for (let t = 0; t + 2 < part.indices.length; t += 3) {
    const triangle = [part.indices[t], part.indices[t + 1], part.indices[t + 2]];
    // At most three new vertices: a chunk that could overflow is finished first.
    if (current.vertices.length + 3 > CHUNK_VERTICES) finish();
    for (const vertex of triangle) {
      if (local[vertex] < 0) {
        local[vertex] = current.vertices.length;
        current.vertices.push(vertex);
      }
      current.indices.push(local[vertex]);
    }
  }
  if (current.vertices.length > 0) finish();
  return chunks;
}

/** A unit normal as two signed 16-bit numbers on the octahedron. */
function encodeOctahedral(x: number, y: number, z: number): [number, number] {
  const length = Math.abs(x) + Math.abs(y) + Math.abs(z);
  if (!(length > 0)) return [0, 0];
  let u = x / length;
  let v = y / length;
  if (z < 0) {
    // The lower half folds over the diagonals onto the outer triangles.
    const foldedU = (1 - Math.abs(v)) * signOf(u);
    const foldedV = (1 - Math.abs(u)) * signOf(v);
    u = foldedU;
    v = foldedV;
  }
  return [Math.round(clamp(u) * NORMAL_SCALE), Math.round(clamp(v) * NORMAL_SCALE)];
}

/** Writes the unit normal stored as `encodeOctahedral` gives it into `out` at `at`. */
function decodeOctahedral(storedU: number, storedV: number, out: Float32Array, at: number): void {
  let x = clamp(storedU / NORMAL_SCALE);
  let y = clamp(storedV / NORMAL_SCALE);
  const z = 1 - Math.abs(x) - Math.abs(y);
  if (z < 0) {
    const unfoldedX = (1 - Math.abs(y)) * signOf(x);
    const unfoldedY = (1 - Math.abs(x)) * signOf(y);
    x = unfoldedX;
    y = unfoldedY;
  }
  const length = Math.hypot(x, y, z);
  out[at] = x / length;
  out[at + 1] = y / length;
  out[at + 2] = z / length;
}

function signOf(value: number): number {
  return value < 0 ? -1 : 1;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function align4(bytes: number): number {
  return Math.ceil(bytes / 4) * 4;
}
