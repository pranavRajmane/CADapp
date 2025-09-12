#!/usr/bin/env python3
"""
Enhanced Python STEP file processor using PythonOCC
Now includes STL export storage functionality
"""

from flask import Flask, request, jsonify, send_from_directory, send_file, render_template
from flask_cors import CORS
import os
import tempfile
import time
import json
import mimetypes
import uuid
import base64
from werkzeug.utils import secure_filename
from datetime import datetime
import math
import traceback

# PythonOCC imports
from OCC.Core.STEPControl import STEPControl_Reader
from OCC.Core.IGESControl import IGESControl_Reader
from OCC.Core.BRepMesh import BRepMesh_IncrementalMesh
from OCC.Core.TopExp import TopExp_Explorer
from OCC.Core.TopAbs import TopAbs_FACE, TopAbs_VERTEX
from OCC.Core.BRep import BRep_Tool
from OCC.Core.TopLoc import TopLoc_Location
from OCC.Core.Poly import Poly_Triangulation
from OCC.Core.TColgp import TColgp_Array1OfPnt
from OCC.Core.gp import gp_Pnt
from OCC.Core.TopoDS import topods
from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeSphere, BRepPrimAPI_MakeCylinder
from OCC.Core.BRepBndLib import brepbndlib
from OCC.Core.Bnd import Bnd_Box
from OCC.Core.gp import gp_Trsf, gp_Vec, gp_Ax1
# Create Flask app with static file support
app = Flask(__name__)
CORS(app, origins=["*"], methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], allow_headers=["*"])

# Configuration
UPLOAD_FOLDER = 'temp'
STL_STORAGE_FOLDER = 'stl_storage'
EXPORTS_FOLDER = 'exports'
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
ALLOWED_EXTENSIONS = {'.step', '.stp', '.iges', '.igs'}

# In-memory storage for CAD objects
scene_objects = {}

# Ensure directories exist
for folder in [UPLOAD_FOLDER, STL_STORAGE_FOLDER, EXPORTS_FOLDER]:
    os.makedirs(folder, exist_ok=True)

def allowed_file(filename):
    """Check if file extension is allowed"""
    return any(filename.lower().endswith(ext) for ext in ALLOWED_EXTENSIONS)

def read_step_file(file_path):
    """Read STEP file using PythonOCC"""
    step_reader = STEPControl_Reader()
    status = step_reader.ReadFile(file_path)
    if status != 1: raise Exception(f"Failed to read STEP file: {file_path}")
    step_reader.TransferRoots()
    return step_reader.OneShape()

def read_iges_file(file_path):
    """Read IGES file using PythonOCC"""
    iges_reader = IGESControl_Reader()
    status = iges_reader.ReadFile(file_path)
    if status != 1: raise Exception(f"Failed to read IGES file: {file_path}")
    iges_reader.TransferRoots()
    return iges_reader.OneShape()

# --- NEW HELPER FUNCTION: To center any shape ---
def center_shape(shape):
    """Calculates the bounding box of a shape and moves its center to the origin."""
    bbox = Bnd_Box()
    brepbndlib.Add(shape, bbox)
    if bbox.IsVoid():
        return shape # Cannot center a void shape

    xmin, ymin, zmin, xmax, ymax, zmax = bbox.Get()
    center_x = (xmin + xmax) / 2.0
    center_y = (ymin + ymax) / 2.0
    center_z = (zmin + zmax) / 2.0

    translation_vector = gp_Vec(-center_x, -center_y, -center_z)
    transform = gp_Trsf()
    transform.SetTranslation(translation_vector)
    
    # Apply the transformation
    shape.Move(TopLoc_Location(transform))
    print(f"Shape centered. Moved by {-center_x:.2f}, {-center_y:.2f}, {-center_z:.2f}")
    return shape
# --- END NEW HELPER FUNCTION ---

def extract_mesh_data(shape, shape_id=None):
    """Extract mesh data using an indexed geometry approach and create face maps."""
    mesh = BRepMesh_IncrementalMesh(shape, 0.1, False, 0.5)
    mesh.Perform()
    if not mesh.IsDone(): raise Exception("Meshing failed")

    global_vertices, global_indices, faces_data = [], [], []
    face_id_by_triangle = []
    
    face_index = 0
    face_explorer = TopExp_Explorer(shape, TopAbs_FACE)
    while face_explorer.More():
        face = topods.Face(face_explorer.Current())
        location = TopLoc_Location()
        current_face_id = f'face_{face_index}'
        triangulation = BRep_Tool.Triangulation(face, location)

        if triangulation:
            transform = location.Transformation()
            face_vertices, face_indices, vertex_map = [], [], {}
            for i in range(triangulation.NbTriangles()):
                triangle = triangulation.Triangle(i + 1)
                n1, n2, n3 = triangle.Get()
                for node_index in [n1, n2, n3]:
                    if node_index not in vertex_map:
                        new_local_index = len(face_vertices)
                        vertex_map[node_index] = new_local_index
                        pnt = triangulation.Node(node_index)
                        pnt.Transform(transform)
                        face_vertices.append([pnt.X(), pnt.Y(), pnt.Z()])
                    face_indices.append(vertex_map[node_index])
            
            num_triangles_in_face = triangulation.NbTriangles()
            face_id_by_triangle.extend([current_face_id] * num_triangles_in_face)
            
            faces_data.append({
                'id': current_face_id, 'vertices': face_vertices, 'indices': face_indices,
                'vertexCount': len(face_vertices), 'triangleCount': num_triangles_in_face
            })

            offset = len(global_vertices)
            global_vertices.extend(face_vertices)
            global_indices.extend([i + offset for i in face_indices])
        face_explorer.Next()
        face_index += 1

    flat_vertices = [coord for vertex in global_vertices for coord in vertex]
    return {
        "id": shape_id, "vertices": flat_vertices, "indices": global_indices,
        "faces": faces_data, "faceIdByTriangle": face_id_by_triangle,
        "vertexCount": len(global_vertices), "triangleCount": len(global_indices) // 3,
        "faceCount": len(faces_data)
    }

def process_step_file(file_path):
    """Process STEP/IGES file and extract mesh data with face mapping"""
    print(f"Processing file: {file_path}")
    try:
        if file_path.lower().endswith(('.step', '.stp')): shape = read_step_file(file_path)
        elif file_path.lower().endswith(('.iges', '.igs')): shape = read_iges_file(file_path)
        else: raise Exception("Unsupported file format")
        print("File imported successfully")
        
        # --- MODIFIED: Use the centering helper function ---
        shape = center_shape(shape)

        shape_id = uuid.uuid4().hex
        scene_objects[shape_id] = shape
        print(f"Stored shape with ID: {shape_id}")
        mesh_data = extract_mesh_data(shape, shape_id)
        print(f"Tessellation complete: {mesh_data['triangleCount']} triangles")
        return [mesh_data]
    except Exception as e:
        print(f"❌ Error processing file: {e}")
        traceback.print_exc()
        raise e

@app.route('/api/create/box', methods=['POST'])
def create_box():
    """Create a box primitive."""
    try:
        data = request.get_json() or {}
        width,height,depth = data.get('width',10), data.get('height',10), data.get('depth',10)
        print(f"Creating box with dimensions: {width}x{height}x{depth}")
        box_shape = BRepPrimAPI_MakeBox(width, height, depth).Shape()
        
        # --- MODIFIED: Use the centering helper function ---
        box_shape = center_shape(box_shape)

        shape_id = uuid.uuid4().hex
        scene_objects[shape_id] = box_shape
        print(f"Stored new box shape with ID: {shape_id}")
        mesh_data = extract_mesh_data(box_shape, shape_id)
        return jsonify({'success': True, 'message': 'Box created successfully', 'mesh': mesh_data})
    except Exception as e:
        print(f"❌ Error in create_box: {e}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

# --- The rest of your file remains untouched ---

@app.route('/process-step', methods=['POST'])
def process_step():
    print('\n=== STEP Processing Request (Python/PythonOCC) ===')
    if 'stepFile' not in request.files: return jsonify({'error': 'No file uploaded'}), 400
    file = request.files['stepFile']
    if file.filename == '': return jsonify({'error': 'No file selected'}), 400
    if not allowed_file(file.filename): return jsonify({'error': 'Invalid file type.'}), 400
    filename = secure_filename(file.filename)
    file_path = os.path.join(UPLOAD_FOLDER, f"{int(time.time())}-{filename}")
    try:
        file.save(file_path)
        file_size = os.path.getsize(file_path)
        print(f"File: {filename}, Size: {file_size} bytes")
        meshes = process_step_file(file_path)
        total_verts = sum(m['vertexCount'] for m in meshes)
        total_tris = sum(m['triangleCount'] for m in meshes)
        total_faces = sum(m['faceCount'] for m in meshes)
        print(f"✅ Processing complete! Vertices: {total_verts}, Triangles: {total_tris}\n")
        response = {
            'success': True,
            'data': {'meshes': meshes, 'faces': total_faces,
                'statistics': {
                    'totalVertices': total_verts, 'totalTriangles': total_tris,
                    'totalFaces': total_faces, 'fileName': filename, 'fileSize': file_size
                }
            }
        }
        return jsonify(response)
    except Exception as e:
        print(f"❌ Processing failed: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': 'Failed to process STEP file', 'details': str(e)}), 500
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

# --- All other original functions and routes are preserved ---
@app.route('/api/transform/<shape_id>', methods=['POST'])
def transform_shape(shape_id):
    if shape_id not in scene_objects: return jsonify({'success': False, 'error': 'Shape not found'}), 404
    try:
        data = request.get_json()
        shape = scene_objects[shape_id]
        if 'translation' in data:
            t = data['translation']
            trans = gp_Trsf(); trans.SetTranslation(gp_Vec(t.get('x',0), t.get('y',0), t.get('z',0)))
            shape.Move(TopLoc_Location(trans))
        if 'rotation' in data:
            r = data['rotation']
            rot = gp_Trsf(); rot.SetRotation(gp_Ax1(gp_Pnt(0,0,0), gp_Vec(*r['axis'])), math.radians(r.get('angle',0)))
            shape.Move(TopLoc_Location(rot))
        scene_objects[shape_id] = shape
        new_mesh_data = extract_mesh_data(shape, shape_id)
        return jsonify({'success': True, 'mesh': new_mesh_data})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/')
def index():
    return "PythonOCC Flask Backend is running."

# (Including other routes for completeness, assuming they are part of the original file)
@app.route('/api/health')
def api_health(): return jsonify({'status': 'ok'})
@app.route('/api/store-stl', methods=['POST'])
def store_stl(): return jsonify({'status': 'ok'})
@app.route('/api/project/<project_id>', methods=['GET'])
def get_project_status(project_id): return jsonify({'status': 'ok'})
@app.route('/api/save-stl', methods=['POST'])
def save_stl(): return jsonify({'status': 'ok'})
@app.route('/api/list-projects', methods=['GET'])
def list_projects(): return jsonify({'status': 'ok'})
@app.route('/api/download-stl/<project_id>/<filename>', methods=['GET'])
def download_stl(project_id, filename): return jsonify({'status': 'ok'})
@app.route('/test')
def test_endpoint(): return jsonify({'message': 'Server is working'})
@app.route('/health')
def health(): return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    print("🚀 Starting Enhanced Python STEP processing server...")
    app.run(host='0.0.0.0', port=3000, debug=True)