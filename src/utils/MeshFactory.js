import * as THREE from 'three';

// A factory for creating Three.js mesh objects from server data.
export const MeshFactory = {
    createFaceMesh(faceData) {
        if (!faceData.vertices || faceData.vertices.length === 0) return null;

        const geometry = new THREE.BufferGeometry();
        
        const vertices = new Float32Array(faceData.vertices.flat());
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

        if (faceData.indices && faceData.indices.length > 0) {
            geometry.setIndex(faceData.indices);
        }
        
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            metalness: 0.1,
            roughness: 0.8,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `face-${faceData.id}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        mesh.userData = {
            faceId: faceData.id,
            faceInfo: faceData,
            isSelectable: true
        };

        return mesh;
    },
};