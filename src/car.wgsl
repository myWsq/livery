import { env_lod, sample_env } from "./env-common.wgsl";

// Surface classes, in the order of SURFACE_CLASSES in car/model.ts.
const CLASS_PAINT: i32 = 0;
const CLASS_GLASS: i32 = 1;
const CLASS_WHEEL: i32 = 2;
const CLASS_LIGHT: i32 = 3;
const CLASS_TRIM: i32 = 4;

// What the fragment shader writes.
const OUTPUT_LIT: i32 = 0;
// Debug: the film exactly as sampled (premultiplied linear colour and its alpha).
const OUTPUT_FILM: i32 = 1;
// Debug: rgb is the car-frame normal mapped to 0..1; alpha packs the artboard the
// fragment selected and its surface class as (1 + (artboard + 1) + 8 * class) / 64,
// so 0 only ever means "no fragment".
const OUTPUT_SURFACE: i32 = 2;

const ARTBOARD_COUNT: i32 = 5;
const NO_ARTBOARD: i32 = -1;

struct Uniforms {
  view_projection: mat4x4f,
  // xyz is the camera position when w is 1, or the direction toward an orthographic
  // viewer when w is 0.
  eye: vec4f,
  env_size: vec2f,
  texel_angle: f32,
  // Mip level of the environment that is blurred enough to stand in for irradiance.
  ambient_lod: f32,
  // One of the OUTPUT_* constants.
  output: i32,
};

// One artboard frame, from frames.ts: `u` and `v` map a car-frame point (x, y, z, 1)
// to 0..1 across the artboard, and `facing` is the axis a surface faces to select it.
struct Artboard {
  u: vec4f,
  v: vec4f,
  facing: vec4f,
};

struct Artboards {
  frames: array<Artboard, 5>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var env_tex: texture_2d<f32>;
@group(0) @binding(2) var env_samp: sampler;
@group(0) @binding(3) var<uniform> artboards: Artboards;
@group(0) @binding(4) var film_samp: sampler;
// The artboard images, in the order of VIEWS in frames.ts.
@group(0) @binding(5) var film_0: texture_2d<f32>;
@group(0) @binding(6) var film_1: texture_2d<f32>;
@group(0) @binding(7) var film_2: texture_2d<f32>;
@group(0) @binding(8) var film_3: texture_2d<f32>;
@group(0) @binding(9) var film_4: texture_2d<f32>;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) car_position: vec3f,
  @location(1) car_normal: vec3f,
  // rgb: base colour of the part; a: surface class.
  @location(2) @interpolate(flat) material: vec4f,
};

@vertex
fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) material: vec4f,
) -> VertexOut {
  // The car stands still in the world, so the car frame is the world frame.
  var out: VertexOut;
  out.position = uniforms.view_projection * vec4f(position, 1.0);
  out.car_position = position;
  out.car_normal = normal;
  out.material = material;
  return out;
}

// ---------------------------------------------------------------------------
// Livery: film projected from the artboards.
// ---------------------------------------------------------------------------

struct Film {
  // Premultiplied linear colour and coverage; all zero where there is no film.
  color: vec4f,
  // Index of the artboard the surface selected, or NO_ARTBOARD.
  artboard: i32,
};

// The artboard a surface takes its film from: the one its normal's dominant axis
// faces, with a hard switch. A surface facing mostly down takes none.
fn select_artboard(normal: vec3f) -> i32 {
  var best = NO_ARTBOARD;
  var best_dot = -normal.y;
  for (var i = 0; i < ARTBOARD_COUNT; i++) {
    let d = dot(normal, artboards.frames[i].facing.xyz);
    if (d > best_dot) {
      best = i;
      best_dot = d;
    }
  }
  return best;
}

fn sample_artboard(index: i32, uv: vec2f, ddx: vec2f, ddy: vec2f) -> vec4f {
  switch index {
    case 0: {
      return textureSampleGrad(film_0, film_samp, uv, ddx, ddy);
    }
    case 1: {
      return textureSampleGrad(film_1, film_samp, uv, ddx, ddy);
    }
    case 2: {
      return textureSampleGrad(film_2, film_samp, uv, ddx, ddy);
    }
    case 3: {
      return textureSampleGrad(film_3, film_samp, uv, ddx, ddy);
    }
    default: {
      return textureSampleGrad(film_4, film_samp, uv, ddx, ddy);
    }
  }
}

// `ddx` and `ddy` are the screen-space derivatives of `position`.
fn film_at(position: vec3f, normal: vec3f, ddx: vec3f, ddy: vec3f) -> Film {
  var film: Film;
  film.color = vec4f(0.0);
  film.artboard = select_artboard(normal);
  if (film.artboard == NO_ARTBOARD) {
    return film;
  }
  let frame = artboards.frames[film.artboard];
  let uv = vec2f(dot(frame.u, vec4f(position, 1.0)), dot(frame.v, vec4f(position, 1.0)));
  // Outside the artboard's frame there is no film.
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) {
    return film;
  }
  film.color = sample_artboard(
    film.artboard,
    uv,
    vec2f(dot(frame.u.xyz, ddx), dot(frame.v.xyz, ddx)),
    vec2f(dot(frame.u.xyz, ddy), dot(frame.v.xyz, ddy)),
  );
  return film;
}

// ---------------------------------------------------------------------------
// Materials, lit by the baked sky.
// ---------------------------------------------------------------------------

// Everything the materials need to know about the shading point.
struct Surface {
  normal: vec3f,
  reflected: vec3f,
  facing: f32,
  ddx: vec3f,
  ddy: vec3f,
};

// Environment light arriving around the reflection, blurred over a cone of `cone` radians.
fn glossy(surface: Surface, cone: f32) -> vec3f {
  let lod = env_lod(cone, surface.ddx, surface.ddy, uniforms.texel_angle);
  return sample_env(env_tex, env_samp, surface.reflected, lod, uniforms.env_size);
}

fn ambient(normal: vec3f) -> vec3f {
  return sample_env(env_tex, env_samp, normal, uniforms.ambient_lod, uniforms.env_size);
}

fn schlick(f0: vec3f, facing: f32) -> vec3f {
  return f0 + (vec3f(1.0) - f0) * pow(1.0 - facing, 5.0);
}

// Silver metallic paint: a soft metallic base under a sharp clear coat.
fn shade_paint(surface: Surface) -> vec3f {
  let silver = vec3f(0.62, 0.63, 0.65);
  let base = glossy(surface, 0.07) * 0.8 + ambient(surface.normal) * 0.2;
  let coat = schlick(vec3f(0.04), surface.facing).x;
  return mix(base * schlick(silver, surface.facing), glossy(surface, 0.0), coat);
}

// Dark glass: almost nothing comes through, the sky reflects off it.
fn shade_glass(surface: Surface, tint: vec3f) -> vec3f {
  let reflectance = schlick(vec3f(0.07), surface.facing).x;
  return mix(tint * ambient(surface.normal), glossy(surface, 0.0), reflectance);
}

// A matte or satin dielectric: diffuse light plus a blurred reflection.
fn shade_dielectric(surface: Surface, albedo: vec3f, cone: f32, f0: f32) -> vec3f {
  let reflectance = schlick(vec3f(f0), surface.facing).x;
  return albedo * ambient(surface.normal) * (1.0 - reflectance) + glossy(surface, cone) * reflectance;
}

// Wrap film: a satin, non-metallic layer in the artboard's colour.
fn shade_film(surface: Surface, albedo: vec3f) -> vec3f {
  return shade_dielectric(surface, albedo, 0.3, 0.045);
}

// Wheels: light parts are bare metal (rims), dark parts are rubber (tyres).
fn shade_wheel(surface: Surface, tint: vec3f) -> vec3f {
  let metal = smoothstep(0.15, 0.45, dot(tint, vec3f(0.2126, 0.7152, 0.0722)));
  let rubber = shade_dielectric(surface, tint, 0.45, 0.03);
  let alloy = (glossy(surface, 0.14) * 0.75 + ambient(surface.normal) * 0.25) * schlick(tint, surface.facing);
  return mix(rubber, alloy, metal);
}

// Light lenses: a coloured reflector under clear plastic.
fn shade_light(surface: Surface, tint: vec3f) -> vec3f {
  let coat = schlick(vec3f(0.05), surface.facing).x;
  let reflector = tint * (ambient(surface.normal) * 0.7 + glossy(surface, 0.3) * 0.6);
  return mix(reflector, glossy(surface, 0.0), coat);
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let surface_class = i32(round(in.material.a));
  let tint = in.material.rgb;
  let car_normal = normalize(in.car_normal);

  // Only paint is ever wrapped.
  var film: Film;
  film.color = vec4f(0.0);
  film.artboard = NO_ARTBOARD;
  let position_ddx = dpdx(in.car_position);
  let position_ddy = dpdy(in.car_position);
  if (surface_class == CLASS_PAINT) {
    film = film_at(in.car_position, car_normal, position_ddx, position_ddy);
  }

  if (uniforms.output == OUTPUT_FILM) {
    return film.color;
  }
  if (uniforms.output == OUTPUT_SURFACE) {
    return vec4f(car_normal * 0.5 + 0.5, f32(1 + (film.artboard + 1) + 8 * surface_class) / 64.0);
  }

  let to_eye = select(uniforms.eye.xyz, uniforms.eye.xyz - in.car_position, uniforms.eye.w > 0.5);
  let view = normalize(to_eye);
  var normal = car_normal;
  // Surfaces seen from behind (inside a wheel well, under the floor) shade as their back.
  if (dot(normal, view) < 0.0) {
    normal = -normal;
  }

  var surface: Surface;
  surface.normal = normal;
  surface.reflected = reflect(-view, normal);
  surface.facing = clamp(dot(view, normal), 0.0, 1.0);
  surface.ddx = dpdx(surface.reflected);
  surface.ddy = dpdy(surface.reflected);

  var color: vec3f;
  if (surface_class == CLASS_GLASS) {
    color = shade_glass(surface, tint);
  } else if (surface_class == CLASS_WHEEL) {
    color = shade_wheel(surface, tint);
  } else if (surface_class == CLASS_LIGHT) {
    color = shade_light(surface, tint);
  } else if (surface_class == CLASS_TRIM) {
    color = shade_dielectric(surface, tint, 0.4, 0.04);
  } else {
    color = shade_paint(surface);
    if (film.color.a > 0.0) {
      // Film covers the paint by its alpha; un-premultiply to get its own colour.
      color = mix(color, shade_film(surface, film.color.rgb / film.color.a), film.color.a);
    }
  }
  return vec4f(color, 1.0);
}
