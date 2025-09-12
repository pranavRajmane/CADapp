import React, { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { MeshFactory } from '../utils/MeshFactory';
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js';

export function Viewport({ initialMeshes, onSceneReady, onObjectSelected, selectedShapeId }) {
    const mountRef = useRef(null);
    const sceneObjectsRef = useRef(new Map());
    const originalMaterialsRef = useRef(new Map());
    const prevMeshCount = useRef(0);

    const selectedMaterial = new THREE.MeshStandardMaterial({
        color: 0xffa500, // Orange
        emissive: 0xffa500,
        emissiveIntensity: 0.5,
        side: THREE.DoubleSide
    });

    const sceneRef = useRef();
    const cameraRef = useRef();
    const controlsRef = useRef();
    const rendererRef = useRef();
    const viewHelperRef = useRef();


    const fitCameraToObjects = useCallback((objects) => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!objects || objects.length === 0 || !camera || !controls) {
            console.error("fitCameraToObjects: Aborting - no objects, camera, or controls.");
            return;
        }

        const box = new THREE.Box3();
        for (const object of objects) {
            box.expandByObject(object);
        }

        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        // --- DEBUGGING LOG ---
        console.log("--- Viewport.jsx: fitCameraToObjects ---");
        console.log("Bounding Box Min:", JSON.stringify(box.min));
        console.log("Bounding Box Max:", JSON.stringify(box.max));
        console.log("Calculated Size:", JSON.stringify(size));
        console.log("Calculated Center:", JSON.stringify(center));
        // --- END DEBUGGING LOG ---

        if (size.length() === 0 || !isFinite(size.length())) {
            console.warn("fitCameraToObjects: Bounding box is empty or invalid. Cannot fit camera.");
            return;
        }
        
        const maxSize = Math.max(size.x, size.y, size.z);
        const fitHeightDistance = maxSize / (2 * Math.atan(Math.PI * camera.fov / 360));
        const fitWidthDistance = fitHeightDistance / camera.aspect;
        const distance = 1.5 * Math.max(fitHeightDistance, fitWidthDistance);
        const direction = controls.target.clone().sub(camera.position).normalize().multiplyScalar(distance);

        controls.maxDistance = distance * 10;
        controls.target.copy(center);

        camera.near = distance / 100;
        camera.far = distance * 100;
        camera.updateProjectionMatrix();
        camera.position.copy(controls.target).sub(direction);

        controls.update();
    }, []);

    // Effect for initializing the scene
    useEffect(() => {
        const currentMount = mountRef.current;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x282c34);
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 10000);
        camera.position.set(50, 50, 50);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        rendererRef.current = renderer;
        renderer.setScissorTest(true);
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        currentMount.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controlsRef.current = controls;

        const ambientLight = new THREE.AmbientLight(0x404040, 3);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
        directionalLight.position.set(50, 50, 50);
        scene.add(directionalLight);
        const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
        fillLight.position.set(-50, 50, -50);
        scene.add(fillLight);

        const viewHelper = new ViewHelper(camera, renderer.domElement);
        viewHelperRef.current = viewHelper;

        const animate = () => {
            requestAnimationFrame(animate);
            controls.update();
            renderer.setScissor(0, 0, currentMount.clientWidth, currentMount.clientHeight);
            renderer.setViewport(0, 0, currentMount.clientWidth, currentMount.clientHeight);
            renderer.render(scene, camera);
            viewHelper.render(renderer);
        };
        animate();

        if (onSceneReady) onSceneReady({ scene, fitCameraToObjects });

        const handleResize = () => {
            camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        };
        window.addEventListener('resize', handleResize);

        const handleClick = (event) => {
            const rect = renderer.domElement.getBoundingClientRect();
            const mouse = new THREE.Vector2();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(scene.children, true);

            if (intersects.length > 0) {
                let selectedObject = intersects[0].object;
                while (selectedObject && !selectedObject.userData.shapeId) {
                    selectedObject = selectedObject.parent;
                }
                if (selectedObject && onObjectSelected) {
                    onObjectSelected(selectedObject.userData.shapeId);
                }
            } else if (onObjectSelected) {
                onObjectSelected(null);
            }
        };
        currentMount.addEventListener('click', handleClick);

        return () => {
            window.removeEventListener('resize', handleResize);
            currentMount.removeEventListener('click', handleClick);
            if (currentMount && renderer.domElement) {
                currentMount.removeChild(renderer.domElement);
            }
        };
    }, [onSceneReady, fitCameraToObjects, onObjectSelected]);

    // Effect for loading/updating meshes
    useEffect(() => {
        // --- DEBUGGING LOG ---
        console.log("--- Viewport.jsx: useEffect for meshes ---");
        console.log(`Received ${initialMeshes ? initialMeshes.length : 0} mesh(es) to process.`);
        // --- END DEBUGGING LOG ---

        const scene = sceneRef.current;
        if (!scene || !initialMeshes) return;

        const incomingShapeIds = new Set(initialMeshes.map(m => m.id));

        sceneObjectsRef.current.forEach((group, shapeId) => {
            if (!incomingShapeIds.has(shapeId)) {
                scene.remove(group);
                sceneObjectsRef.current.delete(shapeId);
                group.children.forEach(mesh => originalMaterialsRef.current.delete(mesh.uuid));
            }
        });

        initialMeshes.forEach(meshData => {
            if (sceneObjectsRef.current.has(meshData.id)) {
                const oldGroup = sceneObjectsRef.current.get(meshData.id);
                scene.remove(oldGroup);
                oldGroup.children.forEach(mesh => originalMaterialsRef.current.delete(mesh.uuid));
            }

            const shapeGroup = new THREE.Group();
            shapeGroup.userData.isCadObject = true;
            shapeGroup.userData.shapeId = meshData.id;

            if (meshData.faces && meshData.faces.length > 0) {
                meshData.faces.forEach(faceData => {
                    const faceMesh = MeshFactory.createFaceMesh(faceData);
                    if (faceMesh) {
                        shapeGroup.add(faceMesh);
                    }
                });
            }
            scene.add(shapeGroup);
            sceneObjectsRef.current.set(meshData.id, shapeGroup);
        });

        const allGroups = Array.from(sceneObjectsRef.current.values());
        if (allGroups.length > 0 && allGroups.length !== prevMeshCount.current) {
            fitCameraToObjects(allGroups);
        }
        prevMeshCount.current = allGroups.length;

    }, [initialMeshes, fitCameraToObjects]);

    // Effect for highlighting selected shape
    useEffect(() => {
        sceneObjectsRef.current.forEach((group, shapeId) => {
            const isSelected = shapeId === selectedShapeId;
            group.children.forEach(mesh => {
                if (mesh.isMesh) {
                    if (isSelected) {
                        if (!originalMaterialsRef.current.has(mesh.uuid)) {
                            originalMaterialsRef.current.set(mesh.uuid, mesh.material);
                        }
                        mesh.material = selectedMaterial;
                    } else {
                        if (originalMaterialsRef.current.has(mesh.uuid)) {
                            mesh.material = originalMaterialsRef.current.get(mesh.uuid);
                            originalMaterialsRef.current.delete(mesh.uuid);
                        }
                    }
                }
            });
        });
    }, [selectedShapeId, selectedMaterial]);

    return <div ref={mountRef} className="viewport-canvas" />;
}