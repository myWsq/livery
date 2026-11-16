import { env_lod, linear_to_srgb, sample_env, tonemap_aces, turned } from "./env-common.wgsl";

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
  // The backdrop's dome: the height the photograph was taken from and its radius, in
  // metres.
  capture_height: f32,
  ground_radius: f32,
  // The least blur of the backdrop, in radians.
  backdrop_cone: f32,
};
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var env_tex: texture_2d<f32>;
@group(0) @binding(2) var env_samp: sampler;
@group(0) @binding(3) var scene_tex: texture_2d<f32>;
@group(0) @binding(4) var scene_samp: sampler;

// The direction from the photograph's capture point to what a view ray from `eye`
// along the unit `direction` sees of the backdrop. The photograph is projected on a
// dome around the capture point C = (0, capture_height, 0): a flat floor on the ground
// plane y = 0 out to `ground_radius` from C, and beyond it the sphere of that radius.
// The floor stays fixed on the ground as the camera moves, so the car stands on the
// photograph's ground. An eye outside the sphere sees the photograph at infinity.
fn backdrop_direction(eye: vec3f, direction: vec3f) -> vec3f {
  let centre = vec3f(0.0, camera.capture_height, 0.0);
  let radius = camera.ground_radius;
  let from_centre = eye - centre;
  let c = dot(from_centre, from_centre) - radius * radius;
  if (c > 0.0) {
    return direction;
  }
  if (direction.y < 0.0) {
    let ground = eye + direction * (-eye.y / direction.y);
    if (length(ground - centre) <= radius) {
      return normalize(ground - centre);
    }
  }
  // Where the ray leaves the sphere: the far root of |from_centre + s * direction| = radius.
  let b = dot(from_centre, direction);
  let s = -b + sqrt(max(b * b - c, 0.0));
  return normalize(from_centre + direction * s);
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let direction = normalize(
    camera.forward
      + camera.right * (ndc.x * camera.tan_half_fov * camera.aspect)
      + camera.up * (ndc.y * camera.tan_half_fov),
  );

  let lookup = turned(backdrop_direction(camera.position, direction), camera.env_turn);
  let lod = env_lod(camera.backdrop_cone, dpdx(lookup), dpdy(lookup), camera.texel_angle);
  let background = sample_env(env_tex, env_samp, lookup, lod, camera.env_size) * camera.background_intensity;

  let scene = textureSample(scene_tex, scene_samp, uv);
  let color = mix(background, scene.rgb, scene.a);

  return vec4f(linear_to_srgb(tonemap_aces(color * camera.exposure)), 1.0);
}
