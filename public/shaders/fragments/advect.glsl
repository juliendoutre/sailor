#version 300 es

precision highp float;

uniform sampler2D uQ;
uniform sampler2D uVelocity;
uniform sampler2D uObstacles;
uniform float uDt;
uniform float uDissipation;
uniform vec2 uTexel;
uniform vec2 uWind;

in vec2 vUv;

out vec4 outColor;

vec2 sampleVel(vec2 uv){
    return texture(uVelocity, uv).xy;
}

void main(){
    // Check if current cell is an obstacle
    float obstacle = texture(uObstacles, vUv).x;

    if (obstacle > 0.5) {
        // Inside obstacle - set velocity to zero
        outColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        // Backtrace (Semi-Lagrangian)
        vec2 vel = sampleVel(vUv);
        vec2 prevUv = vUv - uDt * vel * uTexel;

        // Check if backtraced position hits an obstacle
        float obstacleAtPrev = texture(uObstacles, prevUv).x;
        if (obstacleAtPrev > 0.5) {
            // Backtraced into obstacle, use current velocity
            vec4 q = texture(uQ, vUv);
            outColor = q * uDissipation + vec4(uWind * uDt, 0.0, 0.0);
        } else {
            vec4 q = texture(uQ, prevUv);
            outColor = q * uDissipation + vec4(uWind * uDt, 0.0, 0.0);
        }
    }
}
