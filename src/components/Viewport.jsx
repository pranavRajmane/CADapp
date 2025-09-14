import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

// --- TWEENING HELPER ---
// Simple linear interpolation function
function lerp(start, end, alpha) {
    return start * (1 - alpha) + end * alpha;
}

export function Viewport({ initialMeshes, onObjectSelected, selectedShapeId }) {
    const mountRef = useRef(null);
    const sceneRefs = useRef({}).current;
    
    const selectedShapeIdRef = useRef(selectedShapeId);
    useEffect(() => {
        selectedShapeIdRef.current = selectedShapeId;
    }, [selectedShapeId]);

    // --- Main setup effect, runs only once ---
    useEffect(() => {
        const currentMount = mountRef.current;
        const scene = new THREE.Scene();
        const backgroundColor = new THREE.Color(0x1a1a1a);
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
        
        const transformControls = new TransformControls(camera, renderer.domElement);
        transformControls.addEventListener('dragging-changed', (event) => {
            controls.enabled = !event.value;
        });
        scene.add(transformControls);

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        // --- AXIS & CUBE SCENE SETUP (They share a scene) ---
        const overlayScene = new THREE.Scene();
        overlayScene.background = backgroundColor;
        const frustumSize = 4.5;
        const aspect = 1;
        const overlayCamera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2, frustumSize * aspect / 2,
            frustumSize / 2, frustumSize / -2, 0.1, 100
        );
        overlayCamera.position.set(5, 5, 5);
        overlayCamera.lookAt(0, 0, 0);

        // --- REFERENCE AXIS SETUP ---
        const axisGroup = new THREE.Group();
        overlayScene.add(axisGroup);
        
        const origin = new THREE.Vector3(0, 0, 0);
        const length = 1.5;
        axisGroup.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, length, 0xff0000));
        axisGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, length, 0x00ff00));
        axisGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), origin, length, 0x0000ff));

        // --- VIEW CUBE SETUP ---
        function makeViewLabelCanvas(text) {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const size = 128;
            canvas.width = size;
            canvas.height = size;
            context.fillStyle = 'rgba(40, 40, 40, 0.9)';
            context.fillRect(0, 0, size, size);
            context.font = `bold 48px Arial`;
            context.fillStyle = '#ffffff';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(text, size / 2, size / 2);
            return canvas;
        }

        const cubeMaterials = [
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(makeViewLabelCanvas('RIGHT')) }), // +X
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(makeViewLabelCanvas('LEFT')) }),  // -X
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(makeViewLabelCanvas('TOP')) }),   // +Y
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(makeViewLabelCanvas('BOTTOM')) }),// -Y
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(makeViewLabelCanvas('FRONT')) }), // +Z
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(makeViewLabelCanvas('BACK')) })   // -Z
        ];
        const cubeGeometry = new THREE.BoxGeometry(2, 2, 2);
        const viewCube = new THREE.Mesh(cubeGeometry, cubeMaterials);
        viewCube.position.set(0, 0, 0);
        overlayScene.add(viewCube);
        
        let transitionTarget = null; 

        Object.assign(sceneRefs, { 
            scene, camera, renderer, controls, raycaster, mouse, transformControls,
            overlayScene, overlayCamera, axisGroup, viewCube, transitionTarget
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

            if (sceneRefs.transitionTarget) {
                const { pos, target } = sceneRefs.transitionTarget;
                camera.position.lerp(pos, 0.1);
                controls.target.lerp(target, 0.1);
                if (camera.position.distanceTo(pos) < 0.1) {
                    sceneRefs.transitionTarget = null;
                }
            }
            
            renderer.setScissorTest(false);
            renderer.setViewport(0, 0, currentMount.clientWidth, currentMount.clientHeight);
            renderer.render(scene, camera);

            const { overlayScene, overlayCamera, axisGroup: ag, scene: mainScene, camera: mainCamera, viewCube: vc } = sceneRefs;
            const selectedObject = mainScene.getObjectByProperty('userData.id', selectedShapeIdRef.current);
            
            const inverseQuaternion = mainCamera.quaternion.clone().invert();
            if (selectedObject) {
                selectedObject.getWorldQuaternion(ag.quaternion);
            } else {
                ag.quaternion.copy(inverseQuaternion);
            }
            vc.quaternion.copy(inverseQuaternion);

            renderer.clearDepth();
            renderer.setScissorTest(true);

            const viewportSize = 120;
            const inset = 10;
            
            // --- RENDER REF AXIS (TOP-RIGHT) ---
            vc.visible = false;
            ag.visible = true;
            const axisVpX = currentMount.clientWidth - viewportSize - inset;
            const axisVpY = currentMount.clientHeight - viewportSize - inset;
            renderer.setScissor(axisVpX, axisVpY, viewportSize, viewportSize);
            renderer.setViewport(axisVpX, axisVpY, viewportSize, viewportSize);
            renderer.render(overlayScene, overlayCamera);

            // --- RENDER VIEW CUBE (BOTTOM-RIGHT) ---
            vc.visible = true;
            ag.visible = false;
            const cubeVpX = currentMount.clientWidth - viewportSize - inset;
            const cubeVpY = inset;
            renderer.setScissor(cubeVpX, cubeVpY, viewportSize, viewportSize);
            renderer.setViewport(cubeVpX, cubeVpY, viewportSize, viewportSize);
            renderer.render(overlayScene, overlayCamera);

            renderer.setScissorTest(false);
        };
        animate();

        const handleMainMouseDown = (event) => {
            event.preventDefault();
            if (transformControls.dragging) return;
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(scene.children, true);
            const firstIntersected = intersects.find(i => i.object.isMesh && i.object.userData.isCadObject);
            onObjectSelected(firstIntersected ? firstIntersected.object.userData.id : null);
        };

        const handleViewCubeMouseDown = (event) => {
            const viewportSize = 120;
            const inset = 10;
            const vpX = currentMount.clientWidth - viewportSize - inset;
            const vpY_fromTop = currentMount.clientHeight - viewportSize - inset;
            
            const relativeX = event.clientX - vpX;
            const relativeY = event.clientY - vpY_fromTop;

            const cubeMouse = new THREE.Vector2();
            cubeMouse.x = (relativeX / viewportSize) * 2 - 1;
            cubeMouse.y = -(relativeY / viewportSize) * 2 + 1;

            const cubeRaycaster = new THREE.Raycaster();
            cubeRaycaster.setFromCamera(cubeMouse, overlayCamera);
            const intersects = cubeRaycaster.intersectObject(sceneRefs.viewCube);

            if (intersects.length > 0) {
                const faceIndex = intersects[0].face.materialIndex;
                const viewMap = ['right', 'left', 'top', 'bottom', 'front', 'back'];
                setCameraView(viewMap[faceIndex]);
            }
        };
        
        const setCameraView = (view) => {
            const boundingBox = new THREE.Box3();
            scene.children.forEach(child => {
                if (child.userData.isCadObject) boundingBox.expandByObject(child);
            });
            
            const center = new THREE.Vector3();
            boundingBox.getCenter(center);

            if (boundingBox.isEmpty()) {
                // If scene is empty, focus on the origin
                center.set(0,0,0);
            }

            const size = new THREE.Vector3();
            boundingBox.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            // Use a default distance if the scene is empty, otherwise calculate
            const distance = boundingBox.isEmpty() ? 100 : maxDim * 1.5;

            const newPos = new THREE.Vector3();
            switch(view) {
                case 'top': newPos.set(center.x, center.y + distance, center.z); break;
                case 'bottom': newPos.set(center.x, center.y - distance, center.z); break;
                case 'left': newPos.set(center.x - distance, center.y, center.z); break;
                case 'right': newPos.set(center.x + distance, center.y, center.z); break;
                case 'front': newPos.set(center.x, center.y, center.z + distance); break;
                case 'back': newPos.set(center.x, center.y, center.z - distance); break;
            }
            
            sceneRefs.transitionTarget = { pos: newPos, target: center };
        };

        const handleMouseDown = (event) => {
            const viewportSize = 120;
            const inset = 10;
            
            const cubeVpX = currentMount.clientWidth - viewportSize - inset;
            const cubeVpY_fromTop = currentMount.clientHeight - viewportSize - inset; 
            
            if (event.clientX >= cubeVpX && event.clientY >= cubeVpY_fromTop) {
                 handleViewCubeMouseDown(event);
            } else {
                 handleMainMouseDown(event);
            }
        };

        renderer.domElement.addEventListener('mousedown', handleMouseDown);
        
        const handleKeyDown = (event) => {
            switch (event.key) {
                case 'q': transformControls.setSpace(transformControls.space === 'local' ? 'world' : 'local'); break;
                case 'w': transformControls.setMode('translate'); break;
                case 'e': transformControls.setMode('rotate'); break;
                case 'r': transformControls.setMode('scale'); break;
                case '+': case '=': transformControls.setSize(transformControls.size + 0.1); break;
                case '-': case '_': transformControls.setSize(Math.max(transformControls.size - 0.1, 0.1)); break;
                case ' ': transformControls.enabled = !transformControls.enabled; break;
                case 'Escape': transformControls.reset(); break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('keydown', handleKeyDown);
            renderer.domElement.removeEventListener('mousedown', handleMouseDown);
            transformControls.dispose();
            if(renderer.domElement.parentElement) {
                renderer.domElement.parentElement.removeChild(renderer.domElement);
            }
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

        if (initialMeshes.length === 0) {
            const { camera, controls } = sceneRefs;
            controls.target.set(0,0,0);
            camera.position.set(50,50,50);
            controls.update();
            return;
        };

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

        if (!boundingBox.isEmpty()) {
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

