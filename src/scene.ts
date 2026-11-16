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

import { createEmptyArtboardTexture } from "./artboards.ts";
import type { CameraView } from "./camera.ts";
import {
  modelBounds,
  SURFACE_CLASSES,
  type CarModel,
  type Rgb,
  type SurfaceClass,
} from "./car/index.ts";
import { BACKDROP_SIZE, ENVIRONMENT_SIZE, type EnvironmentSettings } from "./environments.ts";
import { frameUniforms, VIEWS, type View } from "./frames.ts";
import { halfFloat, type HdrImage } from "./hdr.ts";

const HDR_FORMAT: GPUTextureFormat = "rgba16float";
/** Mip levels of a photograph's environment texture: the photograph, then 7 blurs. */
const ENV_LEVELS = 8;

/**
 * The environment a scene starts with, and keeps where no photograph is put on: a
 * uniform mid grey, small because every texel is the same.
 */
const NEUTRAL = {
  size: [4, 2],
  radiance: 0.5,
  settings: { exposure: 1, heading: 0, captureHeight: 1.5, groundRadius: 30, ceilingHeight: 0 },
} as const;

/**
 * The blur of the backdrop far from the car, in radians; the present pass fades it out
 * toward the car, so the ground the car stands on is not blurred. `setBackdropBlur`
 * overrides it.
 */
const BACKDROP_BLUR = 0.0015;

/**
 * A detail image's texture: sRGB, so that sampling it and reducing its levels work in
 * linear light.
 */
const DETAIL_FORMAT: GPUTextureFormat = "rgba8unorm-srgb";
/**
 * Mip levels of a detail texture: the image, then two exact 2 × 2 reductions. The last
 * has the size of an environment texture's level 0.
 */
const DETAIL_LEVELS = 3;

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
  readonly blur: ShaderSource;
}

/** A photograph made into an environment texture. */
export interface EnvironmentTexture {
  /** Equirectangular, `rgba16float`, each mip level a blur of the one above. */
  readonly texture: Texture;
  /**
   * What the texture's values must be multiplied by to give the photograph's radiance
   * (`HdrImage.scale`): above 1 only for a photograph brighter than a half float.
   */
  readonly scale: number;
}

/**
 * A detail image before it is a texture: its size, and how its pixels get into level 0
 * of the texture made for it. The browser copies an image bitmap there, Node writes
 * decoded RGBA bytes; the scene only makes the texture and its other levels.
 */
export interface DetailImage {
  readonly width: number;
  readonly height: number;
  /**
   * Fills level 0 of `texture`: `rgba8unorm-srgb`, the image's size, rows from the top,
   * with the usages `texture_binding`, `copy_dst` and `render_attachment`.
   */
  readonly writeLevel0: (texture: Texture) => void;
}

/** What lights the scene: an environment texture and how it is fitted to the car. */
export interface SceneEnvironment extends EnvironmentTexture {
  readonly settings: EnvironmentSettings;
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
    // Until an environment is put on, the car stands under the neutral one. The scene
    // owns only this one; the textures it is given belong to whoever made them.
    const neutral = own(owned, createNeutralEnvironment(gpu));
    const environment: SceneEnvironment = {
      texture: neutral,
      scale: 1,
      settings: NEUTRAL.settings,
    };
    // Without a detail texture the backdrop is bound to this white one, which makes
    // its detail factor exactly 1. The scene owns only this one.
    const white = own(owned, createWhiteDetail(gpu));
    const bounds = modelBounds(model);

    const carGeometry = own(owned, createCarGeometry(gpu, model));
    const car = draw(gpu, { shader: shaders.car, geometry: carGeometry });
    car.set({
      uniforms: {
        ...NO_VIEW,
        ...environmentUniforms(neutral),
        env_turn: 0,
        output: CAR_OUTPUT.lit,
      },
      env_tex: neutral,
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
    // Every artboard starts empty: the car wears no film until a design is put on.
    // The scene owns only this empty film; a design's textures belong to whoever
    // binds them.
    const emptyFilm = own(owned, createEmptyArtboardTexture(gpu));
    car.set(filmBindings(emptyFilm, {}));

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
      env_tex: neutral,
      env_samp: envSampler,
      detail_tex: white,
      scene_tex: hdr,
      scene_samp: sceneSampler,
    });
    // Kept for every photograph made into an environment texture for this scene and,
    // with no direction, for every reduction of a detail texture's levels.
    const blur = effect(gpu, shaders.blur);
    await compileAll([
      () => car.compile(hdr),
      () => seams.compile(hdr),
      () => ground.compile(hdr),
      () => present.compile({ colors: [output.format] }),
      () => blur.compile({ colors: [HDR_FORMAT] }),
      () => blur.compile({ colors: [DETAIL_FORMAT] }),
    ]);
    return {
      environment,
      /** The scene's own turn of the environment in radians, added to its heading. */
      turn: 0,
      /** The detail texture the backdrop is bound to: the white one when there is none. */
      detail: white,
      /** The backdrop's blur far from the car, in radians. */
      backdropBlur: BACKDROP_BLUR,
      neutral,
      white,
      envSampler,
      blur,
      hdr,
      bounds,
      geometries: [carGeometry, seamGeometry, groundGeometry],
      emptyFilm,
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

/** Every view's film binding: the given texture, or the empty film where there is none. */
function filmBindings(
  emptyFilm: Texture,
  film: Partial<Record<View, Texture>>,
): Record<string, Texture> {
  const bindings: Record<string, Texture> = {};
  for (const view of VIEWS) bindings[filmBinding(view)] = film[view] ?? emptyFilm;
  return bindings;
}

/**
 * Puts a texture on one view of the car, or bare paint when `film` is undefined. The
 * scene does not take the texture over: nothing is destroyed here, so a texture that
 * is replaced must be destroyed by its owner after this returns.
 */
export function bindArtboard(scene: Scene, view: View, film: Texture | undefined): void {
  scene.car.set({ [filmBinding(view)]: film ?? scene.emptyFilm });
}

/**
 * Puts film on all five views at once, bare paint on every view `film` leaves out.
 * One call, so no frame can show some views from one design and some from another.
 */
export function bindArtboards(scene: Scene, film: Partial<Record<View, Texture>>): void {
  scene.car.set(filmBindings(scene.emptyFilm, film));
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

/**
 * Turns a decoded photograph into an environment texture: level 0 is the photograph,
 * and each further level is the one above blurred by the two passes of `blur.wgsl`.
 * The texture belongs to the caller, who puts it on with `setEnvironment` and
 * destroys it once no scene shows it. The photograph's scale travels with it.
 */
export function createEnvironmentTexture(
  gpu: Gpu,
  scene: Scene,
  image: HdrImage,
): EnvironmentTexture {
  const [width, height] = ENVIRONMENT_SIZE;
  if (image.width !== width || image.height !== height) {
    throw new Error(
      `an environment photograph must be ${width} × ${height} pixels, not ${image.width} × ${image.height}`,
    );
  }
  const owned = new Set<unknown>();
  const makeTarget = (size: readonly [number, number]) =>
    own(owned, target(gpu, { size, format: HDR_FORMAT }));

  try {
    const env = own(
      owned,
      gpu.device.createTexture({
        kind: "2d",
        size: [width, height],
        format: HDR_FORMAT,
        mipLevelCount: ENV_LEVELS,
        usage: ["texture_binding", "copy_dst"],
      }),
    );
    writeLevel0(gpu, env, image.pixels);
    const blurPass = (
      source: Target | Texture,
      output: Target,
      direction: readonly [number, number],
      equirectCompensation: number,
    ) => {
      scene.blur.set({
        src: source,
        src_samp: scene.envSampler,
        blur: {
          texel: [1 / output.size[0], 1 / output.size[1]],
          direction,
          radius: 1.15,
          equirect_compensation: equirectCompensation,
        },
      });
      frame(gpu, (currentFrame) =>
        currentFrame.pass({ target: output }, (pass) => pass.draw(scene.blur)),
      );
    };
    // Level 1 is blurred from the photograph itself; the blur samples only level 0.
    let source: Target | Texture = env;
    const releaseSource = () => {
      if (source !== env) release(owned, source);
    };

    for (let level = 1; level < ENV_LEVELS; level++) {
      const size: [number, number] = [width >> level, height >> level];
      const horizontal = makeTarget(size);
      const vertical = makeTarget(size);
      blurPass(source, horizontal, [1, 0], 1);
      blurPass(horizontal, vertical, [0, 1], 0);
      copyIntoLevel(gpu, vertical, env, level);
      runCleanups([() => release(owned, horizontal), releaseSource]);
      source = vertical;
    }
    releaseSource();
    owned.delete(env);
    return { texture: env, scale: image.scale };
  } catch (error) {
    runCleanups(cleanupOwned(owned), { error });
  }
}

/**
 * Turns a detail image into a detail texture: level 0 is the image, filled by
 * `image.writeLevel0`, and each further level is the one above reduced by an exact
 * 2 × 2 average, in linear light. The texture belongs to the caller, who puts it on
 * with `setBackdropDetail` and destroys it once no scene shows it.
 */
export function createDetailTexture(gpu: Gpu, scene: Scene, image: DetailImage): Texture {
  const [width, height] = BACKDROP_SIZE;
  if (image.width !== width || image.height !== height) {
    throw new Error(
      `a detail image must be ${width} × ${height} pixels, not ${image.width} × ${image.height}`,
    );
  }
  const owned = new Set<unknown>();
  try {
    const detail = own(
      owned,
      gpu.device.createTexture({
        kind: "2d",
        size: [width, height],
        format: DETAIL_FORMAT,
        mipLevelCount: DETAIL_LEVELS,
        usage: ["texture_binding", "copy_dst", "render_attachment"],
      }),
    );
    image.writeLevel0(detail);
    // A target half the size of its source, sampled with linear filtering at the centre
    // of each of its texels, averages exactly the 2 × 2 source texels under it; the blur
    // with no direction samples its source only there.
    let source: Target | Texture = detail;
    const releaseSource = () => {
      if (source !== detail) release(owned, source);
    };
    for (let level = 1; level < DETAIL_LEVELS; level++) {
      const size: [number, number] = [width >> level, height >> level];
      const reduced = own(owned, target(gpu, { size, format: DETAIL_FORMAT }));
      scene.blur.set({
        src: source,
        src_samp: scene.envSampler,
        blur: {
          texel: [1 / size[0], 1 / size[1]],
          direction: [0, 0],
          radius: 0,
          equirect_compensation: 0,
        },
      });
      frame(gpu, (currentFrame) =>
        currentFrame.pass({ target: reduced }, (pass) => pass.draw(scene.blur)),
      );
      copyIntoLevel(gpu, reduced, detail, level);
      releaseSource();
      source = reduced;
    }
    releaseSource();
    owned.delete(detail);
    return detail;
  } catch (error) {
    runCleanups(cleanupOwned(owned), { error });
  }
}

/** The detail texture of no detail: one white texel, which makes the backdrop's factor 1. */
function createWhiteDetail(gpu: Gpu): Texture {
  const white = gpu.device.createTexture({
    kind: "2d",
    size: [1, 1],
    format: DETAIL_FORMAT,
    usage: ["texture_binding", "copy_dst"],
  });
  try {
    gpu.gpu.queue.writeTexture(
      { texture: white.gpu, mipLevel: 0 },
      new Uint8Array([255, 255, 255, 255]),
      { bytesPerRow: 4, rowsPerImage: 1 },
      [1, 1, 1],
    );
    return white;
  } catch (error) {
    runCleanups([() => white.destroy()], { error });
  }
}

/** The neutral environment: one level of uniform grey, as many texels as `NEUTRAL` says. */
function createNeutralEnvironment(gpu: Gpu): Texture {
  const [width, height] = NEUTRAL.size;
  const env = gpu.device.createTexture({
    kind: "2d",
    size: [width, height],
    format: HDR_FORMAT,
    usage: ["texture_binding", "copy_dst"],
  });
  try {
    const grey = halfFloat(NEUTRAL.radiance);
    const pixels = new Uint16Array(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) pixels.set([grey, grey, grey, halfFloat(1)], i);
    writeLevel0(gpu, env, pixels);
    return env;
  } catch (error) {
    runCleanups([() => env.destroy()], { error });
  }
}

/** Writes RGBA half floats, rows from the top, into level 0 of an `rgba16float` texture. */
function writeLevel0(gpu: Gpu, env: Texture, pixels: Uint16Array<ArrayBuffer>): void {
  const [width, height] = env.size as readonly [number, number];
  gpu.gpu.queue.writeTexture(
    { texture: env.gpu, mipLevel: 0 },
    pixels,
    { bytesPerRow: width * 8, rowsPerImage: height },
    [width, height, 1],
  );
}

/** What the shaders need to know about an environment texture to sample it. */
function environmentUniforms(env: Texture) {
  const [width, height] = env.size as readonly [number, number];
  return {
    env_size: [width, height],
    texel_angle: (2 * Math.PI) / width,
    // The level blurred enough to stand in for irradiance: the second-smallest, or
    // the only one.
    ambient_lod: Math.max(0, env.mipLevelCount - 2),
  };
}

/**
 * Lights the scene with an environment texture, fitted to the car by `settings`. It
 * only rebinds and stores: nothing is baked or destroyed, so it is cheap to call at
 * any time, and the texture it replaces still belongs to whoever made it. It also
 * takes any detail texture off the backdrop: detail belongs to one photograph and is
 * never shown over another, so the new photograph's detail is put on after this.
 */
export function setEnvironment(
  scene: Scene,
  { texture, scale }: EnvironmentTexture,
  settings: EnvironmentSettings,
): void {
  const { env_size, texel_angle, ambient_lod } = environmentUniforms(texture);
  scene.car.set({ env_tex: texture, uniforms: { env_size, texel_angle, ambient_lod } });
  scene.present.set({ env_tex: texture, detail_tex: scene.white });
  scene.environment = { texture, scale, settings };
  scene.detail = scene.white;
}

/**
 * Gives the backdrop the fine detail of the photograph on the scene, a texture made by
 * `createDetailTexture`, or takes it off when `detail` is undefined. It only rebinds:
 * nothing is destroyed, so a texture that is replaced must be destroyed by its owner
 * after this returns.
 */
export function setBackdropDetail(scene: Scene, detail: Texture | undefined): void {
  const texture = detail ?? scene.white;
  scene.present.set({ detail_tex: texture });
  scene.detail = texture;
}

/** Sets the backdrop's blur far from the car, in radians, for every later frame. */
export function setBackdropBlur(scene: Scene, radians: number): void {
  scene.backdropBlur = radians;
}

/**
 * Turns the environment about +Y by `radians`, on top of its own heading: what the
 * photograph shows at azimuth a is seen at azimuth a + heading + radians. The turn
 * belongs to the scene, so it stays when the environment changes.
 */
export function setEnvironmentTurn(scene: Scene, radians: number): void {
  scene.turn = radians;
}

/** The turn the shaders apply to every environment look-up, in radians. */
function environmentTurn(scene: Scene): number {
  return (scene.environment.settings.heading * Math.PI) / 180 + scene.turn;
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
    uniforms: {
      view_projection: view.viewProjection,
      eye: view.eye,
      env_turn: environmentTurn(scene),
      output: CAR_OUTPUT[output],
    },
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

/**
 * One frame of the workshop: the lit car standing on the environment's ground, with
 * the rest of the environment behind it, tone-mapped into `output`.
 */
export function render(currentFrame: Frame, scene: Scene, output: Target, view: CameraView): void {
  setCarView(scene, carViewOf(view), scene.hdr.size, "lit", SEAMS.min_pixels);
  const { texture, scale, settings } = scene.environment;
  const { env_size, texel_angle } = environmentUniforms(texture);
  const [detailWidth, detailHeight] = scene.detail.size as readonly [number, number];
  scene.present.set({
    camera: {
      position: view.position,
      tan_half_fov: view.tanHalfFov,
      forward: view.forward,
      aspect: view.aspect,
      right: view.right,
      // The texture holds the photograph divided by `scale`. Every term of the car's
      // shading and of the backdrop is linear in the environment's radiance, so this
      // one multiplication gives the photograph its full brightness back.
      exposure: settings.exposure * scale,
      up: view.up,
      background_intensity: 1,
      texel_angle,
      env_turn: environmentTurn(scene),
      env_size,
      capture_height: settings.captureHeight,
      ground_radius: settings.groundRadius,
      ceiling_height: settings.ceilingHeight,
      backdrop_blur: scene.backdropBlur,
      detail_texel_angle: (2 * Math.PI) / detailWidth,
      detail_size: [detailWidth, detailHeight],
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
    () => scene.emptyFilm.destroy(),
    () => destroyOwned(scene.hdr),
    () => scene.neutral.destroy(),
    () => scene.white.destroy(),
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
