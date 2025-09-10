import * as THREE from 'three';

const vertexShader = `
  varying vec3 v_worldPosition;
  
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    v_worldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = `
  varying vec3 v_worldPosition;
  uniform float u_zoom;
  uniform vec3 u_color_thin;
  uniform vec3 u_color_thick;
  
  // This function draws a grid line with a given thickness and anti-aliasing
  float getGrid(float value, float thickness, float antiAlias) {
    float d = fwidth(value) * antiAlias;
    float g = abs(fract(value - 0.5) - 0.5) / d;
    return 1.0 - min(g, 1.0);
  }

  void main() {
    // Define line properties
    float line_width_thin = 1.0;
    float line_width_thick = 1.5;
    float line_anti_alias = 1.0;

    // --- Primary (Thick) Grid ---
    // Calculate grid lines for X and Z axes
    float grid_thick_x = getGrid(v_worldPosition.x, line_width_thick, line_anti_alias);
    float grid_thick_z = getGrid(v_worldPosition.z, line_width_thick, line_anti_alias);
    // Combine them to get the final grid strength
    float grid_thick = max(grid_thick_x, grid_thick_z);
    
    // --- Secondary (Thin) Grid ---
    // We use the zoom uniform to scale the coordinates, making the grid appear finer
    float thin_grid_scale = 10.0;
    float grid_thin_x = getGrid(v_worldPosition.x * thin_grid_scale, line_width_thin, line_anti_alias);
    float grid_thin_z = getGrid(v_worldPosition.z * thin_grid_scale, line_width_thin, line_anti_alias);
    float grid_thin = max(grid_thin_x, grid_thin_z);
    
    // --- Fading Logic ---
    // Fade the thin grid out as we zoom away
    float fade_distance_start = 5.0;
    float fade_distance_end = 20.0;
    float fade_opacity = 1.0 - smoothstep(fade_distance_start, fade_distance_end, u_zoom);

    // --- Final Color Calculation ---
    // Start with the thick grid color
    vec3 final_color = u_color_thick * grid_thick;
    // Mix in the thin grid color, respecting its faded opacity
    final_color = mix(final_color, u_color_thin, grid_thin * fade_opacity);
    
    // If the pixel is not on any line, discard it to make it transparent
    if (max(grid_thick, grid_thin) < 0.1) {
      discard;
    }
    
    gl_FragColor = vec4(final_color, 1.0);
  }
`;

export function createInfiniteGridHelper() {
    const geometry = new THREE.PlaneGeometry(1000, 1000);
    
    const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide,
        uniforms: {
            u_zoom: { value: 1.0 },
            u_color_thin: { value: new THREE.Color(0xffffff) }, // White thin lines
            u_color_thick: { value: new THREE.Color(0xffffff) }, // White thick lines
            // ----------------------------------
        },
    });

    const gridMesh = new THREE.Mesh(geometry, material);
    // Rotate the plane to lie flat on the XZ axis
    gridMesh.rotation.x = -Math.PI / 2;
    gridMesh.position.y = -0.01; // Slightly below Y=0 to avoid z-fighting
    
    return gridMesh;
}