import os
import json
import mimetypes
from flask import Flask, render_template, request, jsonify, redirect, url_for
from werkzeug.utils import secure_filename
from PIL import Image
import io
import base64

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload size

# Store the directories being monitored
MONITORED_DIRS_FILE = os.path.join(app.config['UPLOAD_FOLDER'], 'monitored_dirs.json')

def get_monitored_directories():
    if os.path.exists(MONITORED_DIRS_FILE):
        with open(MONITORED_DIRS_FILE, 'r') as f:
            return json.load(f)
    return []

def save_monitored_directories(directories):
    os.makedirs(os.path.dirname(MONITORED_DIRS_FILE), exist_ok=True)
    with open(MONITORED_DIRS_FILE, 'w') as f:
        json.dump(directories, f)

def is_image(file_path):
    """Check if a file is an image based on its MIME type."""
    mime_type, _ = mimetypes.guess_type(file_path)
    return mime_type and mime_type.startswith('image/')

def get_directory_structure(path):
    """Return the directory structure as a nested dictionary."""
    result = {'name': os.path.basename(path), 'path': path, 'type': 'directory', 'children': []}
    
    try:
        for item in os.listdir(path):
            item_path = os.path.join(path, item)
            if os.path.isdir(item_path):
                result['children'].append(get_directory_structure(item_path))
            elif os.path.isfile(item_path) and is_image(item_path):
                result['children'].append({
                    'name': item,
                    'path': item_path,
                    'type': 'image'
                })
    except (PermissionError, FileNotFoundError):
        # Handle permission errors or if directory doesn't exist anymore
        pass
    
    return result

def get_directory_images(directory_path):
    """Get all images in a directory."""
    images = []
    try:
        for item in os.listdir(directory_path):
            item_path = os.path.join(directory_path, item)
            if os.path.isfile(item_path) and is_image(item_path):
                # Create a thumbnail
                try:
                    with Image.open(item_path) as img:
                        img.thumbnail((200, 200))
                        buffered = io.BytesIO()
                        img.save(buffered, format=img.format or 'JPEG')
                        img_str = base64.b64encode(buffered.getvalue()).decode()
                        
                        images.append({
                            'name': item,
                            'path': item_path,
                            'thumbnail': f'data:image/jpeg;base64,{img_str}'
                        })
                except Exception as e:
                    print(f"Error creating thumbnail for {item_path}: {e}")
    except (PermissionError, FileNotFoundError):
        # Handle permission errors or if directory doesn't exist anymore
        pass
    
    return images

@app.route('/')
def index():
    directories = get_monitored_directories()
    directory_trees = []
    
    for directory in directories:
        if os.path.exists(directory):
            directory_trees.append(get_directory_structure(directory))
    
    return render_template('index.html', directories=directories, directory_trees=directory_trees)

@app.route('/add_directory', methods=['POST'])
def add_directory():
    directory = request.form.get('directory')
    
    if directory and os.path.isdir(directory):
        directories = get_monitored_directories()
        if directory not in directories:
            directories.append(directory)
            save_monitored_directories(directories)
    
    return redirect(url_for('index'))

@app.route('/remove_directory', methods=['POST'])
def remove_directory():
    directory = request.form.get('directory')
    
    if directory:
        directories = get_monitored_directories()
        if directory in directories:
            directories.remove(directory)
            save_monitored_directories(directories)
    
    return redirect(url_for('index'))

@app.route('/get_directory_structure', methods=['GET'])
def get_structure():
    directories = get_monitored_directories()
    directory_trees = []
    
    for directory in directories:
        if os.path.exists(directory):
            directory_trees.append(get_directory_structure(directory))
    
    return jsonify(directory_trees)

@app.route('/get_directory_images', methods=['GET'])
def get_images():
    directory_path = request.args.get('directory')
    
    if directory_path and os.path.isdir(directory_path):
        images = get_directory_images(directory_path)
        return jsonify(images)
    
    return jsonify([])

if __name__ == '__main__':
    app.run(debug=True)
