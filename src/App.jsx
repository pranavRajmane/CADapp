import React, { useState, useCallback, useEffect } from 'react'; // Import useEffect
import { UploadPage } from './components/UploadPage';
import { Viewport } from './components/Viewport';
import { ApiHandler } from './services/ApiHandler';
import { TransformControls } from './components/TransformControls';

function App() {
    const [view, setView] = useState('upload');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [meshes, setMeshes] = useState([]);
    const [selectedShapeId, setSelectedShapeId] = useState(null);
    const [selectedFaceIds, setSelectedFaceIds] = useState([]);
    const [isTransformModeActive, setIsTransformModeActive] = useState(false);
    // --- NEW STATE for recognized shape ---
    const [recognizedShape, setRecognizedShape] = useState(null);

    // --- NEW: Handler for shape recognition logic ---
    const runShapeRecognition = async () => {
        if (!selectedShapeId || selectedFaceIds.length === 0) {
            // Silently return if nothing is selected to recognize
            return;
        }

        console.log(`Recognizing shape from ${selectedFaceIds.length} faces...`);
        setIsLoading(true);
        setRecognizedShape(null); // Clear previous recognition

        try {
            const selectedMesh = meshes.find(m => m.id === selectedShapeId);
            if (!selectedMesh) return;

            // Aggregate vertices from all selected faces
            const pointCloud = [];
            const selectedFacesData = selectedMesh.faces.filter(f => selectedFaceIds.includes(f.id));
            
            for (const face of selectedFacesData) {
                // The vertices are already flat [x1, y1, z1, x2, y2, z2, ...]
                pointCloud.push(...face.vertices.flat());
            }

            const result = await ApiHandler.recognizeShapeFromPoints(pointCloud);
            
            if (result.success) {
                console.log("Recognition successful:", result);
                setRecognizedShape(result);
            } else {
                throw new Error(result.error || "Recognition failed.");
            }

        } catch (error) {
            alert(`Could not recognize shape: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    // --- NEW: Effect to listen for the Enter key ---
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Enter' && view === 'viewport') {
                runShapeRecognition();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
        // Dependency array includes all variables used inside the effect
    }, [view, selectedShapeId, selectedFaceIds, meshes]);


    const handleFileProcessing = async (file) => {
        setIsLoading(true);
        setErrorMessage('');
        setRecognizedShape(null); // Clear on new file
        try {
            const result = await ApiHandler.processStepFile(file);
            if (result.success) {
                setMeshes(result.data.meshes);
                setView('viewport');
            } else {
                throw new Error(result.error || 'Processing failed');
            }
        } catch (error) {
            setErrorMessage(error.message);
            setView('upload');
        } finally {
            setIsLoading(false);
        }
    };

    const handleStartEmpty = () => {
        setMeshes([]);
        setRecognizedShape(null);
        setView('viewport');
    };

    const handleBackToUpload = () => {
        setMeshes([]);
        setSelectedShapeId(null);
        setSelectedFaceIds([]);
        setIsTransformModeActive(false);
        setRecognizedShape(null);
        setView('upload');
    };

    const handleClearScene = () => {
        setMeshes([]);
        setSelectedShapeId(null);
        setSelectedFaceIds([]);
        setIsTransformModeActive(false);
        setRecognizedShape(null);
    };
    
    // When selecting a new object, clear the recognized shape
    const handleObjectSelected = useCallback((shapeId) => {
        setSelectedShapeId(shapeId);
        setSelectedFaceIds([]);
        setRecognizedShape(null);
    }, []);

    const handleFaceSelected = useCallback((faceId) => {
        setRecognizedShape(null); // Clear recognition if selection changes
        setSelectedFaceIds(prevIds => {
            if (prevIds.includes(faceId)) {
                return prevIds.filter(id => id !== faceId);
            } else {
                return [...prevIds, faceId];
            }
        });
    }, []);
    
    // ... (createBox, createCylinder handlers remain the same) ...
    const handleCreateBox = async () => {
        try {
            const result = await ApiHandler.createBox({ width: 20, height: 15, depth: 10 });
            if (result.success) {
                setMeshes(prev => [...prev, result.mesh]);
            }
        } catch (error) {
            alert(`Error creating box: ${error.message}`);
        }
    };

    const handleCreateCylinder = async () => {
        try {
            const result = await ApiHandler.createCylinder({ radius: 8, height: 25 });
            if (result.success) {
                setMeshes(prev => [...prev, result.mesh]);
            }
        } catch (error) {
            alert(`Error creating cylinder: ${error.message}`);
        }
    };


    if (view === 'upload') {
        return (
            <div>
                <UploadPage onFileProcessed={handleFileProcessing} onStartEmpty={handleStartEmpty} />
                {isLoading && (
                    <div className="loading">
                        <div className="spinner"></div>
                        <div className="loading-text">Processing your CAD file...</div>
                    </div>
                )}
                {errorMessage && <div className="message error">{errorMessage}</div>}
            </div>
        );
    }

    return (
        <div className="viewport-container">
            <div className="back-controls">
                <button className="back-button-viewport" onClick={handleBackToUpload}>
                    ← Back to Upload
                </button>
            </div>
             {/* Add a small info box about the new feature */}
            <div className="recognition-info-panel">
                <p><b>Multi-select faces</b> and press <b>Enter</b> to recognize the shape.</p>
            </div>
            <div className="viewport-top-toolbar">
                 <button 
                    className={`tool-button ${isTransformModeActive ? 'active' : ''}`} 
                    title="Toggle Transform Mode" 
                    onClick={() => setIsTransformModeActive(!isTransformModeActive)}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                </button>
                <button className="tool-button" title="Create Box" onClick={handleCreateBox}>📦</button>
                {/* Add cylinder emoji button */}
                <button className="tool-button" title="Create Cylinder" onClick={handleCreateCylinder}>⚪</button>
                <button className="tool-button" title="Clear Scene" onClick={handleClearScene}>🗑️</button>
            </div>
            <TransformControls 
                isTransformModeActive={isTransformModeActive}
                selectedShapeId={selectedShapeId}
            />
            <Viewport
                initialMeshes={meshes}
                onObjectSelected={handleObjectSelected}
                onFaceSelected={handleFaceSelected}
                selectedShapeId={selectedShapeId}
                selectedFaceIds={selectedFaceIds}
                isTransformModeActive={isTransformModeActive}
                recognizedShape={recognizedShape} /* Pass down the new prop */
            />
             {isLoading && (
                <div className="loading-overlay">
                    <div className="spinner"></div>
                    <div className="loading-text">Recognizing Shape...</div>
                </div>
            )}
        </div>
    );
}

export default App;