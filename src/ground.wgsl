// A soft contact shadow on the ground plane, so the car reads as standing on it.
// It only writes coverage: the present pass darkens the photograph's ground with it.

struct Uniforms {
  view_projection: mat4x4f,
  // Centre (xy) and half extents (zw) of the car's footprint on the ground, in x and z.
  footprint: vec4f,
  strength: f32,
  // How far the shadow fades out beyond the footprint, in metres.
  softness: f32,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) ground: vec2f,
};

@vertex
fn vs_main(@location(0) corner: vec2f) -> VertexOut {
  let reach = uniforms.footprint.zw + vec2f(uniforms.softness * 1.5);
  let ground = uniforms.footprint.xy + corner * reach;
  var out: VertexOut;
  out.position = uniforms.view_projection * vec4f(ground.x, 0.0, ground.y, 1.0);
  out.ground = ground;
  return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  // Signed distance to the footprint, taken as a rectangle with rounded corners.
  let radius = min(uniforms.footprint.z, uniforms.footprint.w) * 0.5;
  let d = abs(in.ground - uniforms.footprint.xy) - (uniforms.footprint.zw - vec2f(radius));
  let outside = length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0) - radius;
  // A wide penumbra around the car and a darker core under it.
  let penumbra = 1.0 - smoothstep(-0.15, uniforms.softness, outside);
  let core = 1.0 - smoothstep(-0.3, 0.08, outside);
  let alpha = uniforms.strength * (0.5 * penumbra * penumbra + 0.5 * core);
  return vec4f(0.0, 0.0, 0.0, alpha);
}
