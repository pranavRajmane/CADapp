import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

export function Viewport({ initialMeshes, onObjectSelected, onFaceSelected, selectedShapeId, selectedFaceIds, recognizedShape }) {
    const mountRef = useRef(null);
    // CORRECTED: Initialize the ref object itself, not its .current property.
    const sceneRefs = useRef({});

    const selectedShapeIdRef = useRef(selectedShapeId);
    useEffect(() => {
        selectedShapeIdRef.current = selectedShapeId;
    }, [selectedShapeId]);

    const selectedFaceIdsRef = useRef(selectedFaceIds);
    useEffect(() => {
        selectedFaceIdsRef.current = selectedFaceIds;
    }, [selectedFaceIds]);

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

        const recognizedShapeHelper = null; // We'll manage this mesh directly

        // CORRECTED: Assign properties to the .current object.
        sceneRefs.current = { 
            scene, camera, renderer, controls, raycaster, mouse, transformControls,
            recognizedShapeHelper
        };

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

        const handleMainMouseDown = (event) => {
            event.preventDefault();
            if (transformControls.dragging) return;
        
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(scene.children, true);
            const firstIntersected = intersects.find(i => i.object.isMesh && i.object.userData.isCadObject);
        
            if (firstIntersected) {
                const objectId = firstIntersected.object.userData.id;
                if (objectId !== selectedShapeIdRef.current) {
                    onObjectSelected(objectId);
                } else {
                    const faceIndex = firstIntersected.faceIndex;
                    const faceId = firstIntersected.object.userData.faceIdByTriangle[faceIndex];
                    onFaceSelected(faceId); 
                }
            } else {
                onObjectSelected(null);
            }
        };
        renderer.domElement.addEventListener('mousedown', handleMainMouseDown);

        const handleKeyDown = (event) => {
            switch (event.key) {
                case 'q': transformControls.setSpace(transformControls.space === 'local' ? 'world' : 'local'); break;
                case 'w': transformControls.setMode('translate'); break;
                case 'e': transformControls.setMode('rotate'); break;
                case 'r': transformControls.setMode('scale'); break;
                case ' ': transformControls.enabled = !transformControls.enabled; break;
                case 'Escape': transformControls.reset(); break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('keydown', handleKeyDown);
            renderer.domElement.removeEventListener('mousedown', handleMainMouseDown);
            transformControls.dispose();
            if(renderer.domElement.parentElement) {
                renderer.domElement.parentElement.removeChild(renderer.domElement);
            }
        };
    }, []);

    useEffect(() => {
        // CORRECTED: Access scene via .current and check if it's initialized
        if (!sceneRefs.current.scene || !initialMeshes) return;
        const { scene } = sceneRefs.current;

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

            const colors = new Float32Array(vertices.length);
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

            const material = new THREE.MeshStandardMaterial({
                metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide, vertexColors: true
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData.id = meshData.id;
            mesh.userData.isCadObject = true;
            mesh.userData.facesData = meshData.faces;
            mesh.userData.faceIdByTriangle = meshData.faceIdByTriangle;
            scene.add(mesh);
        });
    // CORRECTED: Removed sceneRefs from dependencies
    }, [initialMeshes]);

    useEffect(() => {
        if (!sceneRefs.current.scene) return;
        const { scene, transformControls } = sceneRefs.current;
    
        const baseColor = new THREE.Color(0xcccccc);
        const selectionColor = new THREE.Color(0xffff00); 
        const faceHighlightColor = new THREE.Color(0x00aaff); 
    
        scene.children.forEach(child => {
            if (child.isMesh && child.userData.isCadObject && child.geometry.attributes.color) {
                const isSelectedObject = child.userData.id === selectedShapeId;
                const colorAttribute = child.geometry.attributes.color;
                const currentColor = isSelectedObject ? selectionColor : baseColor;
    
                for (let i = 0; i < colorAttribute.count; i++) {
                    colorAttribute.setXYZ(i, currentColor.r, currentColor.g, currentColor.b);
                }
    
                if (isSelectedObject && selectedFaceIds && selectedFaceIds.length > 0 && child.userData.facesData) {
                    const faceInfoMap = new Map();
                    let vertexOffset = 0;
                    for(const f of child.userData.facesData) {
                        faceInfoMap.set(f.id, { offset: vertexOffset, count: f.vertexCount });
                        vertexOffset += f.vertexCount;
                    }
                    selectedFaceIds.forEach(faceId => {
                        const faceInfo = faceInfoMap.get(faceId);
                        if (faceInfo) {
                            for (let i = 0; i < faceInfo.count; i++) {
                                colorAttribute.setXYZ(faceInfo.offset + i, faceHighlightColor.r, faceHighlightColor.g, faceHighlightColor.b);
                            }
                        }
                    });
                }
    
                colorAttribute.needsUpdate = true;
    
                if (!isSelectedObject && transformControls.object === child) {
                    transformControls.detach();
                } else if (isSelectedObject) {
                    transformControls.attach(child);
                }
            }
        });
    
        transformControls.visible = !!selectedShapeId;
    // CORRECTED: Removed sceneRefs from dependencies
    }, [selectedShapeId, selectedFaceIds, initialMeshes]);

    useEffect(() => {
        if (!sceneRefs.current.scene) return;
        const refs = sceneRefs.current;

        if (refs.recognizedShapeHelper) {
            refs.scene.remove(refs.recognizedShapeHelper);
            refs.recognizedShapeHelper.geometry.dispose();
            refs.recognizedShapeHelper.material.dispose();
            refs.recognizedShapeHelper = null;
        }

        if (recognizedShape && recognizedShape.success && recognizedShape.shape === 'Cylinder') {
            const { radius, height, center, axis } = recognizedShape;

            const geometry = new THREE.CylinderGeometry(radius, radius, height, 32, 1, false);
            const material = new THREE.MeshStandardMaterial({
                color: 0x00ff00, transparent: true, opacity: 0.5, metalness: 0.2, roughness: 0.6,
            });
            const mesh = new THREE.Mesh(geometry, material);

            const defaultUp = new THREE.Vector3(0, 1, 0);
            const cylinderAxis = new THREE.Vector3().fromArray(axis).normalize();
            const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultUp, cylinderAxis);
            mesh.quaternion.copy(quaternion);
            mesh.position.fromArray(center);

            refs.scene.add(mesh);
            refs.recognizedShapeHelper = mesh;
        }
    // CORRECTED: Removed sceneRefs from dependencies
    }, [recognizedShape]);

    return <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />;
}