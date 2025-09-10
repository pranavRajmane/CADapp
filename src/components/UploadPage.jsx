import React, { useState, useRef } from 'react';

export function UploadPage({ onFileProcessed, onStartEmpty }) {
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef(null);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files.length) {
            onFileProcessed(e.dataTransfer.files[0]);
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files.length) {
            onFileProcessed(e.target.files[0]);
        }
    };

    return (
        <div className="upload-page">
            <div className="upload-hero">
                <h1>Hi! I am Ayrton</h1>
                <p>Your simulation assistant</p>
                <p className="subtitle">Upload your STEP or IGES files to visualize in 3D</p>
            </div>

            <div className="upload-container">
                <div
                    id="uploadArea"
                    className={`upload-area ${isDragOver ? 'dragover' : ''}`}
                    onClick={() => fileInputRef.current.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <div className="upload-icon">📁</div>
                    <div className="upload-text">Drop your CAD file here</div>
                    <div className="upload-hint">or click to browse files</div>
                    <div className="supported-formats">
                        <span className="format-badge">STEP</span>
                        <span className="format-badge">STP</span>
                        <span className="format-badge">IGES</span>
                        <span className="format-badge">IGS</span>
                    </div>
                </div>
                <input
                    type="file"
                    id="fileInput"
                    ref={fileInputRef}
                    accept=".step,.stp,.iges,.igs"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                />

                <button id="emptyCanvasBtn" className="canvas-button" onClick={onStartEmpty}>
                    Start with an Empty Canvas
                </button>
            </div>
        </div>
    );
}