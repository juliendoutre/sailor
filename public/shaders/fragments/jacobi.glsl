#version 300 es

precision highp float;

uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;

in vec2 vUv;

out vec4 outColor;

void main(){
    float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
    float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
    float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
    float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
    float div = texture(uDivergence, vUv).x;
    float p = (l + r + b + t - div) * 0.25;

    outColor = vec4(p, 0.0, 0.0, 1.0);
}
