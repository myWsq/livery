import { env_lod, linear_to_srgb, sample_env, tonemap_aces, turned } from "./env-common.wgsl";

// Keeps the detail factor finite where the detail image is black; small enough that
// dark detail still shows.
const DETAIL_EPSILON: f32 = 0.02;
// Horizontal distances from the car, in metres, over which the backdrop's blur grows
// from none to `backdrop_blur`.
const BLUR_NEAR: f32 = 5.0;
const BLUR_FAR: f32 = 20.0;

struct Camera {
  position: vec3f,
  tan_half_fov: f32,
  forward: vec3f,
  aspect: f32,
  right: vec3f,
  exposure: f32,
  up: vec3f,
  background_intensity: f32,
  texel_angle: f32,
  // Turn of the environment about +Y in radians (see `turned` in env-common.wgsl).
  env_turn: f32,
  env_size: vec2f,
  // The backdrop's room: the height the photograph was taken from, the radius of its
  // floor and wall, and the height of its ceiling (0 for open sky), in metres.
  capture_height: f32,
  ground_radius: f32,
  ceiling_height: f32,
  // The blur of the backdrop far from the car, in radians.
  backdrop_blur: f32,
  // The angle one texel of the detail texture's level 0 spans, and that level's size.
  detail_texel_angle: f32,
  detail_size: vec2f,
};
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var env_tex: texture_2d<f32>;
@group(0) @binding(2) var env_samp: sampler;
@group(0) @binding(3) var scene_tex: texture_2d<f32>;
@group(0) @binding(4) var scene_samp: sampler;
// The fine detail of the photograph, at four times the environment texture's size;
// its level 2 matches the environment texture's level 0. All white when there is none.
@group(0) @binding(5) var detail_tex: texture_2d<f32>;

// What a view ray sees of the backdrop.
struct BackdropHit {
  // The direction from the photograph's capture point to the point seen.
  direction: vec3f,
  // How far that point is from the car: 0 within BLUR_NEAR metres, 1 from BLUR_FAR on,
  // and 1 for the photograph at infinity.
  far: f32,
};

// What a view ray from `eye` along the unit `direction` sees of the backdrop. The
// photograph is projected on a room around the vertical axis through the capture point
// C = (0, capture_height, 0): a flat floor on the ground plane y = 0 out to
// `ground_radius`, an upright cylinder wall of that radius, and, where the photograph
// was taken indoors, a flat ceiling at `ceiling_height`. The floor stays fixed on the
// ground as the camera moves, so the car stands on the photograph's ground; and
// because the wall is upright, whatever stands upright in the photograph (a pillar, a
// trunk, the corner of a building) stays a straight upright line from every camera
// position. An eye outside the wall sees the photograph at infinity.
fn backdrop_hit(eye: vec3f, direction: vec3f) -> BackdropHit {
  let centre = vec3f(0.0, camera.capture_height, 0.0);
  let radius = camera.ground_radius;
  let c = dot(eye.xz, eye.xz) - radius * radius;
  if (c > 0.0) {
    return BackdropHit(direction, 1.0);
  }
  if (direction.y < 0.0) {
    let ground = eye + direction * (-eye.y / direction.y);
    if (length(ground.xz) <= radius) {
      return BackdropHit(normalize(ground - centre), far_of(ground));
    }
  }
  if (direction.y > 0.0 && camera.ceiling_height > 0.0) {
    let ceiling = eye + direction * ((camera.ceiling_height - eye.y) / direction.y);
    if (length(ceiling.xz) <= radius) {
      return BackdropHit(normalize(ceiling - centre), far_of(ceiling));
    }
  }
  // Where the ray leaves the wall: the far root of |eye.xz + s * direction.xz| = radius.
  // A ray straight up or down the axis never does, and sees what is in its direction.
  let a = dot(direction.xz, direction.xz);
  if (a < 1e-8) {
    return BackdropHit(direction, 1.0);
  }
  let b = dot(eye.xz, direction.xz);
  let s = (-b + sqrt(max(b * b - a * c, 0.0))) / a;
  let wall = eye + direction * s;
  return BackdropHit(normalize(wall - centre), far_of(wall));
}

// How far a point of the room is from the car, from its horizontal distance to the origin.
fn far_of(point: vec3f) -> f32 {
  return smoothstep(BLUR_NEAR, BLUR_FAR, length(point.xz));
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let direction = normalize(
    camera.forward
      + camera.right * (ndc.x * camera.tan_half_fov * camera.aspect)
      + camera.up * (ndc.y * camera.tan_half_fov),
  );

  let hit = backdrop_hit(camera.position, direction);
  let lookup = turned(hit.direction, camera.env_turn);
  let ddx = dpdx(lookup);
  let ddy = dpdy(lookup);
  let pixel = max(length(ddx), length(ddy));
  let cone = camera.backdrop_blur * hit.far;

  // The HDR gives the backdrop its brightness, blurred by `cone`.
  let lod = env_lod(cone, ddx, ddy, camera.texel_angle);
  let hdr = sample_env(env_tex, env_samp, lookup, lod, camera.env_size);

  // The detail image gives what the HDR is too coarse to hold: its local contrast, the
  // image at the footprint the view needs over the image at the HDR's resolution. Both
  // are sampled like the HDR, so where the view needs no more than the HDR holds the
  // factor is exactly 1.
  let footprint = max(cone, pixel);
  let detail_lod = clamp(log2(footprint / camera.detail_texel_angle), 0.0, 2.0);
  let fine = sample_env(detail_tex, env_samp, lookup, detail_lod, camera.detail_size);
  let coarse = sample_env(detail_tex, env_samp, lookup, 2.0, camera.detail_size);
  let background = hdr * (fine + DETAIL_EPSILON) / (coarse + DETAIL_EPSILON)
    * camera.background_intensity;

  let scene = textureSample(scene_tex, scene_samp, uv);
  let color = mix(background, scene.rgb, scene.a);

  return vec4f(linear_to_srgb(tonemap_aces(color * camera.exposure)), 1.0);
}
