#version 300 es

precision highp float;

uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec3 uColor;
uniform float uRadius;

in vec2 vUv;

out vec4 outColor;

void main(){
    vec4 base = texture(uTarget, vUv);
    float d = distance(vUv, uPoint);
    float a = exp(- (d*d) / max(uRadius*uRadius, 1e-6));
    outColor = base + vec4(uColor * a, 1.0 - (1.0 - base.a) * (1.0 - a));
}
