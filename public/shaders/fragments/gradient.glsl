#version 300 es

precision highp float;

uniform sampler2D uVelocity;
uniform sampler2D uPressure;
uniform sampler2D uObstacles;
uniform vec2 uTexel;

in vec2 vUv;

out vec4 outColor;

void main(){
    // Check if current cell is an obstacle
    float obstacle = texture(uObstacles, vUv).x;

    if (obstacle > 0.5) {
        // Inside obstacle - set velocity to zero
        outColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
        float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
        float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
        float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;

        vec2 gradP = 0.5 * vec2(r - l, t - b);
        vec2 vel = texture(uVelocity, vUv).xy - gradP;

        outColor = vec4(vel, 0.0, 1.0);
    }
}
