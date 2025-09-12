import React, { useState, useEffect } from 'react';

export function TransformControls({ selectedShapeId, onTransform }) {
    const [translation, setTranslation] = useState({ x: 0, y: 0, z: 0 });
    const [rotation, setRotation] = useState({ axis: 'z', angle: 0 });

    // Reset inputs when selection changes
    useEffect(() => {
        setTranslation({ x: 0, y: 0, z: 0 });
        setRotation({ axis: 'z', angle: 0 });
    }, [selectedShapeId]);

    if (!selectedShapeId) {
        return null; // Don't render if nothing is selected
    }

    const handleApply = () => {
        const transformPayload = {};

        // Only include non-zero transformations
        const transX = parseFloat(translation.x) || 0;
        const transY = parseFloat(translation.y) || 0;
        const transZ = parseFloat(translation.z) || 0;
        if (transX !== 0 || transY !== 0 || transZ !== 0) {
            transformPayload.translation = { x: transX, y: transY, z: transZ };
        }

        const rotAngle = parseFloat(rotation.angle) || 0;
        if (rotAngle !== 0) {
            let axisVector = [0, 0, 1];
            if (rotation.axis === 'x') axisVector = [1, 0, 0];
            if (rotation.axis === 'y') axisVector = [0, 1, 0];
            transformPayload.rotation = {
                axis: axisVector,
                angle: rotAngle,
            };
        }

        if (Object.keys(transformPayload).length > 0) {
            onTransform(selectedShapeId, transformPayload);
        }
    };

    return (
        <div className="transform-controls">
            <h4>Transform Shape: {selectedShapeId.substring(0, 8)}...</h4>
            <div className="control-group">
                <label>Displacement (Translate)</label>
                <div className="input-row">
                    <span>X:</span>
                    <input type="number" value={translation.x} onChange={e => setTranslation({ ...translation, x: e.target.value })} />
                    <span>Y:</span>
                    <input type="number" value={translation.y} onChange={e => setTranslation({ ...translation, y: e.target.value })} />
                    <span>Z:</span>
                    <input type="number" value={translation.z} onChange={e => setTranslation({ ...translation, z: e.target.value })} />
                </div>
            </div>
            <div className="control-group">
                <label>Rotation</label>
                 <div className="input-row">
                    <span>Angle (°):</span>
                    <input type="number" value={rotation.angle} onChange={e => setRotation({ ...rotation, angle: e.target.value })}/>
                    <span>Axis:</span>
                    <select value={rotation.axis} onChange={e => setRotation({ ...rotation, axis: e.target.value })}>
                        <option value="x">X</option>
                        <option value="y">Y</option>
                        <option value="z">Z</option>
                    </select>
                 </div>
            </div>
            <button onClick={handleApply}>Apply</button>
        </div>
    );
}