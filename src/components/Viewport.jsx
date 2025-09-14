import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

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
        
        // --- Initialize TransformControls ---
        const transformControls = new TransformControls(camera, renderer.domElement);
        transformControls.addEventListener('dragging-changed', (event) => {
            controls.enabled = !event.value;
        });
        scene.add(transformControls);

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        Object.assign(sceneRefs, { scene, camera, renderer, controls, raycaster, mouse, transformControls });

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
            // Do not trigger selection if the user is interacting with the transform controls
            if (transformControls.dragging) return;

            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(scene.children, true);

            // --- THIS IS THE FIX ---
            // Find the first intersected object that is a selectable CAD model
            const firstIntersected = intersects.find(i => i.object.isMesh && i.object.userData.isCadObject);

            if (firstIntersected) {
                // If we clicked a CAD object, select it
                onObjectSelected(firstIntersected.object.userData.id);
            } else {
                // If we clicked anything else (gizmo, background), deselect
                onObjectSelected(null);
            }
            // --- END FIX ---
        };
        renderer.domElement.addEventListener('mousedown', handleMouseDown);
        
        // --- Add Keyboard listeners for TransformControls ---
        const handleKeyDown = (event) => {
            switch (event.key) {
                case 'q':
                    transformControls.setSpace(transformControls.space === 'local' ? 'world' : 'local');
                    break;
                case 'w':
                    transformControls.setMode('translate');
                    break;
                case 'e':
                    transformControls.setMode('rotate');
                    break;
                case 'r':
                    transformControls.setMode('scale');
                    break;
                case '+':
                case '=':
                    transformControls.setSize(transformControls.size + 0.1);
                    break;
                case '-':
                case '_':
                    transformControls.setSize(Math.max(transformControls.size - 0.1, 0.1));
                    break;
                case ' ': // Spacebar
                    transformControls.enabled = !transformControls.enabled;
                    break;
                case 'Escape':
                    transformControls.reset();
                    break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);


        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('keydown', handleKeyDown);
            renderer.domElement.removeEventListener('mousedown', handleMouseDown);
            transformControls.dispose();
            currentMount.removeChild(renderer.domElement);
        };
    }, [sceneRefs, onObjectSelected]);

    // --- Effect for rebuilding scene when meshes change ---
    useEffect(() => {
        if (!sceneRefs.scene || !initialMeshes) return;
        const { scene } = sceneRefs;

        // --- Clear only CAD objects ---
        for (let i = scene.children.length - 1; i >= 0; i--) {
            const obj = scene.children[i];
            if (obj.userData.isCadObject) { // Only remove objects marked as CAD parts
                scene.remove(obj);
                obj.geometry.dispose();
                // Check if material is an array or single object before disposing
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(material => material.dispose());
                } else {
                    obj.material.dispose();
                }
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

            const material = new THREE.MeshStandardMaterial({
                color: 0xcccccc,
                metalness: 0.5,
                roughness: 0.5,
                side: THREE.DoubleSide // Essential for potentially inconsistent CAD normals
            });

            const mesh = new THREE.Mesh(geometry, material);
            // --- Mark this mesh as a CAD object for selective clearing ---
            mesh.userData.id = meshData.id;
            mesh.userData.isCadObject = true; 
            scene.add(mesh);
        });
        
        // --- Auto-focus camera on the new content ---
        const { camera, controls } = sceneRefs;
        const boundingBox = new THREE.Box3();
        
        // Ensure we only compute bounding box for CAD objects
        scene.children.forEach(child => {
            if (child.userData.isCadObject) {
                boundingBox.expandByObject(child);
            }
        });

        if (boundingBox.isEmpty()) {
             controls.target.set(0,0,0);
             camera.position.set(50,50,50);
        } else {
            const center = new THREE.Vector3();
            boundingBox.getCenter(center);
            controls.target.copy(center);
            
            const size = new THREE.Vector3();
            boundingBox.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = camera.fov * (Math.PI / 180);
            let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
            cameraZ *= 1.5; // Add some padding
            
            if (cameraZ > 0.1) {
                camera.position.set(center.x, center.y, center.z + cameraZ);
            }
        }
        
        controls.update();

    }, [initialMeshes, sceneRefs]);

    // --- Effect for attaching/detaching TransformControls ---
    useEffect(() => {
        if (!sceneRefs.scene || !sceneRefs.transformControls) return;
        const { scene, transformControls } = sceneRefs;

        // First, detach from any object
        if (transformControls.object) {
            transformControls.detach();
        }

        // Highlight and attach to the new selection
        let hasSelection = false;
        scene.children.forEach(child => {
            if (child.isMesh && child.userData.isCadObject && child.material) {
                const isSelected = child.userData.id === selectedShapeId;
                child.material.emissive.set(isSelected ? 0xffff00 : 0x000000);

                if (isSelected) {
                    transformControls.attach(child);
                    hasSelection = true;
                }
            }
        });

        // Ensure gizmo is not visible if no object is selected
        transformControls.visible = hasSelection;


    }, [selectedShapeId, initialMeshes, sceneRefs]);

    return <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />;
}

