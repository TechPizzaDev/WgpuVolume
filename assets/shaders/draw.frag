#version 300 es
precision highp float;
layout (std140, column_major) uniform;

// Link to original code: 
// https://www.shadertoy.com/view/4dX3zl

// The raycasting code is somewhat based around a 2D raycasting tutorial found here: 
// http://lodev.org/cgtutor/raycasting.html

const int MAX_RAY_STEPS = 96;

uniform DrawUniforms {
    ivec4 uResolution;
    vec4 uTime;
};

out vec4 fragColor;

float sdSphere(vec3 p, float d) {
    return length(p) - d;
}

float sdBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return min(max(d.x, max(d.y, d.z)), 0.0) +
        length(max(d, 0.0));
}

bool getVoxel(ivec3 c) {
    vec3 p = vec3(c) + vec3(0.5);
    float cutWave = sin(uTime.x);
    float boxCut = sign(cutWave) * sdSphere(p, 7.5 * abs(cutWave));
    float box = max(boxCut, sdBox(p, vec3(6.0)));
    float d = min(box, -sdSphere(p, 24.0));
    return d < 0.25;
}

vec2 rotate2d(vec2 v, float a) {
    float sinA = sin(a);
    float cosA = cos(a);
    return vec2(v.x * cosA - v.y * sinA, v.y * cosA + v.x * sinA);
}

void main() {
    float time = uTime.x;
    vec2 resolution = vec2(uResolution.xy);
    vec2 screenPos = (gl_FragCoord.xy / resolution.xy) * 2.0 - 1.0;

    vec3 cameraDir = vec3(0.0, 0.0, 0.8);
    vec3 cameraPlaneU = vec3(1.0, 0.0, 0.0);
    vec3 cameraPlaneV = vec3(0.0, 1.0, 0.0) * vec3(resolution.y / resolution.x);
    vec3 rayDir = cameraDir + screenPos.x * cameraPlaneU + screenPos.y * cameraPlaneV;
    vec3 rayPos = vec3(0.0, 2.0 * sin(time * 1.5), -20.0);

    rayPos.xz = rotate2d(rayPos.xz, time * 0.5);
    rayDir.xz = rotate2d(rayDir.xz, time * 0.5);

    ivec3 mapPos = ivec3(floor(rayPos + 0.));

    vec3 deltaDist = abs(vec3(length(rayDir)) / rayDir);

    ivec3 rayStep = ivec3(sign(rayDir));

    vec3 sideDist = (sign(rayDir) * (vec3(mapPos) - rayPos) + (sign(rayDir) * 0.5) + 0.5) * deltaDist;

    bvec3 mask;
    int hits = 0;

    for (int i = 0; i < MAX_RAY_STEPS; i++) {
        if (getVoxel(mapPos)) {
            hits += 1;
            break;
        }
        
        mask = lessThanEqual(sideDist.xyz, min(sideDist.yzx, sideDist.zxy));
        // All components of mask are false except for the corresponding largest component
        // of sideDist, which is the axis along which the ray should be incremented.
        sideDist += vec3(mask) * deltaDist;
        mapPos += ivec3(vec3(mask)) * rayStep;
    }

    if (hits == 0) {
        discard;
    }

    vec3 color;
    if (mask.x) {
        color = vec3(0.25);
    }
    if (mask.y) {
        color = vec3(0.75);
    }
    if (mask.z) {
        color = vec3(0.5);
    }
    fragColor.rgb = color;
}