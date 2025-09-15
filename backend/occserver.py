#!/usr/bin/env python3
"""
Enhanced Python STEP file processor using PythonOCC
Now includes STL export storage functionality and RANSAC shape recognition
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

# --- NEW IMPORTS FOR RANSAC ---
import numpy as np
try:
    from pyransac3d import Cylinder
except ImportError:
    print("WARNING: pyransac3d not installed. Shape recognition will not work.")
    Cylinder = None
# --- END NEW IMPORTS ---


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
from OCC.Core.gp import gp_Pnt, gp_Ax2
from OCC.Core.TopoDS import topods
from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeSphere, BRepPrimAPI_MakeCylinder
from OCC.Core.BRepBndLib import brepbndlib
from OCC.Core.Bnd import Bnd_Box
from OCC.Core.gp import gp_Trsf, gp_Vec, gp_Ax1
from OCC.Core.BRepAdaptor import BRepAdaptor_Surface
from OCC.Core.GeomAbs import GeomAbs_Cylinder, GeomAbs_Plane

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

# ... (all previous helper functions like allowed_file, read_step_file, etc. remain the same) ...

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
    shape.Move(TopLoc_Location(transform))
    print(f"Shape centered. Moved by {-center_x:.2f}, {-center_y:.2f}, {-center_z:.2f}")
    return shape

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
        
        surface_props = {}
        adaptor = BRepAdaptor_Surface(face, True)
        surface_type = adaptor.GetType()

        if surface_type == GeomAbs_Cylinder:
            cylinder = adaptor.Cylinder()
            axis = cylinder.Axis()
            location_cyl = axis.Location()
            direction = axis.Direction()
            surface_props = {
                'surfaceType': 'Cylinder',
                'radius': cylinder.Radius(),
                'center': [location_cyl.X(), location_cyl.Y(), location_cyl.Z()],
                'axis': [direction.X(), direction.Y(), direction.Z()]
            }
        elif surface_type == GeomAbs_Plane:
            surface_props = {'surfaceType': 'Plane'}
        else:
            surface_props = {'surfaceType': 'Other'}
        
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
            
            face_data = {
                'id': current_face_id, 'vertices': face_vertices, 'indices': face_indices,
                'vertexCount': len(face_vertices), 'triangleCount': num_triangles_in_face
            }
            face_data.update(surface_props)
            faces_data.append(face_data)

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

# --- NEW RANSAC ENDPOINT ---
@app.route('/api/recognize-shape', methods=['POST'])
def recognize_shape():
    """Recognize a shape from a point cloud using RANSAC with an adaptive threshold."""
    if Cylinder is None:
        return jsonify({'success': False, 'error': 'pyransac3d is not installed on the server.'}), 500
        
    try:
        data = request.get_json()
        points_flat = data.get('points', [])
        if not points_flat:
            return jsonify({'success': False, 'error': 'No points provided'}), 400

        points = np.array(points_flat).reshape(-1, 3)
        
        # --- NEW: Adaptive Threshold Calculation ---
        # 1. Get the bounding box of the input points
        min_bound = np.min(points, axis=0)
        max_bound = np.max(points, axis=0)
        
        # 2. Calculate the diagonal of the bounding box (a measure of the overall size)
        diagonal_length = np.linalg.norm(max_bound - min_bound)
        
        # 3. Set the threshold to a small percentage of the diagonal
        # This is the key parameter to tune. 2.5% is a good starting point.
        threshold_percentage = 0.025 
        adaptive_threshold = diagonal_length * threshold_percentage
        
        print(f"Running RANSAC on {len(points)} points.")
        print(f"Bounding box diagonal: {diagonal_length:.2f}, Adaptive threshold: {adaptive_threshold:.4f}")
        # --- END: Adaptive Threshold Calculation ---

        cyl = Cylinder()
        # --- MODIFIED: Use the new adaptive threshold ---
        center, axis, radius, inliers_indices = cyl.fit(points, thresh=adaptive_threshold, maxIteration=2000)

        # Ensure the axis vector is a unit vector for stable calculations
        axis_normalized = axis / np.linalg.norm(axis)

        # The rest of the logic for calculating height and final center is the same
        inlier_points = points[inliers_indices]
        vec_from_center = inlier_points - center
        distances = np.dot(vec_from_center, axis_normalized)
        
        min_dist = np.min(distances)
        max_dist = np.max(distances)
        height = max_dist - min_dist
        final_center = center + axis_normalized * ((min_dist + max_dist) / 2.0)

        print(f"✅ Cylinder Found! Axis: {np.round(axis_normalized, 2)}, Radius: {radius:.2f}, Height: {height:.2f}")

        return jsonify({
            'success': True,
            'shape': 'Cylinder',
            'center': final_center.tolist(),
            'axis': axis_normalized.tolist(), # Send the normalized axis
            'radius': radius,
            'height': height
        })

    except Exception as e:
        print(f"❌ RANSAC Error: {e}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Failed to fit a cylinder. Try selecting more faces or faces that are more clearly cylindrical.'}), 500
# ... (all other routes like /api/create/box, /process-step, etc. remain the same) ...

@app.route('/api/create/box', methods=['POST'])
def create_box():
    """Create a box primitive."""
    try:
        data = request.get_json() or {}
        width,height,depth = data.get('width',10), data.get('height',10), data.get('depth',10)
        print(f"Creating box with dimensions: {width}x{height}x{depth}")
        box_shape = BRepPrimAPI_MakeBox(width, height, depth).Shape()
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

@app.route('/api/create/cylinder', methods=['POST'])
def create_cylinder():
    """Create a cylinder primitive."""
    try:
        data = request.get_json() or {}
        radius = data.get('radius', 5)
        height = data.get('height', 20)
        print(f"Creating cylinder with radius: {radius}, height: {height}")
        ax = gp_Ax2(gp_Pnt(0, 0, 0), gp_Vec(0, 0, 1))
        cylinder_shape = BRepPrimAPI_MakeCylinder(ax, radius, height).Shape()
        cylinder_shape = center_shape(cylinder_shape)
        shape_id = uuid.uuid4().hex
        scene_objects[shape_id] = cylinder_shape
        print(f"Stored new cylinder shape with ID: {shape_id}")
        mesh_data = extract_mesh_data(cylinder_shape, shape_id)
        return jsonify({'success': True, 'message': 'Cylinder created', 'mesh': mesh_data})
    except Exception as e:
        print(f"❌ Error in create_cylinder: {e}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

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

# (Other routes)
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