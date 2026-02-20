#version 300 es

precision highp float;

uniform vec2 uPoint;
uniform float uRadius;
uniform float uAspect;

// Sail-shape uniforms
uniform float uShape;      // 0.0 = circle, 1.0 = sail
uniform float uChord;      // sail chord length
uniform float uCamber;     // camber as fraction of chord
uniform float uThickness;  // membrane half-width
uniform float uRotation;   // rotation angle in radians

in vec2 vUv;

out vec4 outColor;

float sdCircle(vec2 p, float r) {
    return length(p) - r;
}

vec2 rotate(vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// Exact distance to a quadratic Bezier curve (Inigo Quilez)
float sdBezier(vec2 pos, vec2 A, vec2 B, vec2 C) {
    vec2 a = B - A;
    vec2 b = A - 2.0 * B + C;
    vec2 c = a * 2.0;
    vec2 d = A - pos;

    float kk = 1.0 / dot(b, b);
    float kx = kk * dot(a, b);
    float ky = kk * (2.0 * dot(a, a) + dot(d, b)) / 3.0;
    float kz = kk * dot(d, a);

    float res = 0.0;

    float p = ky - kx * kx;
    float p3 = p * p * p;
    float q = kx * (2.0 * kx * kx - 3.0 * ky) + kz;
    float h = q * q + 4.0 * p3;

    if (h >= 0.0) {
        h = sqrt(h);
        vec2 x = (vec2(h, -h) - q) / 2.0;
        vec2 uv = sign(x) * pow(abs(x), vec2(1.0 / 3.0));
        float t = clamp(uv.x + uv.y - kx, 0.0, 1.0);
        res = dot(d + (c + b * t) * t, d + (c + b * t) * t);
    } else {
        float z = sqrt(-p);
        float v = acos(q / (p * z * 2.0)) / 3.0;
        float m = cos(v);
        float n = sin(v) * 1.732050808; // sqrt(3)
        vec3 t = clamp(vec3(m + m, -n - m, n - m) * z - kx, 0.0, 1.0);
        float d1 = dot(d + (c + b * t.x) * t.x, d + (c + b * t.x) * t.x);
        float d2 = dot(d + (c + b * t.y) * t.y, d + (c + b * t.y) * t.y);
        res = min(d1, d2);
    }

    return sqrt(res);
}

void main() {
    vec2 p = vUv - uPoint;
    p.x *= uAspect;

    float d;

    if (uShape < 0.5) {
        // Circle obstacle
        d = sdCircle(p, uRadius);
    } else {
        // Sail obstacle (thickened quadratic Bezier)
        vec2 pr = rotate(p, -uRotation);

        float halfChord = uChord * 0.5;
        float camberOffset = uCamber * uChord;

        vec2 A = vec2(-halfChord, 0.0);           // leading edge (luff)
        vec2 C = vec2( halfChord, 0.0);            // trailing edge (leech)
        vec2 B = vec2(0.0, camberOffset);           // camber control point

        d = sdBezier(pr, A, B, C) - uThickness;
    }

    // Convert distance to obstacle mask (1.0 = obstacle, 0.0 = fluid)
    float obstacle = 1.0 - smoothstep(-0.001, 0.001, d);

    outColor = vec4(obstacle, 0.0, 0.0, 1.0);
}
