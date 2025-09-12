import * as THREE from 'three';

// A factory for creating Three.js mesh objects from server data.
export const MeshFactory = {
    /**
     * Creates a single Three.js Mesh from the combined geometry data of a shape,
     * and prepares it for face selection with vertex coloring.
     * @param {object} meshData - The complete mesh data object from the backend.
     * @returns {THREE.Mesh | null} A mesh object or null if data is invalid.
     */
    createCombinedMesh(meshData) {
        if (!meshData.vertices || meshData.vertices.length === 0) {
            console.error("MeshFactory: No vertices found in meshData.");
            return null;
        }

        const geometry = new THREE.BufferGeometry();

        // 1. Set position and index using the global, combined buffers
        const vertices = new Float32Array(meshData.vertices);
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

        if (meshData.indices && meshData.indices.length > 0) {
            geometry.setIndex(meshData.indices);
        }

        // 2. IMPORTANT: Calculate normals for proper lighting
        geometry.computeVertexNormals();

        // 3. Prepare the vertex colors attribute for highlighting
        const baseColor = new THREE.Color(0xcccccc); // Default gray
        const colors = [];

        // Assign the base color to every vertex
        for (let i = 0; i < (vertices.length / 3); i++) {
            colors.push(baseColor.r, baseColor.g, baseColor.b);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        // 4. Create a material that uses the vertex colors
        const material = new THREE.MeshStandardMaterial({
            metalness: 0.1,
            roughness: 0.8,
            side: THREE.DoubleSide,
            vertexColors: true // This tells the material to use the 'color' attribute
        });

        // 5. Create the final mesh
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `shape-${meshData.id}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        // 6. Store all necessary data for later interaction (like selection)
        mesh.userData = {
            shapeId: meshData.id,
            isCadObject: true,
            isSelectable: true,
            faces: meshData.faces, // Store the original face data
            faceIdByTriangle: meshData.faceIdByTriangle, // Store the lookup map
        };

        return mesh;
    },
};