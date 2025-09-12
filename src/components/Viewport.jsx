import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function Viewport({ initialMeshes, onSceneReady, onObjectSelected, selectedShapeId }) {
    const mountRef = useRef(null);
    // Use an object to hold refs to avoid re-running the main setup effect
    const sceneRefs = useRef({}).current;

    // --- Main setup effect, runs only once ---
    useEffect(() => {
        const currentMount = mountRef.current;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a);

        const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 20000);
        camera.position.set(50, 50, 50);
        camera.lookAt(new THREE.Vector3(0, 0, 0));

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        currentMount.appendChild(renderer.domElement);
        
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(100, 100, 100);
        scene.add(directionalLight);

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        Object.assign(sceneRefs, { scene, camera, renderer, controls, raycaster, mouse });

        const handleResize = () => {
            camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        };
        window.addEventListener('resize', handleResize);

        const animate = () => {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        const handleMouseDown = (event) => {
            event.preventDefault();

            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(scene.children, true);

            if (intersects.length > 0) {
                const firstIntersected = intersects.find(i => i.object.isMesh && i.object.userData.id);
                if (firstIntersected) {
                    onObjectSelected(firstIntersected.object.userData.id);
                }
            } else {
                onObjectSelected(null);
            }
        };
        renderer.domElement.addEventListener('mousedown', handleMouseDown);


        return () => {
            window.removeEventListener('resize', handleResize);
            renderer.domElement.removeEventListener('mousedown', handleMouseDown);
            currentMount.removeChild(renderer.domElement);
        };
    }, [sceneRefs, onObjectSelected]);

    // --- Effect for rebuilding scene when meshes change ---
    useEffect(() => {
        if (!sceneRefs.scene || !initialMeshes) return;
        const { scene } = sceneRefs;

        for (let i = scene.children.length - 1; i >= 0; i--) {
            const obj = scene.children[i];
            if (obj.isMesh) {
                scene.remove(obj);
                obj.geometry.dispose();
                obj.material.dispose();
            }
        }

        if (initialMeshes.length === 0) return;

        initialMeshes.forEach(meshData => {
            if (!meshData || !meshData.vertices || !meshData.indices) return;

            const geometry = new THREE.BufferGeometry();
            const vertices = new Float32Array(meshData.vertices);
            geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            geometry.setIndex(meshData.indices);
            geometry.computeVertexNormals();

            // --- THIS IS THE FIX ---
            // Tell the material to render both the front and back of each face.
            // This solves the problem of faces disappearing when normals are inconsistent.
            const material = new THREE.MeshStandardMaterial({
                color: 0xcccccc,
                metalness: 0.5,
                roughness: 0.5,
                side: THREE.DoubleSide // <--- THE FIX
            });
            // --- END FIX ---

            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData.id = meshData.id;
            scene.add(mesh);
        });

        const { camera, controls } = sceneRefs;
        const boundingBox = new THREE.Box3().setFromObject(scene);
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);
        controls.target.copy(center);
        
        const size = new THREE.Vector3();
        boundingBox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5;
        
        if (cameraZ > 0.1) {
            camera.position.set(center.x, center.y, center.z + cameraZ);
        }
        
        controls.update();

    }, [initialMeshes, sceneRefs]);

    // --- Effect for highlighting the selected object ---
    useEffect(() => {
        if (!sceneRefs.scene) return;
        const { scene } = sceneRefs;

        scene.children.forEach(child => {
            if (child.isMesh && child.material) {
                const isSelected = child.userData.id === selectedShapeId;
                child.material.emissive.set(isSelected ? 0xffff00 : 0x000000);
            }
        });

    }, [selectedShapeId, initialMeshes, sceneRefs]);

    return <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />;
}

