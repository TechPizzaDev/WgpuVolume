struct Uniforms {
  inverseModelViewProjectionMatrix: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var myTexture: texture_3d<f32>;

struct VertexOutput {
  @builtin(position) Position: vec4f,
  @location(0) near: vec3f,
  @location(1) step: vec3f,
}

const NumSteps = 128u;

@vertex
fn vertex_main(
    @builtin(vertex_index) VertexIndex: u32
) -> VertexOutput {
    var a = -0.75f;
    var b = 0.75f;
    var pos = array<vec2f, 4>(
        vec2(a, b),
        vec2(a, a),
        vec2(b, a),
        vec2(b, b),
    );
    var indices = array<i32, 6>(
        0, 1, 2,
        0, 2, 3,
    );
    var idx = indices[VertexIndex];
    var xy = pos[idx];

    var near = uniforms.inverseModelViewProjectionMatrix * vec4f(xy, 0f, 1f);
    var far = uniforms.inverseModelViewProjectionMatrix * vec4f(xy, 1f, 1f);
    near /= near.w;
    far /= far.w;
    
    return VertexOutput(
        vec4f(xy, 0f, 1f),
        near.xyz,
        (far.xyz - near.xyz) / f32(NumSteps)
    );
}

@fragment
fn fragment_main(
    @location(0) near: vec3f,
    @location(1) step: vec3f
) -> @location(0) vec4f {
    var rayPos = near;
    var result = 0f;
    for (var i = 0u; i < NumSteps; i++) {
        let texCoord = (rayPos.xyz + 1f) * 0.5f;
        let sample = textureSample(myTexture, mySampler, texCoord).r * 4f / f32(NumSteps);
        let intersects = all(rayPos.xyz < vec3f(1f)) && all(rayPos.xyz > vec3f(-1f));
        result += select(0f, (1f - result) * sample, intersects);
        rayPos += step;
    }
    return vec4f(vec3f(result), 1f);
}
