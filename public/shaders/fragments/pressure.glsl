#version 300 es

precision highp float;

uniform sampler2D uTex;
uniform sampler2D uObstacles;
uniform vec3 uObstacleColor;

in vec2 vUv;

out vec4 outColor;

void main(){
    // Check if this pixel is an obstacle
    float obstacle = texture(uObstacles, vUv).x;

    if (obstacle > 0.5) {
        // Inside obstacle - use obstacle color
        outColor = vec4(uObstacleColor, 1.0);
    } else {
        // Sample the pressure value (stored in red channel)
        float pressure = texture(uTex, vUv).r;

        // Normalize pressure to 0-1 range for visualization
        // Adjust these values based on your pressure range
        float normalizedPressure = pressure * 0.5 + 0.5;
        normalizedPressure = clamp(normalizedPressure, 0.0, 1.0);

        // Create blue to red gradient
        // Blue for low pressure (0), red for high pressure (1)
        vec3 lowColor = vec3(0.0, 0.2, 1.0);   // Blue
        vec3 highColor = vec3(1.0, 0.2, 0.0);  // Red

        vec3 color = mix(lowColor, highColor, normalizedPressure);

        outColor = vec4(color, 1.0);
    }
}
