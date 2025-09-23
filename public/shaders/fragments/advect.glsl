#version 300 es

precision highp float;

uniform sampler2D uQ;
uniform sampler2D uVelocity;
uniform float uDt;
uniform float uDissipation;
uniform vec2 uTexel;

in vec2 vUv;

out vec4 outColor;

vec2 sampleVel(vec2 uv){
    return texture(uVelocity, uv).xy;
}

void main(){
    // Backtrace (Semi-Lagrangian)
    vec2 vel = sampleVel(vUv);
    vec2 prevUv = vUv - uDt * vel * uTexel;
    vec4 q = texture(uQ, prevUv);
    outColor = q * uDissipation;
}
