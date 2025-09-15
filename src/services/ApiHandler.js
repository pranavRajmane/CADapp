// Handles all API calls to the Python Flask backend.
export const ApiHandler = {
    async processStepFile(file) {
        const formData = new FormData();
        formData.append('stepFile', file);

        const response = await fetch('http://localhost:3000/process-step', {
            method: 'POST',
            body: formData,
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.details || 'Failed to process file');
        }
        return response.json();
    },

    async createBox(params) {
        const response = await fetch('http://localhost:3000/api/create/box', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create box');
        }
        return response.json();
    },

    async createCylinder(params) {
        const response = await fetch('http://localhost:3000/api/create/cylinder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create cylinder');
        }
        return response.json();
    },

    // --- NEW FUNCTION for RANSAC ---
    async recognizeShapeFromPoints(points) {
        const response = await fetch('http://localhost:3000/api/recognize-shape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points }),
        });
        // The response might be a 500 if RANSAC fails, so we need to handle it
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Shape recognition failed on the server.');
        }
        return result;
    },
    // --- END NEW FUNCTION ---

    async transformShape(shapeId, transformation) {
        const response = await fetch(`http://localhost:3000/api/transform/${shapeId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transformation),
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to transform shape');
        }
        return response.json();
    },
};