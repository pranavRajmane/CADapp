import React, { useState, useCallback } from 'react';
import { UploadPage } from './components/UploadPage';
import { Viewport } from './components/Viewport';
import { ApiHandler } from './services/ApiHandler';

function App() {
    const [view, setView] = useState('upload'); // 'upload' or 'viewport'
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [meshes, setMeshes] = useState([]);
    const [sceneApi, setSceneApi] = useState(null); // To control the scene from the App

    const handleFileProcessing = async (file) => {
        setIsLoading(true);
        setErrorMessage('');
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
        setMeshes([]); // Ensure scene is empty
        setView('viewport');
    };

    const handleBackToUpload = () => {
        setMeshes([]);
        setView('upload');
    };

    const handleClearScene = () => {
        setMeshes([]); // Setting meshes to empty array will trigger the cleanup effect in Viewport
    };

    const handleCreateBox = async () => {
        try {
            const result = await ApiHandler.createBox({ width: 20, height: 15, depth: 10 });
            if (result.success) {
                // Add new box mesh data to existing meshes
                const newMeshes = [...meshes, result.mesh];
                setMeshes(newMeshes);
            }
        } catch (error) {
            alert(`Error creating box: ${error.message}`);
        }
    };

    // Callback to get scene control functions from the Viewport component
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
            <div className="viewport-toolbar">
                <button className="tool-button" title="Create Box" onClick={handleCreateBox}>📦</button>
                <button className="tool-button" title="Clear Scene" onClick={handleClearScene}>🗑️</button>
            </div>
            <Viewport initialMeshes={meshes} onSceneReady={onSceneReady} />
        </div>
    );
}

export default App;