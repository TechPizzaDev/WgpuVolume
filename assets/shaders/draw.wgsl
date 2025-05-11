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
    ortho: i32,
}

struct SunUniforms {
    direction: vec3f,
    intensity: vec3f,
    ambient: vec3f,
}

struct NoiseUniforms {
    offset: vec4f,
    amplitude: f32,
    frequency: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<uniform> sun: SunUniforms;
@group(0) @binding(2) var<uniform> u_noise: NoiseUniforms;
//@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(3) var myTexture: texture_3d<u32>;

struct VertexOutput {
    @builtin(position) frag_pos: vec4f,
    @location(0) normal: vec3f,
    @location(1) world_pos: vec3f,
    @location(2) tangent_sun_dir: vec3f, 
    @location(3) tangent_view_pos: vec3f,
    @location(4) tangent_frag_pos: vec3f,
}

override VolumeSize: i32 = 256;

override NumSteps: u32 = 512;

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

    let face_normal = vec3f(0, 0, 1);
    let face_tangent = vec3f(1, 0, 0);

    let model_tangent = normalize((uniforms.modelMat * vec4f(face_tangent, 0)).xyz);
    let model_normal = normalize((uniforms.modelMat * vec4f(face_normal, 0)).xyz);
    let model_bitangent = cross(model_normal, model_tangent);

    let TBN_mat = mat3x3<f32>(
        model_tangent, 
        model_bitangent, 
        model_normal);

    let inv_TBN_mat = transpose(TBN_mat);

    let MVP_mat = 
        uniforms.projMat * 
        uniforms.viewMat * 
        uniforms.modelMat;
    
    let clip_pos = MVP_mat * vec4f(pos, 1f);
    
    let world_pos = uniforms.modelMat * vec4f(pos, 1);

    let tangent_view_pos = inv_TBN_mat * uniforms.view_pos.xyz;
    let tangent_world_pos = inv_TBN_mat * world_pos.xyz;

    return VertexOutput(
        clip_pos,
        normal,
        pos,
        
        inv_TBN_mat * sun.direction,
        inv_TBN_mat * uniforms.view_pos.xyz,
        inv_TBN_mat * world_pos.xyz,
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

    let light_dir = input.tangent_sun_dir;
    let view_dir = normalize(
        input.tangent_view_pos + 
        select(input.tangent_frag_pos, vec3f(0), uniforms.ortho != 0));  

    let threshold = (0.35 + (sin(uniforms.time * 1.0) + 1) * 0.15);
    let startPos = (input.world_pos + 1) * (f32(VolumeSize - 1) / 2);

    //return vec4f(ray_to_tex(view_dir), 1);

    var level = 0;
    var rayPos = startPos;
    let rayDir = view_dir;

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
        let enter_normal = -normalize(enter_face.xyz);
        let enter_light = compute_lighting(input.tangent_sun_dir, enter_normal.xyz);
        let enter_diffuse = select(color_lookup[mi_enter.id], vec4f(0, 0, 0, 1), is_same);
        
        let exit_face = sign(rayDir) * vec3f(mi_exit.mask);
        let exit_normal = -normalize(exit_face.xyz);
        let exit_light = compute_lighting(input.tangent_sun_dir, exit_normal.xyz);
        let exit_diffuse = color_lookup[select(mi_exit.id, mi_enter.id, mi_exit.id == -1)];
    
        // TODO: fix distance (to face)
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

const Primes: vec4i = vec4i(501125321, 1136930381, 1720413743, 1066037191);

fn interpQuintic(t: vec3f) -> vec3f {
    return ((t * t) * t) * (t * (t * 6 - vec3f(15)) + 10);
}

fn hashPrimes(seed: vec4i, x: vec4i, y: vec4i, z: vec4i) -> vec4i {
    let hash = (seed ^ (x ^ (y ^ z))) * 0x27d4eb2d;
    return (hash >> vec4u(15u)) ^ hash;
}

fn gradientDot(hash: vec4i, x: vec4f, y: vec4f, z: vec4f) -> vec4f {
    let h = hash & vec4i(13);

    //if h < 8 then x, else y
    let u = select(y, x, h < vec4i(8));

    //if h < 4 then y else if h is 12 or 14 then x else z
    let v1 = select(z, x, h == vec4i(12));
    let v2 = select(v1, y, h < vec4i(2));

    //if h1 then -u else u
    //if h2 then -v else v
    let h1 = hash << vec4u(31);
    let h2 = (hash & vec4i(2)) << vec4u(30);

    return bitcast<vec4f>(bitcast<vec4i>(u) ^ h1) + bitcast<vec4f>(bitcast<vec4i>(v2) ^ h2);
}

fn perlinNoise3(p: vec3f, seed: i32) -> f32 {
    let ps = floor(p);

    let p0 = vec3i(ps) * Primes.xyz;
    let p1 = p0 + Primes.xyz;
    
    let pf0 = p - ps;
    let pf1 = pf0 - vec3f(1f);

    let q = interpQuintic(pf0);

    let hp0 = hashPrimes(
        vec4i(seed), 
        vec4i(p0.x, p1.x, p0.x, p1.x),
        vec4i(p0.yy, p1.yy),
        vec4i(p0.zzzz));

    let hp1 = hashPrimes(
        vec4i(seed), 
        vec4i(p0.x, p1.x, p0.x, p1.x),
        vec4i(p0.yy, p1.yy),
        vec4i(p1.zzzz));

    let gd0 = gradientDot(
        hp0, 
        vec4f(pf0.x, pf1.x, pf0.x, pf1.x),
        vec4f(pf0.yy, pf1.yy),
        vec4f(pf0.zzzz));

    let gd1 = gradientDot(
        hp1, 
        vec4f(pf0.x, pf1.x, pf0.x, pf1.x),
        vec4f(pf0.yy, pf1.yy),
        vec4f(pf1.zzzz));

    let m0 = mix(gd0.xz, gd0.yw, q.x);
    let m1 = mix(gd1.xz, gd1.yw, q.x);

    return (0.964921414852142333984375 * mix(
        mix(m0.x, m0.y, q.y),
        mix(m1.x, m1.y, q.y),
        q.z));
}

fn falloff(y: f32, h: f32) -> f32 {
    let fallStart: f32 = (y / h + 1.25);
    return 0.3 * (fallStart * fallStart);
}

fn selectTile(p: vec3f, size: i32, seed: i32, amplitude: f32, frequency: f32) -> u32 {
    const TileType_Water: u32 = 0;
    const TileType_Grass: u32 = 1;
    const TileType_Dirt: u32 = 2;
    const TileType_Sand: u32 = 3;
    const TileType_Stone: u32 = 4;
    const TileType_Snow: u32 = 5;
    const TileType_Air: u32 = 255;

    const N_OCTAVES: i32 = 4;

    var noise: f32 = 0f;
    var amp = amplitude;
    var freq: f32 = frequency / f32(size);

    let carveThreshold: f32 = 0.5f;
    let dirtThreshold: f32 = carveThreshold - 0.1f;
    let grassThreshold: f32 = carveThreshold - 0.025f;
    let sandThreshold: f32 = carveThreshold - 0.04f;

    let fall = falloff(p.y, f32(size));
    let isAboveWater: bool = (p.y) > (f32(size) * 0.5f);

    for (var i = 0; i < N_OCTAVES; i++) {
        let gen: f32 = perlinNoise3(freq * p, seed);
        let scaled: f32 = (gen + 1.0) * 0.5;
        noise += scaled * amp;

        amp = (amp * 0.5);
        freq = (freq * 2.0);
    }
    noise *= fall;
    
    let isDirt: bool = (noise > (dirtThreshold)) & isAboveWater;
    let isSand: bool = (noise > (sandThreshold));
    let tileSolid: u32 = select(
        select(TileType_Stone, TileType_Sand, isSand),
        TileType_Dirt,
        isDirt);

    let isCarved: bool = (noise < (carveThreshold));
    let tileCarved: u32 = select(TileType_Air, tileSolid, isCarved);

    let isAir: bool = (tileCarved == TileType_Air);
    let isWater: bool = isAir & (!isAboveWater);
    let tileWet: u32 = select(tileCarved, TileType_Water, isWater);

    let canCover: bool = (tileWet == TileType_Dirt);
    let shouldCover: bool = (noise >= grassThreshold);
    let isCovered: bool = canCover & shouldCover;
    let tileCover: u32 = select(tileWet, TileType_Grass, isCovered);

    return tileCover;
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
    
    let amplitude = u_noise.amplitude;
    let frequency = u_noise.frequency;
    let offset = u_noise.offset.xyz;

    for (; i < (NumSteps >> level); i++) {
        let uv = mi.coords;
        let intersects = all(uv >= vec3i(0)) && all(uv < vec3i(VolumeSize >> level)); 
        if !intersects {
            break;
        }

        //let tile_id = textureLoad(myTexture, uv, level).r;
        let size = VolumeSize >> level;
        let tile_id = selectTile(vec3f(uv) + offset, size, 1234, amplitude, frequency);

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

fn color_for_stop(hits: u32, steps: u32, max: u32) -> vec4f {
    let rgb = vec3f(
        f32(hits) / f32(steps), 
        f32(hits) / f32(max), 
        f32(steps) / f32(max));
    return vec4f(rgb * 1.5f, 1f);
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