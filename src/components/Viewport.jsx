import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

export function Viewport({ initialMeshes, onObjectSelected, selectedShapeId }) {
    const mountRef = useRef(null);
    // Use an object to hold refs to avoid re-running the main setup effect
    const sceneRefs = useRef({}).current;
    
    // A ref to hold the latest selectedShapeId, accessible inside the animation loop
    const selectedShapeIdRef = useRef(selectedShapeId);
    useEffect(() => {
        selectedShapeIdRef.current = selectedShapeId;
    }, [selectedShapeId]);


    // --- Main setup effect, runs only once ---
    useEffect(() => {
        const currentMount = mountRef.current;
        const scene = new THREE.Scene();
        const backgroundColor = new THREE.Color(0x1a1a1a); // Define color once
        scene.background = backgroundColor;

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

        // --- NEW: Axis Helper Setup ---
        const axisScene = new THREE.Scene();
        axisScene.background = backgroundColor; // Use the same color
        // --- MODIFIED: Switched to an OrthographicCamera for a stable, non-perspective view ---
        const frustumSize = 4.5;
        const aspect = 1; // The viewport is square
        const axisCamera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2,
            frustumSize * aspect / 2,
            frustumSize / 2,
            frustumSize / -2,
            0.1,
            100
        );
        axisCamera.position.set(5, 5, 5); // Position for an isometric view
        axisCamera.lookAt(0, 0, 0);


        // The group will hold all axis helpers and be rotated
        const axisGroup = new THREE.Group();
        axisScene.add(axisGroup);
        
        // Create arrows
        const origin = new THREE.Vector3(0, 0, 0);
        const length = 1.5;
        const headLength = 0.4;
        const headWidth = 0.2;
        axisGroup.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, length, 0xff0000, headLength, headWidth));
        axisGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, length, 0x00ff00, headLength, headWidth));
        axisGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), origin, length, 0x0000ff, headLength, headWidth));

        // Helper function to create text labels as sprites
        function makeAxisLabelSprite(text, color) {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const size = 64;
            canvas.width = size;
            canvas.height = size;
            context.font = `bold ${size/2}px Arial`;
            context.fillStyle = color;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(text, size / 2, size / 2 + 4); // +4 for vertical centering
            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.scale.set(0.7, 0.7, 0.7);
            return sprite;
        }

        // Create labels
        const xLabel = makeAxisLabelSprite('X', '#ff6666');
        xLabel.position.set(1.8, 0, 0);
        const yLabel = makeAxisLabelSprite('Y', '#66ff66');
        yLabel.position.set(0, 1.8, 0);
        const zLabel = makeAxisLabelSprite('Z', '#6666ff');
        zLabel.position.set(0, 0, 1.8);
        axisGroup.add(xLabel, yLabel, zLabel);

        Object.assign(sceneRefs, { 
            scene, camera, renderer, controls, raycaster, mouse, transformControls,
            axisScene, axisCamera, axisGroup // Store new axis objects
        });

        const handleResize = () => {
            camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        };
        window.addEventListener('resize', handleResize);

        const animate = () => {
            requestAnimationFrame(animate);
            controls.update();
            
            // --- RENDER MAIN SCENE ---
            renderer.setScissorTest(false);
            renderer.setViewport(0, 0, currentMount.clientWidth, currentMount.clientHeight);
            renderer.render(scene, camera);

            // --- RENDER AXIS HELPER ---
            const { axisScene, axisCamera, axisGroup: ag, scene: mainScene, camera: mainCamera } = sceneRefs;

            // --- REMOVED: The axis camera is now completely static and does not rotate. ---
            // axisCamera.quaternion.copy(mainCamera.quaternion);

            // Find selected object using the ref for the latest ID
            const selectedObject = mainScene.getObjectByProperty('userData.id', selectedShapeIdRef.current);
            
            if (selectedObject) {
                // If an object is selected, the axis bars copy its world rotation.
                selectedObject.getWorldQuaternion(ag.quaternion);
            } else {
                // --- MODIFIED: If nothing is selected, the axis bars show the world orientation
                // from the main camera's perspective by using the camera's inverse rotation.
                ag.quaternion.copy(mainCamera.quaternion).invert();
            }

            // Render the axis scene in the bottom-left corner
            renderer.clearDepth(); // Render on top of the main scene
            
            const axisViewportSize = 150;
            const inset = 10;
            renderer.setScissorTest(true);
            // --- MODIFIED: Calculate coordinates for the top-right corner ---
            renderer.setScissor(
                currentMount.clientWidth - axisViewportSize - inset,
                currentMount.clientHeight - axisViewportSize - inset,
                axisViewportSize,
                axisViewportSize
            );
            renderer.setViewport(
                currentMount.clientWidth - axisViewportSize - inset,
                currentMount.clientHeight - axisViewportSize - inset,
                axisViewportSize,
                axisViewportSize
            );
            
            renderer.render(axisScene, axisCamera);
            renderer.setScissorTest(false); // Disable scissor for the next frame
        };
        animate();

        const handleMouseDown = (event) => {
            event.preventDefault();
            if (transformControls.dragging) return;

            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(scene.children, true);

            const firstIntersected = intersects.find(i => i.object.isMesh && i.object.userData.isCadObject);

            if (firstIntersected) {
                onObjectSelected(firstIntersected.object.userData.id);
            } else {
                onObjectSelected(null);
            }
        };
        renderer.domElement.addEventListener('mousedown', handleMouseDown);
        
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
                case '+': case '=':
                    transformControls.setSize(transformControls.size + 0.1);
                    break;
                case '-': case '_':
                    transformControls.setSize(Math.max(transformControls.size - 0.1, 0.1));
                    break;
                case ' ':
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

        for (let i = scene.children.length - 1; i >= 0; i--) {
            const obj = scene.children[i];
            if (obj.userData.isCadObject) {
                scene.remove(obj);
                obj.geometry.dispose();
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
                color: 0xcccccc, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData.id = meshData.id;
            mesh.userData.isCadObject = true; 
            scene.add(mesh);
        });
        
        const { camera, controls } = sceneRefs;
        const boundingBox = new THREE.Box3();
        
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
            cameraZ *= 1.5;
            
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

        if (transformControls.object) {
            transformControls.detach();
        }

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

        transformControls.visible = hasSelection;

    }, [selectedShapeId, initialMeshes, sceneRefs]);

    return <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />;
}






