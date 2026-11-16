import {
  draw,
  effect,
  frame,
  geometry,
  sampler,
  target,
  type Frame,
  type Gpu,
  type ShaderSource,
  type Target,
  type Texture,
} from "vgpu";

import {
  createArtboardTexture,
  createEmptyArtboardTexture,
  type ArtboardRaster,
} from "./artboards.ts";
import type { CameraView } from "./camera.ts";
import {
  modelBounds,
  SURFACE_CLASSES,
  type CarModel,
  type Rgb,
  type SurfaceClass,
} from "./car/index.ts";
import { frameUniforms, VIEWS, type View } from "./frames.ts";

const HDR_FORMAT: GPUTextureFormat = "rgba16float";
const ENV_SIZE: readonly [number, number] = [2048, 1024];
const ENV_LEVELS = 8;
const TEXEL_ANGLE = (2 * Math.PI) / ENV_SIZE[0];

const SKY = {
  sun_direction: [-0.724, 0.09, -0.684],
  sun_angular_size: 0.018,
  sun_color: [1.0, 0.88, 0.72],
  sun_intensity: 26,
  zenith_color: [0.05, 0.15, 0.44],
  cloud_coverage: 0.56,
  horizon_color: [0.36, 0.48, 0.74],
  cloud_scale: 0.75,
  ground_color: [0.05, 0.05, 0.056],
  ground_scale: 4.6,
} as const;

/** Base colour of a part that brings no tint of its own, linear RGB. */
const DEFAULT_TINT: Record<SurfaceClass, Rgb> = {
  paint: [0.62, 0.63, 0.65],
  glass: [0.012, 0.014, 0.016],
  wheel: [0.3, 0.3, 0.3],
  light: [0.85, 0.87, 0.9],
  trim: [0.022, 0.022, 0.024],
};

const SEAMS = {
  color: [0.012, 0.012, 0.014, 1],
  width: 0.004,
  min_pixels: 1.25,
  lift: 0.004,
} as const;

const GROUND_SHADOW = { strength: 0.82, softness: 0.7 } as const;

/** What the car shader writes; the values of its OUTPUT_* constants. */
export const CAR_OUTPUT = { lit: 0, film: 1, surface: 2 } as const;

/** View uniforms before the first frame sets them: every uniform needs a first value. */
const NO_VIEW = {
  view_projection: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  eye: [0, 0, 0, 1],
} as const;

/**
 * The prepared shaders the scene draws with. The browser gets them from the Vite
 * loader and Node from `resolveShader()`; the scene itself never loads a shader.
 */
export interface SceneShaders {
  readonly car: ShaderSource;
  readonly seams: ShaderSource;
  readonly ground: ShaderSource;
  readonly present: ShaderSource;
  readonly sky: ShaderSource;
  readonly blur: ShaderSource;
}

/** What the car draws need to know about a view, perspective or orthographic. */
export interface CarView {
  readonly viewProjection: ArrayLike<number>;
  /**
   * xyz is the camera position when w is 1, or the direction toward an orthographic
   * viewer when w is 0.
   */
  readonly eye: readonly [number, number, number, number];
  /** Clip-space height of one metre at unit clip w (element [1][1] of the projection). */
  readonly projectionScale: number;
}

export async function createScene(
  gpu: Gpu,
  output: Target,
  shaders: SceneShaders,
  model: CarModel,
) {
  const owned = new Set<unknown>();
  try {
    const hdr = own(owned, createSceneTarget(gpu, output.size));
    const envSampler = sampler(gpu, {
      minFilter: "linear",
      magFilter: "linear",
      mipmapFilter: "linear",
      addressModeU: "repeat",
      addressModeV: "clamp-to-edge",
    });
    const sceneSampler = sampler(gpu, {
      minFilter: "linear",
      magFilter: "linear",
    });
    const env = own(owned, await bakeEnvironment(gpu, envSampler, shaders));
    const bounds = modelBounds(model);

    const carGeometry = own(owned, createCarGeometry(gpu, model));
    const car = draw(gpu, { shader: shaders.car, geometry: carGeometry });
    car.set({
      uniforms: {
        ...NO_VIEW,
        env_size: ENV_SIZE,
        texel_angle: TEXEL_ANGLE,
        ambient_lod: ENV_LEVELS - 2,
        output: CAR_OUTPUT.lit,
      },
      env_tex: env,
      env_samp: envSampler,
      artboards: { frames: frameUniforms() },
      film_samp: sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
        maxAnisotropy: 8,
      }),
    });
    // Every artboard starts empty: the car wears no film until a design is applied.
    const film = {} as Record<View, Texture>;
    for (const view of VIEWS) {
      film[view] = own(owned, createEmptyArtboardTexture(gpu));
      car.set({ [filmBinding(view)]: film[view] });
    }

    const seamGeometry = own(owned, createSeamGeometry(gpu, model));
    const seams = draw(gpu, { shader: shaders.seams, geometry: seamGeometry });
    seams.set({ uniforms: { ...NO_VIEW, ...SEAMS, viewport: [1, 1], pixels_per_metre: 1 } });

    const groundGeometry = own(
      owned,
      geometry(gpu, {
        buffers: [
          {
            data: new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
            attributes: { corner: "float32x2" },
          },
        ],
        indices: new Uint16Array([0, 1, 2, 2, 1, 3]),
      }),
    );
    const ground = draw(gpu, {
      shader: shaders.ground,
      geometry: groundGeometry,
      blend: "premultiplied",
      depth: { write: false },
    });
    ground.set({
      uniforms: {
        view_projection: NO_VIEW.view_projection,
        footprint: [
          (bounds.min[0] + bounds.max[0]) / 2,
          (bounds.min[2] + bounds.max[2]) / 2,
          (bounds.max[0] - bounds.min[0]) / 2,
          (bounds.max[2] - bounds.min[2]) / 2,
        ],
        ...GROUND_SHADOW,
      },
    });

    const present = effect(gpu, shaders.present);
    present.set({
      env_tex: env,
      env_samp: envSampler,
      scene_tex: hdr,
      scene_samp: sceneSampler,
    });
    await compileAll([
      () => car.compile(hdr),
      () => seams.compile(hdr),
      () => ground.compile(hdr),
      () => present.compile({ colors: [output.format] }),
    ]);
    return {
      env,
      hdr,
      bounds,
      geometries: [carGeometry, seamGeometry, groundGeometry],
      film,
      car,
      seams,
      ground,
      present,
    };
  } catch (error) {
    runCleanups(cleanupOwned(owned), { error });
  }
}

export type Scene = Awaited<ReturnType<typeof createScene>>;

/** Name of the shader binding that holds a view's artboard. */
function filmBinding(view: View): string {
  return `film_${VIEWS.indexOf(view)}`;
}

/** Replaces one artboard on the car with a freshly rasterised image. */
export function setArtboard(gpu: Gpu, scene: Scene, view: View, raster: ArtboardRaster): void {
  const next = createArtboardTexture(gpu, raster);
  const previous = scene.film[view];
  try {
    scene.car.set({ [filmBinding(view)]: next });
  } catch (error) {
    runCleanups([() => next.destroy()], { error });
  }
  scene.film[view] = next;
  previous.destroy();
}

/** One interleaved vertex buffer for the whole car: position, normal, tint and class. */
function createCarGeometry(gpu: Gpu, model: CarModel) {
  let vertexCount = 0;
  let indexCount = 0;
  for (const part of model.parts) {
    vertexCount += part.positions.length / 3;
    indexCount += part.indices.length;
  }
  const stride = 10;
  const vertices = new Float32Array(vertexCount * stride);
  const indices = new Uint32Array(indexCount);
  let vertex = 0;
  let index = 0;
  for (const part of model.parts) {
    const tint = part.tint ?? DEFAULT_TINT[part.surface];
    const surfaceClass = SURFACE_CLASSES.indexOf(part.surface);
    for (let i = 0; i < part.indices.length; i++) indices[index++] = part.indices[i] + vertex;
    for (let i = 0; i < part.positions.length; i += 3) {
      const at = vertex * stride;
      vertices.set(part.positions.subarray(i, i + 3), at);
      vertices.set(part.normals.subarray(i, i + 3), at + 3);
      vertices.set(tint, at + 6);
      vertices[at + 9] = surfaceClass;
      vertex++;
    }
  }
  return geometry(gpu, {
    buffers: [
      {
        data: vertices,
        attributes: { position: "float32x3", normal: "float32x3", material: "float32x4" },
      },
    ],
    indices,
  });
}

/** Every seam segment as a quad the vertex shader widens toward the viewer. */
function createSeamGeometry(gpu: Gpu, model: CarModel) {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const seam of model.seams) {
    const count = seam.points.length / 3;
    const segments = seam.closed ? count : count - 1;
    for (let s = 0; s < segments; s++) {
      const a = seam.points.subarray(s * 3, s * 3 + 3);
      const b = seam.points.subarray(((s + 1) % count) * 3, ((s + 1) % count) * 3 + 3);
      const base = vertices.length / 8;
      vertices.push(...a, ...b, -1, 1, ...a, ...b, 1, 1, ...b, ...a, 1, -1, ...b, ...a, -1, -1);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return geometry(gpu, {
    buffers: [
      {
        data: new Float32Array(vertices),
        attributes: { position: "float32x3", neighbour: "float32x3", corner: "float32x2" },
      },
    ],
    indices: new Uint32Array(indices),
  });
}

async function bakeEnvironment(
  gpu: Gpu,
  samplerState: GPUSampler,
  shaders: SceneShaders,
): Promise<Texture> {
  const owned = new Set<unknown>();
  const makeTarget = (size: readonly [number, number]) =>
    own(owned, target(gpu, { size, format: HDR_FORMAT }));

  try {
    const env = own(
      owned,
      gpu.device.createTexture({
        kind: "2d",
        size: [...ENV_SIZE],
        format: HDR_FORMAT,
        mipLevelCount: ENV_LEVELS,
        usage: ["texture_binding", "copy_dst"],
      }),
    );
    const sky = effect(gpu, shaders.sky);
    sky.set({ sky: SKY });
    const blur = effect(gpu, shaders.blur);
    const blurPass = (
      source: Target,
      output: Target,
      direction: readonly [number, number],
      equirectCompensation: number,
    ) => {
      blur.set({
        src: source,
        src_samp: samplerState,
        blur: {
          texel: [1 / output.size[0], 1 / output.size[1]],
          direction,
          radius: 1.15,
          equirect_compensation: equirectCompensation,
        },
      });
      frame(gpu, (currentFrame) =>
        currentFrame.pass({ target: output }, (pass) => pass.draw(blur)),
      );
    };
    let source = makeTarget(ENV_SIZE);

    await compileAll([() => sky.compile(source), () => blur.compile(source)]);
    frame(gpu, (currentFrame) => currentFrame.pass({ target: source }, (pass) => pass.draw(sky)));
    copyIntoLevel(gpu, source, env, 0);

    for (let level = 1; level < ENV_LEVELS; level++) {
      const size: [number, number] = [ENV_SIZE[0] >> level, ENV_SIZE[1] >> level];
      const horizontal = makeTarget(size);
      const vertical = makeTarget(size);
      blurPass(source, horizontal, [1, 0], 1);
      blurPass(horizontal, vertical, [0, 1], 0);
      copyIntoLevel(gpu, vertical, env, level);
      runCleanups([() => release(owned, horizontal), () => release(owned, source)]);
      source = vertical;
    }
    release(owned, source);
    owned.delete(env);
    return env;
  } catch (error) {
    runCleanups(cleanupOwned(owned), { error });
  }
}

function copyIntoLevel(gpu: Gpu, source: Target, env: Texture, level: number): void {
  const encoder = gpu.gpu.createCommandEncoder();
  encoder.copyTextureToTexture(
    { texture: source.color.gpu },
    { texture: env.gpu, mipLevel: level },
    [source.size[0], source.size[1], 1],
  );
  gpu.gpu.queue.submit([encoder.finish()]);
}

/** The view the car draws need, taken from the orbiting perspective camera. */
export function carViewOf(view: CameraView): CarView {
  return {
    viewProjection: view.camera.viewProjection,
    eye: [view.position[0], view.position[1], view.position[2], 1],
    projectionScale: view.camera.projection[5],
  };
}

/** Points the car, its seams and its ground shadow at a view of a given pixel size. */
function setCarView(
  scene: Scene,
  view: CarView,
  size: readonly [number, number],
  output: keyof typeof CAR_OUTPUT,
  seamPixels: number,
): void {
  scene.car.set({
    uniforms: { view_projection: view.viewProjection, eye: view.eye, output: CAR_OUTPUT[output] },
  });
  scene.seams.set({
    uniforms: {
      view_projection: view.viewProjection,
      eye: view.eye,
      viewport: size,
      pixels_per_metre: (size[1] / 2) * Math.abs(view.projectionScale),
      min_pixels: seamPixels,
    },
  });
  scene.ground.set({ uniforms: { view_projection: view.viewProjection } });
}

export interface CarPassOptions {
  /** What the car shader writes. Defaults to the lit car. */
  readonly output?: keyof typeof CAR_OUTPUT;
  /** Draw the panel seams, at least this many pixels wide. Omit to leave them out. */
  readonly seamPixels?: number;
}

/**
 * Draws only the car into a scene target, from any view: the pass behind the guide
 * images and the projection check. The target holds the raw scene values, not a
 * tone-mapped image.
 */
export function renderCar(
  currentFrame: Frame,
  scene: Scene,
  sceneTarget: Target,
  view: CarView,
  options: CarPassOptions = {},
): void {
  const seamPixels = options.seamPixels;
  setCarView(scene, view, sceneTarget.size, options.output ?? "lit", seamPixels ?? 0);
  currentFrame.pass({ target: sceneTarget, clear: [0, 0, 0, 0] }, (pass) => {
    pass.draw(scene.car);
    if (seamPixels !== undefined) pass.draw(scene.seams);
  });
}

/** One frame of the workshop: the lit car over the sky, tone-mapped into `output`. */
export function render(currentFrame: Frame, scene: Scene, output: Target, view: CameraView): void {
  setCarView(scene, carViewOf(view), scene.hdr.size, "lit", SEAMS.min_pixels);
  scene.present.set({
    camera: {
      position: view.position,
      tan_half_fov: view.tanHalfFov,
      forward: view.forward,
      aspect: view.aspect,
      right: view.right,
      exposure: 0.9,
      up: view.up,
      background_intensity: 1,
      texel_angle: TEXEL_ANGLE,
      env_size: ENV_SIZE,
    },
  });

  currentFrame.pass({ target: scene.hdr, clear: [0, 0, 0, 0] }, (pass) => {
    pass.draw(scene.car);
    pass.draw(scene.seams);
    pass.draw(scene.ground);
  });
  currentFrame.pass({ target: output }, (pass) => pass.draw(scene.present));
}

export function aspectOf(output: Target): number {
  return output.size[0] / Math.max(1, output.size[1]);
}

export function replaceHdr(gpu: Gpu, scene: Scene, size: readonly [number, number]): void {
  const previous = scene.hdr;
  const next = createSceneTarget(gpu, size);
  try {
    scene.present.set({ scene_tex: next });
  } catch (error) {
    runCleanups([() => scene.present.set({ scene_tex: previous }), () => destroyOwned(next)], {
      error,
    });
  }
  scene.hdr = next;
  destroyOwned(previous);
}

export function destroyScene(scene: Scene): void {
  runCleanups([
    ...scene.geometries.map((owned) => () => owned.destroy()),
    ...VIEWS.map((view) => () => scene.film[view].destroy()),
    () => destroyOwned(scene.hdr),
    () => scene.env.destroy(),
  ]);
}

/** A target the scene pass can render into: HDR colour with depth. */
export function createSceneTarget(gpu: Gpu, size: readonly [number, number]): Target {
  return target(gpu, { size, format: HDR_FORMAT, depth: true });
}

/** Releases a target made by `createSceneTarget`. */
export function destroySceneTarget(sceneTarget: Target): void {
  destroyOwned(sceneTarget);
}

function own<T>(owned: Set<unknown>, value: T): T {
  owned.add(value);
  return value;
}

function release(owned: Set<unknown>, value: unknown): void {
  owned.delete(value);
  destroyOwned(value);
}

function cleanupOwned(owned: Set<unknown>): (() => void)[] {
  return [...owned].reverse().map((value) => () => release(owned, value));
}

function destroyOwned(value: unknown): void {
  (value as { destroy?: () => void }).destroy?.();
}

async function compileAll(attempts: readonly (() => Promise<unknown>)[]) {
  const results = await Promise.allSettled(
    attempts.map((attempt) => Promise.resolve().then(attempt)),
  );
  for (const result of results) {
    if (result.status === "rejected") throw result.reason;
  }
}

export function runCleanups(cleanups: readonly (() => void)[], primary: { error: unknown }): never;
export function runCleanups(cleanups: readonly (() => void)[]): void;
export function runCleanups(cleanups: readonly (() => void)[], primary?: { error: unknown }): void {
  const errors: unknown[] = [];
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  if (primary) throw primary.error;
  if (errors.length) throw errors[0];
}
