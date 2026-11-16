/**
 * Turns a car model published as glTF into the workshop's own car file,
 * `models/porsche-911.car` (the format of `src/car/format.ts`).
 *
 *   pnpm import-car <plain.glb>
 *
 * The whole procedure, for the car the workshop shows:
 *
 * 1. Download the source:
 *    https://raw.githubusercontent.com/playcanvas/web-components/main/examples/assets/models/porsche-911-carrera-4s.glb
 * 2. Decode its compressed meshes into a plain GLB:
 *    npx -y @gltf-transform/cli@4 copy <in.glb> <out.glb>
 * 3. Run `pnpm import-car <out.glb>`, which writes the car file and prints a line
 *    per part (name, class, triangles) and the car's bounds.
 * 4. Run `pnpm guides`, which redraws `designs/_guides/` from the new car.
 *
 * The path given is relative to the directory the command is run from. Only an
 * uncompressed binary glTF 2.0 file is read: of each triangle primitive its
 * positions, normals and indices; every other attribute, texture and extension is
 * ignored. The node hierarchy of the default scene is applied in full. Primitives are
 * grouped by material, one part per material, through `MATERIALS`; a material the
 * table does not name stops the import. The result is turned into the car frame by
 * `AXES`, scaled to `LENGTH` and stood on its wheels, centred in length and width.
 *
 * A different car is a different set of the constants below.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { encodeCar } from "../src/car/format.ts";
import { modelBounds, type CarPart, type Rgb, type SurfaceClass } from "../src/car/model.ts";

/*
 * The source: "(FREE) Porsche 911 Carrera 4S" by Karol Miklas
 * (https://sketchfab.com/3d-models/free-porsche-911-carrera-4s-d01b254483794de3819786d93e0e1ebf),
 * licensed CC BY-SA 4.0 (http://creativecommons.org/licenses/by-sa/4.0/); the copy
 * read here is the one at
 * https://raw.githubusercontent.com/playcanvas/web-components/main/examples/assets/models/porsche-911-carrera-4s.glb
 */

/** The model's name in the car file. */
const MODEL_NAME = "Porsche 911 Carrera 4S";

/** Where the car file is written, relative to the repository root. */
const OUTPUT = "models/porsche-911.car";

/** The car's length in metres: the x extent of every kept part. */
const LENGTH = 4.519;

/**
 * Each car-frame axis (x, y, z) as a source axis (0 x, 1 y, 2 z) and a sign, after the
 * source scene's own transforms.
 */
const AXES: readonly (readonly [axis: number, sign: number])[] = [
  [2, 1],
  [1, 1],
  [0, -1],
];

/**
 * Every material of the source: the surface class and tint (linear RGB) of the part it
 * becomes, which is named after the material, or `drop` for geometry left out.
 */
const MATERIALS: Readonly<Record<string, { surface: SurfaceClass; tint?: Rgb } | "drop">> = {
  paint: { surface: "paint" },
  window: { surface: "glass" },
  glass: { surface: "light", tint: [0.8, 0.82, 0.85] },
  lights: { surface: "light", tint: [0.85, 0.87, 0.9] },
  plastic: { surface: "trim", tint: [0.02, 0.02, 0.022] },
  full_black: { surface: "trim", tint: [0.01, 0.01, 0.011] },
  tex_shiny: { surface: "trim", tint: [0.05, 0.05, 0.05] },
  "Material.001": { surface: "trim", tint: [0.8, 0.25, 0] },
  logo: { surface: "trim", tint: [0.6, 0.5, 0.2] },
  license: { surface: "trim", tint: [0.7, 0.7, 0.7] },
  silver: { surface: "wheel", tint: [0.55, 0.55, 0.56] },
  rubber: { surface: "wheel", tint: [0.02, 0.02, 0.02] },
  coat: "drop",
  Material: "drop",
};

/** Extensions that compress mesh data, which this script does not decode. */
const COMPRESSION = ["KHR_draco_mesh_compression", "EXT_meshopt_compression"];

const REPOSITORY = fileURLToPath(new URL("../", import.meta.url));

/** The parts of the glTF JSON this script reads. */
interface Gltf {
  readonly extensionsRequired?: readonly string[];
  readonly scene?: number;
  readonly scenes?: readonly { readonly nodes?: readonly number[] }[];
  readonly nodes?: readonly GltfNode[];
  readonly meshes?: readonly {
    readonly name?: string;
    readonly primitives: readonly GltfPrimitive[];
  }[];
  readonly materials?: readonly { readonly name?: string }[];
  readonly accessors?: readonly GltfAccessor[];
  readonly bufferViews?: readonly {
    readonly buffer: number;
    readonly byteOffset?: number;
    readonly byteStride?: number;
  }[];
  readonly buffers?: readonly { readonly uri?: string }[];
}

interface GltfNode {
  readonly children?: readonly number[];
  readonly mesh?: number;
  readonly matrix?: readonly number[];
  readonly translation?: readonly number[];
  readonly rotation?: readonly number[];
  readonly scale?: readonly number[];
}

interface GltfPrimitive {
  readonly attributes: Readonly<Record<string, number>>;
  readonly indices?: number;
  readonly material?: number;
  readonly mode?: number;
}

interface GltfAccessor {
  readonly bufferView?: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
  readonly type: string;
  readonly sparse?: unknown;
}

/** A column-major 4 × 4 matrix, as glTF stores them. */
type Matrix = Float64Array;

const FLOAT = 5126;
const INDEX_TYPES: Readonly<
  Record<number, { size: number; read: (view: DataView, at: number) => number }>
> = {
  5121: { size: 1, read: (view, at) => view.getUint8(at) },
  5123: { size: 2, read: (view, at) => view.getUint16(at, true) },
  5125: { size: 4, read: (view, at) => view.getUint32(at, true) },
};
const TRIANGLES = 4;

/** Ends the script with a message. */
function stop(message: string): never {
  console.error(`import-car: ${message}`);
  process.exit(1);
}

/** The JSON and binary chunk of a GLB file. */
function readGlb(bytes: Uint8Array): { gltf: Gltf; bin: DataView | undefined } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67) {
    stop("not a binary glTF (GLB) file");
  }
  if (view.getUint32(4, true) !== 2) stop("only glTF 2.0 is supported");
  let gltf: Gltf | undefined;
  let bin: DataView | undefined;
  for (let at = 12; at + 8 <= bytes.length;) {
    const length = view.getUint32(at, true);
    const type = view.getUint32(at + 4, true);
    const start = at + 8;
    if (start + length > bytes.length) stop("the file ends early");
    if (type === 0x4e4f534a) {
      gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + length))) as Gltf;
    } else if (type === 0x004e4942 && bin === undefined) {
      bin = new DataView(bytes.buffer, bytes.byteOffset + start, length);
    }
    at = start + Math.ceil(length / 4) * 4;
  }
  if (gltf === undefined) stop("the file has no JSON chunk");
  return { gltf, bin };
}

function identity(): Matrix {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

function multiply(a: Matrix, b: Matrix): Matrix {
  const out = new Float64Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[column * 4 + k];
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

/** A node's local transform: its matrix, or translation × rotation × scale. */
function localMatrix(node: GltfNode): Matrix {
  if (node.matrix) return Float64Array.from(node.matrix);
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  // prettier-ignore
  return Float64Array.from([
    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]);
}

/**
 * The inverse-transpose of a matrix's upper 3 × 3, column-major, which carries normals,
 * and the determinant of that 3 × 3, whose sign says whether the winding flips.
 */
function normalMatrix(m: Matrix): { matrix: Float64Array; determinant: number } {
  const a = m[0],
    b = m[4],
    c = m[8];
  const d = m[1],
    e = m[5],
    f = m[9];
  const g = m[2],
    h = m[6],
    i = m[10];
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  // The cofactor matrix is the inverse-transpose times the determinant; only the
  // direction of a normal matters, so it is used as it is, its sign kept positive.
  const s = determinant < 0 ? -1 : 1;
  // prettier-ignore
  const matrix = Float64Array.from([
    s * (e * i - f * h), s * (c * h - b * i), s * (b * f - c * e),
    s * (f * g - d * i), s * (a * i - c * g), s * (c * d - a * f),
    s * (d * h - e * g), s * (b * g - a * h), s * (a * e - b * d),
  ]);
  return { matrix, determinant };
}

/** Reads a FLOAT VEC3 accessor, honouring the buffer view's stride. */
function readVec3(gltf: Gltf, bin: DataView, index: number, what: string): Float32Array {
  const accessor = gltf.accessors?.[index];
  if (!accessor) stop(`${what}: no accessor ${index}`);
  if (accessor.componentType !== FLOAT || accessor.type !== "VEC3") {
    stop(`${what}: only FLOAT VEC3 is supported`);
  }
  if (accessor.sparse !== undefined) stop(`${what}: sparse accessors are not supported`);
  const { start, stride } = accessorLayout(gltf, accessor, 12, what);
  const out = new Float32Array(accessor.count * 3);
  for (let v = 0; v < accessor.count; v++) {
    const at = start + v * stride;
    if (at + 12 > bin.byteLength) stop(`${what}: data ends early`);
    for (let k = 0; k < 3; k++) out[v * 3 + k] = bin.getFloat32(at + k * 4, true);
  }
  return out;
}

/** Reads a primitive's triangle indices, or numbers its vertices when it has none. */
function readIndices(
  gltf: Gltf,
  bin: DataView,
  index: number | undefined,
  vertexCount: number,
  what: string,
): Uint32Array {
  if (index === undefined) return Uint32Array.from({ length: vertexCount }, (_, i) => i);
  const accessor = gltf.accessors?.[index];
  if (!accessor) stop(`${what}: no accessor ${index}`);
  const type = INDEX_TYPES[accessor.componentType];
  if (!type || accessor.type !== "SCALAR") stop(`${what}: unsupported index type`);
  const { start, stride } = accessorLayout(gltf, accessor, type.size, what);
  const out = new Uint32Array(accessor.count);
  for (let i = 0; i < accessor.count; i++) {
    const at = start + i * stride;
    if (at + type.size > bin.byteLength) stop(`${what}: data ends early`);
    out[i] = type.read(bin, at);
    if (out[i] >= vertexCount) stop(`${what}: an index is out of range`);
  }
  return out;
}

/** Where an accessor's first element starts in the binary chunk, and its stride. */
function accessorLayout(gltf: Gltf, accessor: GltfAccessor, size: number, what: string) {
  if (accessor.bufferView === undefined) stop(`${what}: an accessor without data`);
  const view = gltf.bufferViews?.[accessor.bufferView];
  if (!view) stop(`${what}: no buffer view ${accessor.bufferView}`);
  if (view.buffer !== 0 || gltf.buffers?.[0]?.uri !== undefined) {
    stop(`${what}: only data inside the GLB file is supported`);
  }
  return {
    start: (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
    stride: view.byteStride ?? size,
  };
}

/** One primitive's triangles in the source scene's frame, after the node transforms. */
interface Piece {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
}

/** Walks the default scene and groups its triangle primitives by material name. */
function collectPieces(gltf: Gltf, bin: DataView | undefined): Map<string, Piece[]> {
  const pieces = new Map<string, Piece[]>();
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  if (!scene) stop("the file has no scene");

  const visit = (index: number, parent: Matrix) => {
    const node = gltf.nodes?.[index];
    if (!node) stop(`no node ${index}`);
    const world = multiply(parent, localMatrix(node));
    if (node.mesh !== undefined) {
      const mesh = gltf.meshes?.[node.mesh];
      if (!mesh) stop(`no mesh ${node.mesh}`);
      mesh.primitives.forEach((primitive, p) => {
        const what = `mesh ${mesh.name ?? node.mesh} primitive ${p}`;
        const material =
          primitive.material === undefined
            ? "(no material)"
            : (gltf.materials?.[primitive.material]?.name ?? `(material ${primitive.material})`);
        const entry = MATERIALS[material];
        if (entry === undefined) stop(`the material "${material}" is not in the table`);
        if (entry === "drop") return;
        if ((primitive.mode ?? TRIANGLES) !== TRIANGLES)
          stop(`${what}: only triangles are supported`);
        if (bin === undefined) stop("the file has no binary chunk");
        if (primitive.attributes.POSITION === undefined) stop(`${what}: no positions`);
        if (primitive.attributes.NORMAL === undefined) stop(`${what}: no normals`);
        const positions = readVec3(gltf, bin, primitive.attributes.POSITION, what);
        const normals = readVec3(gltf, bin, primitive.attributes.NORMAL, what);
        const vertexCount = positions.length / 3;
        if (normals.length !== positions.length)
          stop(`${what}: normals and positions differ in count`);
        const indices = readIndices(gltf, bin, primitive.indices, vertexCount, what);
        const piece = transformPiece(world, positions, normals, indices);
        const group = pieces.get(material);
        if (group) group.push(piece);
        else pieces.set(material, [piece]);
      });
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const root of scene.nodes ?? []) visit(root, identity());
  return pieces;
}

/** Applies a node's world transform to a primitive, in place. */
function transformPiece(
  world: Matrix,
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
): Piece {
  const { matrix: n, determinant } = normalMatrix(world);
  for (let v = 0; v < positions.length; v += 3) {
    const [x, y, z] = [positions[v], positions[v + 1], positions[v + 2]];
    for (let k = 0; k < 3; k++) {
      positions[v + k] = world[k] * x + world[4 + k] * y + world[8 + k] * z + world[12 + k];
    }
    const [nx, ny, nz] = [normals[v], normals[v + 1], normals[v + 2]];
    const tx = n[0] * nx + n[3] * ny + n[6] * nz;
    const ty = n[1] * nx + n[4] * ny + n[7] * nz;
    const tz = n[2] * nx + n[5] * ny + n[8] * nz;
    const length = Math.hypot(tx, ty, tz) || 1;
    normals[v] = tx / length;
    normals[v + 1] = ty / length;
    normals[v + 2] = tz / length;
  }
  // A mirroring transform turns every triangle inside out: its winding is restored.
  if (determinant < 0) {
    for (let t = 0; t + 2 < indices.length; t += 3) {
      const second = indices[t + 1];
      indices[t + 1] = indices[t + 2];
      indices[t + 2] = second;
    }
  }
  return { positions, normals, indices };
}

/** Merges a material's primitives into one part, with car-frame axes but no scale yet. */
function mergePieces(
  name: string,
  entry: { surface: SurfaceClass; tint?: Rgb },
  pieces: Piece[],
): CarPart {
  let vertexCount = 0;
  let indexCount = 0;
  for (const piece of pieces) {
    vertexCount += piece.positions.length / 3;
    indexCount += piece.indices.length;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(indexCount);
  let vertex = 0;
  let index = 0;
  for (const piece of pieces) {
    for (let v = 0; v < piece.positions.length; v += 3) {
      const out = vertex * 3 + v;
      for (let k = 0; k < 3; k++) {
        const [from, sign] = AXES[k];
        positions[out + k] = sign * piece.positions[v + from];
        normals[out + k] = sign * piece.normals[v + from];
      }
    }
    for (let i = 0; i < piece.indices.length; i++) indices[index++] = piece.indices[i] + vertex;
    vertex += piece.positions.length / 3;
  }
  return {
    name,
    surface: entry.surface,
    ...(entry.tint ? { tint: entry.tint } : {}),
    positions,
    normals,
    indices,
  };
}

const input = process.argv[2];
if (input === undefined) stop("usage: pnpm import-car <plain.glb>");
const source = readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), input));
const { gltf, bin } = readGlb(source);
if (gltf.extensionsRequired?.some((extension) => COMPRESSION.includes(extension))) {
  stop(
    "the file is compressed; decode it first: npx -y @gltf-transform/cli@4 copy <in.glb> <out.glb>",
  );
}

const pieces = collectPieces(gltf, bin);
const parts: CarPart[] = [];
for (const [name, entry] of Object.entries(MATERIALS)) {
  const found = pieces.get(name);
  if (entry === "drop" || found === undefined) continue;
  parts.push(mergePieces(name, entry, found));
}
if (parts.length === 0) stop("no geometry is left to import");

// Scale to the car's length, then stand it on its wheels, centred in length and width.
const unscaled = modelBounds({ name: MODEL_NAME, parts, seams: [] });
const scale = LENGTH / (unscaled.max[0] - unscaled.min[0]);
let lowestWheel = Infinity;
for (const part of parts) {
  if (part.surface !== "wheel") continue;
  for (let v = 1; v < part.positions.length; v += 3) {
    lowestWheel = Math.min(lowestWheel, part.positions[v]);
  }
}
if (lowestWheel === Infinity) stop("no wheel parts: the car cannot be stood on the ground");
const offset = [
  (-(unscaled.min[0] + unscaled.max[0]) / 2) * scale,
  -lowestWheel * scale,
  (-(unscaled.min[2] + unscaled.max[2]) / 2) * scale,
];
for (const part of parts) {
  for (let v = 0; v < part.positions.length; v += 3) {
    for (let k = 0; k < 3; k++) part.positions[v + k] = part.positions[v + k] * scale + offset[k];
  }
}

const model = { name: MODEL_NAME, parts, seams: [] };
const file = `${REPOSITORY}${OUTPUT}`;
const bytes = encodeCar(model);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, bytes);

for (const part of parts) {
  console.log(`${part.name}  ${part.surface}  ${part.indices.length / 3} triangles`);
}
const { min, max } = modelBounds(model);
const extent = (axis: number) => (max[axis] - min[axis]).toFixed(3);
const range = (axis: number) => `${min[axis].toFixed(3)}..${max[axis].toFixed(3)}`;
console.log(
  `bounds: x ${range(0)}, y ${range(1)}, z ${range(2)} m; ` +
    `${extent(0)} × ${extent(1)} × ${extent(2)} m (length × height × width)`,
);
console.log(`${OUTPUT}: ${bytes.length} bytes`);
