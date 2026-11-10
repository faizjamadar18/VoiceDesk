export const BLOOP_WGSL = /* wgsl */ `
struct Uniforms {
  time: f32,
  micLevel: f32,
  stateListen: f32,
  listenTimestamp: f32,
  stateThink: f32,
  thinkTimestamp: f32,
  stateSpeak: f32,
  speakTimestamp: f32,
  avgMag: vec4<f32>,
  cumulativeAudio: vec4<f32>,
  viewport: vec2<f32>,
  watercolorStrength: f32,
  watercolorAnimated: f32,
  bloopColorMain: vec4<f32>,
  bloopColorLow: vec4<f32>,
  bloopColorMid: vec4<f32>,
  bloopColorHigh: vec4<f32>,
};

@group(0) @binding(0) var<uniform> ubo: Uniforms;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2<f32>, 4>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(1.0, 1.0)
  );
  var uv = array<vec2<f32>, 4>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0)
  );

  var output: VertexOutput;
  output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
  output.uv = uv[vertexIndex];
  return output;
}

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let p = (uv - 0.5) * 2.0;
  let d = length(p);

  // Audio & motion pulse
  let pulse = sin(ubo.time * 3.0) * 0.05 * ubo.stateThink + ubo.micLevel * 0.2;
  let radius = 0.65 + pulse;

  if (d > radius + 0.25) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }

  // Smooth edge falloff
  let edge = smoothstep(radius + 0.15, radius - 0.1, d);
  let glow = exp(-d * 2.5) * 0.8;

  // Fluid color mixing
  let angle = atan2(p.y, p.x);
  let wave = sin(angle * 3.0 + ubo.time * 2.0 + ubo.cumulativeAudio.x);
  let mixFactor = clamp((p.y + 1.0) * 0.5 + wave * 0.15, 0.0, 1.0);

  var color = mix(ubo.bloopColorLow.rgb, ubo.bloopColorMain.rgb, mixFactor);
  color = mix(color, ubo.bloopColorHigh.rgb, clamp(pow(1.0 - d, 2.0), 0.0, 1.0));

  let finalAlpha = clamp(edge * 0.9 + glow * 0.3, 0.0, 1.0);
  return vec4<f32>(color * finalAlpha, finalAlpha);
}
`;

