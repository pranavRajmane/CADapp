import React from 'react';

// This component now serves as an informational panel for transform hotkeys.
export function TransformControls({ isTransformModeActive, selectedShapeId }) {
    
    // Only show the panel if transform mode is active and an object is selected.
    if (!isTransformModeActive || !selectedShapeId) {
        return null;
    }

    return (
        <div className="transform-info-panel">
            <h4>Transform Controls</h4>
            <p><b>Object:</b> {selectedShapeId.substring(0, 8)}...</p>
            <div className="info-grid">
                <span>Translate</span><span>W</span>
                <span>Rotate</span><span>E</span>
                <span>Scale</span><span>R</span>
                <span>World/Local</span><span>Q</span>
                <span>Toggle Gizmo</span><span>Space</span>
                <span>Reset</span><span>Esc</span>
            </div>
        </div>
    );
}

