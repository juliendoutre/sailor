#version 300 es

precision highp float;

uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform sampler2D uObstacles;
uniform vec2 uTexel;

in vec2 vUv;

out vec4 outColor;

void main(){
    // Check if current cell is an obstacle
    float obstacle = texture(uObstacles, vUv).x;

    if (obstacle > 0.5) {
        // Inside obstacle - set pressure to zero
        outColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        // Sample neighboring pressures
        float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
        float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
        float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
        float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;

        // Check for obstacles in neighboring cells and apply boundary conditions
        float obstacleL = texture(uObstacles, vUv - vec2(uTexel.x, 0.0)).x;
        float obstacleR = texture(uObstacles, vUv + vec2(uTexel.x, 0.0)).x;
        float obstacleB = texture(uObstacles, vUv - vec2(0.0, uTexel.y)).x;
        float obstacleT = texture(uObstacles, vUv + vec2(0.0, uTexel.y)).x;

        // Use current cell pressure for obstacle neighbors (Neumann boundary condition)
        float currentP = texture(uPressure, vUv).x;
        if (obstacleL > 0.5) l = currentP;
        if (obstacleR > 0.5) r = currentP;
        if (obstacleB > 0.5) b = currentP;
        if (obstacleT > 0.5) t = currentP;

        float div = texture(uDivergence, vUv).x;
        float p = (l + r + b + t - div) * 0.25;

        outColor = vec4(p, 0.0, 0.0, 1.0);
    }
}
