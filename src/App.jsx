import React, { useState, useCallback } from 'react';
import { UploadPage } from './components/UploadPage';
import { Viewport } from './components/Viewport';
import { ApiHandler } from './services/ApiHandler';
import { TransformControls } from './components/TransformControls';

function App() {
    const [view, setView] = useState('upload'); // 'upload' or 'viewport'
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [meshes, setMeshes] = useState([]);
    const [sceneApi, setSceneApi] = useState(null); // To control the scene from the App
    const [selectedShapeId, setSelectedShapeId] = useState(null);
    const [isTransformModeActive, setIsTransformModeActive] = useState(false);

    const handleFileProcessing = async (file) => {
        setIsLoading(true);
        setErrorMessage('');
        try {
            const result = await ApiHandler.processStepFile(file);
            
            console.log("--- App.jsx: Received from /process-step ---");
            console.log(JSON.stringify(result, null, 2));
            
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
        setMeshes([]); // Ensure scene is empty
        setView('viewport');
    };

    const handleBackToUpload = () => {
        setMeshes([]);
        setSelectedShapeId(null);
        setIsTransformModeActive(false); // Reset transform mode
        setView('upload');
    };

    const handleClearScene = () => {
        setMeshes([]); // Setting meshes to empty array will trigger the cleanup effect in Viewport
        setSelectedShapeId(null);
        setIsTransformModeActive(false); // Reset transform mode
    };

    const handleCreateBox = async () => {
        try {
            const result = await ApiHandler.createBox({ width: 20, height: 15, depth: 10 });

            console.log("--- App.jsx: Received from /api/create/box ---");
            console.log(JSON.stringify(result, null, 2));

            if (result.success) {
                // Add new box mesh data to existing meshes
                const newMeshes = [...meshes, result.mesh];
                setMeshes(newMeshes);
            }
        } catch (error) {
            alert(`Error creating box: ${error.message}`);
        }
    };

    const handleObjectSelected = useCallback((shapeId) => {
        setSelectedShapeId(shapeId);
    }, []);

    const onSceneReady = useCallback((api) => {
        setSceneApi(api);
    }, []);

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
            {/* --- MODIFIED: Main toolbar at the top --- */}
            <div className="viewport-top-toolbar">
                 <button 
                    className={`tool-button ${isTransformModeActive ? 'active' : ''}`} 
                    title="Toggle Transform Mode" 
                    onClick={() => setIsTransformModeActive(!isTransformModeActive)}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                </button>
                <button className="tool-button" title="Create Box" onClick={handleCreateBox}>📦</button>
                <button className="tool-button" title="Clear Scene" onClick={handleClearScene}>🗑️</button>
            </div>
            <TransformControls 
                isTransformModeActive={isTransformModeActive}
                selectedShapeId={selectedShapeId}
            />
            <Viewport
                initialMeshes={meshes}
                onSceneReady={onSceneReady}
                onObjectSelected={handleObjectSelected}
                selectedShapeId={selectedShapeId}
                isTransformModeActive={isTransformModeActive} // Pass mode state down
            />
        </div>
    );
}

export default App;

