// Handles all API calls to the Python Flask backend.
export const ApiHandler = {
    async processStepFile(file) {
        const formData = new FormData();
        formData.append('stepFile', file);

        // IMPORTANT: Replace with your backend server's URL
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
        // IMPORTANT: Replace with your backend server's URL
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