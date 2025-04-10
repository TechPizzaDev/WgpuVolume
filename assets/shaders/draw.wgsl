struct Uniforms {
  inverseModelViewProjectionMatrix: mat4x4<f32>,
  time: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var myTexture: texture_3d<f32>;

struct VertexOutput {
  @builtin(position) Position: vec4f,
  @location(0) near: vec3f,
  @location(1) step: vec3f,
}

override Xray = false;
override Opaque = true;
override NumSteps: u32 = select(160u, 256u, Xray);

@vertex
fn vertex_main(
    @builtin(vertex_index) VertexIndex: u32
) -> VertexOutput {
    var a = -0.99f;
    var b = 0.99f;
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
        (far - near).xyz / f32(NumSteps)
    );
}

fn ray_to_tex(pos: vec3f) -> vec3f {
    return (pos + 1f) * 0.5f;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let near = input.near;
    let step = input.step;
    
    if Xray {
        return frag_xray(near, step);
    }
    return frag_voxel(near, step);
}

fn frag_voxel(near: vec3f, step: vec3f) -> vec4f {
    let rayPos = near;
    let rayDir = step;

    var mapPos = vec3i(floor(rayPos));
    let deltaDist = abs(vec3f(length(rayDir)) / rayDir);
    let rayStep = vec3i(sign(rayDir));
    var sideDist = (sign(rayDir) * (vec3f(mapPos) - rayPos) + (sign(rayDir) * 0.5) + 0.5) * deltaDist;

    var mask: vec3<bool>;
    var count = 0u;
    var max = 0u;
    var i = 0u;
    for (; i < NumSteps; i++) {
        let uv = ray_to_tex(vec3f(mapPos) / vec3f(16f));
        let intersects = all(uv <= vec3f(1f)) && all(uv >= vec3f(0f));
        if intersects {
            let off = (vec3f(sin(uniforms.time * 0.2f), 0f, 0f) + 1f) * 0.25;

            let s = textureSampleLevel(myTexture, mySampler, uv * 0.5f, 0f).r;
            let threshold = (sin(uniforms.time * 0.5) + 1.0) * 0.5;
            if s > threshold {
                count += 1u;
                if (Opaque) {
                    break;
                }
            }
            max += 1u;
        }

        mask = sideDist <= min(sideDist.yzx, sideDist.zxy);
        sideDist += vec3f(mask) * deltaDist;
        mapPos += vec3i(vec3f(mask)) * rayStep;
    }

    if i == NumSteps {
        return vec4f(vec3f(
            f32(count) / f32(max), 
            f32(count) / f32(NumSteps) * 1f, 
            f32(max) / f32(NumSteps)) * 1.5f, 
            1f);
    }

    let color = vec3f(mask) * vec3f(0.5, 1.0, 0.75);
    return vec4f(color, 1f);
}

fn frag_xray(near: vec3f, step: vec3f) -> vec4f {
    var rayPos = near;
    var result = 0f;

    var i = 0u;
    for (; i < NumSteps; i++) {
        let intersects = all(rayPos < vec3f(1f)) && all(rayPos > vec3f(-1f));// 
        if Xray {
            let texCoord = ray_to_tex(rayPos);
            let sample = textureSampleLevel(myTexture, mySampler, texCoord, 0f).r * 4f / f32(NumSteps);
            result += select(0f, (1f - result) * sample, intersects);
        }
        else if intersects {
            break;
        }
        rayPos += step;
    }

    if Xray {
        return vec4f(vec3f(result), 1f);
    }

    let hasSample = i != NumSteps;
    let sample = textureSampleLevel(myTexture, mySampler, ray_to_tex(rayPos), 0f).r;
    return vec4f(vec3f(select(0f, sample, hasSample)), 1f);
}