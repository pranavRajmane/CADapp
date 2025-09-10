import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { MeshFactory } from '../utils/MeshFactory';
import { createInfiniteGridHelper } from '../utils/InfiniteGridHelper';
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js';

export function Viewport({ initialMeshes, onSceneReady }) {
    const mountRef = useRef(null);
    const sceneObjectsRef = useRef(new Map());
    const infiniteGridRef = useRef(null);
    
    // --- 1. CREATE A REF FOR THE SCENE ---
    const sceneRef = useRef();
    const cameraRef = useRef();
    const controlsRef = useRef();

    const fitCameraToObjects = useCallback((objects) => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!objects || objects.length === 0 || !camera || !controls) return;

        const box = new THREE.Box3();
        for (const object of objects) {
            box.expandByObject(object);
        }

        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
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
        scene.background = new THREE.Color(0x1a1a1a);
        sceneRef.current = scene; // <-- 2. SET THE SCENE REF

        const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 10000);
        camera.position.set(50, 50, 50);
        cameraRef.current = camera; 

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setScissorTest(true);
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        currentMount.appendChild(renderer.domElement);
        
        const controls = new OrbitControls(camera, renderer.domElement);
        controlsRef.current = controls;

        // ... (lighting, grid, and view helper setup remains the same) ...
        const ambientLight = new THREE.AmbientLight(0x404040, 3);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
        directionalLight.position.set(50, 50, 50);
        scene.add(directionalLight);
        const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
        fillLight.position.set(-50, 50, -50);
        scene.add(fillLight);

        const infiniteGrid = createInfiniteGridHelper();
        infiniteGridRef.current = infiniteGrid;
        scene.add(infiniteGrid);
        
        const viewHelper = new ViewHelper(camera, renderer.domElement);
        
        const animate = () => { /* ... animate logic ... */ };
        animate();
        
        if (onSceneReady) onSceneReady({ scene, fitCameraToObjects });

        // ... (resize handler and cleanup)
    }, [onSceneReady, fitCameraToObjects]);

    // Effect for loading new meshes
    useEffect(() => {
        if (!initialMeshes) return;
        
        const scene = sceneRef.current; // <-- 3. GET THE SCENE FROM THE REF
        if(!scene) return;

        // Clear existing meshes
        const toRemove = [];
        scene.children.forEach(child => {
            if (child.userData.isCadObject) {
                toRemove.push(child);
            }
        });
        toRemove.forEach(child => scene.remove(child));
        sceneObjectsRef.current.clear();

        // Add new meshes
        const allAddedMeshes = [];
        if (initialMeshes.length > 0) {
            initialMeshes.forEach(meshData => {
                if (meshData.faces && meshData.faces.length > 0) {
                    meshData.faces.forEach(faceData => {
                        const faceMesh = MeshFactory.createFaceMesh(faceData);
                        if (faceMesh) {
                            faceMesh.userData.isCadObject = true; 
                            scene.add(faceMesh);
                            allAddedMeshes.push(faceMesh);
                        }
                    });
                }
            });
        }
        
        if (allAddedMeshes.length > 0) {
            fitCameraToObjects(allAddedMeshes);
        }
    }, [initialMeshes, fitCameraToObjects]);

    return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
}