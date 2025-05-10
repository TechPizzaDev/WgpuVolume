struct Uniforms {
    modelMat: mat4x4<f32>,
    invModelMat: mat4x4<f32>,
    viewMat: mat4x4<f32>,
    invViewMat: mat4x4<f32>,
    projMat: mat4x4<f32>,
    invProjMat: mat4x4<f32>,
    view_pos: vec4f,
    viewport: vec4f,
    time: f32,
}

struct SunUniforms {
    direction: vec3f,
    intensity: vec3f,
    ambient: vec3f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<uniform> sun: SunUniforms;
//@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var myTexture: texture_3d<u32>;

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,
    @location(1) tangent_world_pos: vec3f,
    @location(2) tangent_ray_dir: vec3f,
}

override NumSteps: u32 = 600;

override VolumeSize: i32 = 256;

override ShowFaceExits: bool = false;

const color_lookup_len: u32 = 6;
const color_lookup = array<vec4f, color_lookup_len>(
    vec4f(0, 0, 0.75, 0.4), // water
    vec4f(0, 1, 0, 1), // grass
    vec4f(160, 82, 45, 255) / 255f, // dirt
    vec4f(1, 1, 0, 1), // sand
    vec4f(0.55, 0.5, 0.5, 1), // stone,
    vec4f(1, 1, 1, 1), // snow
);

@vertex
fn vertex_main(
    @builtin(vertex_index) VertexIndex: u32
) -> VertexOutput {
    const x0 = -1f;
    const y0 = -1f;
    const z0 = -1f;
    const x1 = 1f;
    const y1 = 1f;
    const z1 = 1f;

    const positions = array<vec3f, 4 * 6>(
        // front
        vec3(x1, y0, z1),
        vec3(x0, y0, z1),
        vec3(x0, y1, z1),
        vec3(x1, y1, z1),

        // back
        vec3(x1, y1, z0),
        vec3(x0, y1, z0),
        vec3(x0, y0, z0),
        vec3(x1, y0, z0),

        // bottom
        vec3(x0, y0, z1),
        vec3(x1, y0, z1),
        vec3(x1, y0, z0),
        vec3(x0, y0, z0),

        // left
        vec3(x0, y1, z0),
        vec3(x0, y1, z1),
        vec3(x0, y0, z1),
        vec3(x0, y0, z0),

        // right
        vec3(x1, y1, z1),
        vec3(x1, y1, z0),
        vec3(x1, y0, z0),
        vec3(x1, y0, z1),

        // top
        vec3(x0, y1, z0),
        vec3(x1, y1, z0),
        vec3(x1, y1, z1),
        vec3(x0, y1, z1),
    );
    const normals = array<vec3f, 6>( 
        vec3(0, 0, 1), // front
        vec3(0, 0, -1), // back
        vec3(0, -1, 0), // bottom
        vec3(-1, 0, 0), // left
        vec3(1, 0, 0), // right
        vec3(0, 1, 0), // top
    );
    const indices = array<u32, 6>(
        0, 1, 2, 
        0, 2, 3,
    );
    let idx = indices[VertexIndex % 6] + (VertexIndex / 6) * 4;
    let pos = positions[idx];
    let normal = normals[VertexIndex / 6];

    let fake_normal = vec3f(0, 0, 1);
    let fake_tangent = vec3f(1, 0, 0);
    let fake_bitangent = cross(fake_normal, fake_tangent);

    let tangent_mat = mat3x3<f32>(
        uniforms.modelMat[0].xyz,
        uniforms.modelMat[1].xyz,
        uniforms.modelMat[2].xyz,
    );

    let model_tangent = normalize(tangent_mat * fake_tangent);
    let model_bitangent = normalize(tangent_mat * fake_bitangent);
    let model_normal = normalize(tangent_mat * fake_normal);
    
    let model_TBN = transpose(mat3x3<f32>(
        model_tangent, 
        model_bitangent, 
        model_normal));

    let mvpMat = 
        uniforms.projMat * 
        uniforms.viewMat * 
        uniforms.modelMat;
    
    let clip_pos = mvpMat * vec4f(pos, 1f);
    
    let world_pos = uniforms.modelMat * vec4f(pos, 1);

    let tangent_view_pos = model_TBN * uniforms.view_pos.xyz;
    let tangent_world_pos = model_TBN * world_pos.xyz;

    return VertexOutput(
        clip_pos,
        normal,
        //round(tangent_world_pos * f32(VolumeSize - 1) + f32(VolumeSize - 1) / 2),
        tangent_world_pos,
        (tangent_world_pos + tangent_view_pos) 
    );
}

fn ray_to_tex(pos: vec3f) -> vec3f {
    return (pos + 1f) * 0.5f;
}

struct MarchIntersection {
    id: i32,
    mask: vec3<bool>,
    coords: vec3<i32>,
}

struct MarchResult {
    enter: MarchIntersection,
    exit: MarchIntersection,
    
    side_dist: vec3f,
    step_count: u32,
    count: u32,
    max: u32,
}

fn compute_lighting(light_dir: vec3f, normal: vec3f) -> vec4f {
    let light_dot = dot(normal, light_dir);
    
    let light_color = clamp(sun.intensity * light_dot, sun.ambient, vec3f(1));
    
    return vec4f(light_color, 1.0);
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let threshold = (0.35 + (sin(uniforms.time * 1.0) + 1) * 0.15);
    let startPos = (input.tangent_world_pos * f32(VolumeSize - 1) + f32(VolumeSize - 1) / 2);

    var level = 0;
    var rayPos = startPos;
    let rayDir = input.tangent_ray_dir;

    var march_result: MarchResult;
    while (level >= 0) {
        march_result = raymarch(
            rayPos / f32(1u << u32(level)),
            rayDir,
            input.normal != vec3f(0),
            u32(level),
            threshold);
        rayPos = vec3f(march_result.exit.coords << vec3<u32>(u32(level)));

        break;
        level--;
    }

    let mi_enter = march_result.enter;
    let mi_exit = march_result.exit;
    
    if (!ShowFaceExits) {
        if (mi_enter.id == -1 && mi_exit.id == -1) {
            discard;
        }

        //let view_dir = normalize(uniforms.view_pos.xyz - input.position.xyz);
        //let halfway_dir = normalize(sun.direction + view_dir);

        let is_same = all(mi_enter.coords == mi_exit.coords);

        let enter_face = sign(rayDir) * vec3f(mi_enter.mask);
        let enter_normal = -normalize(uniforms.modelMat * vec4f(enter_face, 0));
        let enter_light = compute_lighting(sun.direction, enter_normal.xyz);
        let enter_diffuse = select(color_lookup[mi_enter.id], vec4f(0, 0, 0, 1), is_same);
        
        let exit_face = sign(rayDir) * vec3f(mi_exit.mask);
        let exit_normal = -normalize(uniforms.modelMat * vec4f(exit_face, 0));
        let exit_light = compute_lighting(sun.direction, exit_normal.xyz);
        let exit_diffuse = color_lookup[select(mi_exit.id, mi_enter.id, mi_exit.id == -1)];
    
        //return vec4f(ray_to_tex(exit_normal.xyz), 1f);

        // TODO: fix distance
        let dist = distance(startPos / f32(1u << u32(level)) - 0.5, vec3f(mi_exit.coords));
        //let side = march_result.side_dist;
        //let dist = min(min(side.x, side.y), side.z);
        
        let exit_factor = pow(enter_diffuse.a, dist / 16);
        return 
            enter_diffuse * enter_light +
            exit_diffuse * exit_light * vec4f(vec3f(exit_factor), 1);
    }

    let num_steps = NumSteps >> u32(level); 
    if march_result.step_count >= num_steps {
        return color_for_stop(march_result.count, march_result.max, num_steps);
    }
    return color_for_exit(mi_exit.mask, mi_exit.coords);
}

fn raymarch(start: vec3f, dir: vec3f, initial: vec3<bool>, level: u32, threshold: f32) -> MarchResult {
    var mi = MarchIntersection(-1, initial, vec3i(start));
    var mi_enter = mi;

    let deltaDist = abs(vec3f(length(dir)) / dir);
    let rayStep = sign(dir);
    var sideDist = (rayStep * (vec3f(mi.coords) - start) + (rayStep * 0.5) + 0.5) * deltaDist;
    
    var ray_length = 0f;
    var count = 0u;
    var step_max = 0u;
    var i = 0u;
    
    for (; i < (NumSteps >> level); i++) {
        let uv = mi.coords;
        let intersects = all(uv >= vec3i(0)) && all(uv < vec3i(VolumeSize >> level)); 
        if !intersects {
            break;
        }

        let tile_id = textureLoad(myTexture, uv, level).r;
        if (tile_id < color_lookup_len) {
            let old_id = mi.id;
            mi.id = i32(tile_id);

            if (old_id == -1) {
                mi_enter = mi;
            }
            count += 1;

            let color = color_lookup[mi.id];
            if (color.a == 1.0) { 
                break;
            }
        }
        step_max += 1;

        mi.mask = sideDist <= min(sideDist.yzx, sideDist.zxy);
        sideDist += vec3f(mi.mask) * deltaDist;
        mi.coords += vec3i(mi.mask) * vec3i(rayStep);
    }
        
    return MarchResult(
        mi_enter,
        mi,
        
        sideDist,
        i,
        count,
        step_max,
    );
}

fn color_for_stop(count: u32, max: u32, num_steps: u32) -> vec4f {
    return vec4f(vec3f(
        f32(count) / f32(max) + 0.15, 
        f32(count) / f32(num_steps) * 2.5f, 
        f32(max) / f32(num_steps)) * 1.5f, 
        1f);
}

fn color_for_exit(mask: vec3<bool>, pos: vec3i) -> vec4f {
    let cR = 
        f32((pos.z + 0) % 2) * 0.15 + 
        f32((pos.y + 1) % 2) * 0.15;

    let cB = 
        f32((pos.x + 0) % 2) * 0.15 + 
        f32((pos.y + 1) % 2) * 0.15;

    let cG = 
        f32((pos.x + 0) % 2) * 0.15 +
        f32((pos.z + 1) % 2) * 0.15;
 
    let color = vec3f(mask) * (vec3f(0.55, 0.7, 0.7) + vec3f(cR, cG, cB));
    return vec4f(color, 1f);
}