#version 300 es

precision highp float;

uniform sampler2D uVelocity;
uniform vec2 uTexel;

in vec2 vUv;

out vec4 outColor;

void main(){
    float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
    float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
    float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
    float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y;

    float div = 0.5 * ((r - l) + (t - b));

    outColor = vec4(div, 0.0, 0.0, 1.0);
}
