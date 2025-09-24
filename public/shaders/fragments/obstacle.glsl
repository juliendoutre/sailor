#version 300 es

precision highp float;

uniform vec2 uPoint;
uniform float uRadius;
uniform int uShape; // 0 = circle, 1 = rectangle, 2 = custom shape
uniform vec2 uSize; // for rectangle: width, height
uniform float uRotation; // rotation angle in radians

in vec2 vUv;

out vec4 outColor;

// Distance function for a circle
float sdCircle(vec2 p, float r) {
    return length(p) - r;
}

void main() {
    vec2 p = vUv - uPoint;

    float d = 1.0;

    d = sdCircle(p, uRadius);

    // Convert distance to obstacle mask (1.0 = obstacle, 0.0 = fluid)
    float obstacle = 1.0 - smoothstep(-0.001, 0.001, d);

    outColor = vec4(obstacle, 0.0, 0.0, 1.0);
}
