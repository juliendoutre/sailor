#version 300 es

precision highp float;

uniform vec2 uPoint;
uniform float uRadius;
uniform float uAspect;

in vec2 vUv;

out vec4 outColor;

float sdCircle(vec2 p, float r) {
    return length(p) - r;
}

void main() {
    vec2 p = vUv - uPoint;
    p.x *= uAspect;

    float d = sdCircle(p, uRadius);

    // Convert distance to obstacle mask (1.0 = obstacle, 0.0 = fluid)
    float obstacle = 1.0 - smoothstep(-0.001, 0.001, d);

    outColor = vec4(obstacle, 0.0, 0.0, 1.0);
}
