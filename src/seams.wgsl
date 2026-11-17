// Panel seams, drawn as thin dark ribbons that always face the viewer.

struct Uniforms {
  view_projection: mat4x4f,
  // xyz is the camera position when w is 1, or the direction toward an orthographic
  // viewer when w is 0.
  eye: vec4f,
  color: vec4f,
  viewport: vec2f,
  // Pixels covered by one metre at unit clip w.
  pixels_per_metre: f32,
  // Ribbon width in metres, and the width it never gets thinner than in pixels.
  width: f32,
  min_pixels: f32,
  // How far the ribbon is lifted toward the viewer so it wins over the body under it.
  lift: f32,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

fn lifted(point: vec3f) -> vec4f {
  let to_eye = select(uniforms.eye.xyz, uniforms.eye.xyz - point, uniforms.eye.w > 0.5);
  return uniforms.view_projection * vec4f(point + normalize(to_eye) * uniforms.lift, 1.0);
}

@vertex
fn vs_main(
  @location(0) position: vec3f,
  @location(1) neighbour: vec3f,
  // x: which side of the segment; y: +1 at the segment's start, -1 at its end.
  @location(2) corner: vec2f,
) -> @builtin(position) vec4f {
  let here = lifted(position);
  let there = lifted(neighbour);
  let half_viewport = uniforms.viewport * 0.5;
  let along = (there.xy / there.w - here.xy / here.w) * half_viewport * corner.y;
  let direction = along / max(length(along), 1e-6);
  let across = vec2f(-direction.y, direction.x);
  let pixels = max(uniforms.width * uniforms.pixels_per_metre / here.w, uniforms.min_pixels);
  let offset = across * corner.x * pixels * 0.5 / half_viewport;
  return vec4f(here.xy + offset * here.w, here.zw);
}

@fragment
fn fs_main() -> @location(0) vec4f {
  return uniforms.color;
}
