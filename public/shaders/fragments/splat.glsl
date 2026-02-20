#version 300 es

precision highp float;

uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec3 uColor;
uniform float uRadius;
uniform float uAspect;

in vec2 vUv;

out vec4 outColor;

void main(){
    vec4 base = texture(uTarget, vUv);
    vec2 p = vUv - uPoint;
    p.x *= uAspect;
    float d2 = dot(p, p);
    float a = exp(-d2 / max(uRadius*uRadius, 1e-6));
    outColor = base + vec4(uColor * a, 0.0);
}
