import os
import json
import mimetypes
import time
import logging
from flask import Flask, render_template, request, jsonify, redirect, url_for, send_file
from werkzeug.utils import secure_filename
from functools import lru_cache

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload size
app.config['CACHE_TIMEOUT'] = 60  # Cache timeout in seconds

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('speedy')

# Store the directories being monitored
MONITORED_DIRS_FILE = os.path.join(app.config['UPLOAD_FOLDER'], 'monitored_dirs.json')

# Cache storage
directory_structure_cache = {}
directory_images_cache = {}

# Cache invalidation timestamps
last_directory_change = 0

def get_monitored_directories():
    if os.path.exists(MONITORED_DIRS_FILE):
        with open(MONITORED_DIRS_FILE, 'r') as f:
            return json.load(f)
    return []

def save_monitored_directories(directories):
    logger.info(f"Saving monitored directories: {len(directories)} directories")
    os.makedirs(os.path.dirname(MONITORED_DIRS_FILE), exist_ok=True)
    with open(MONITORED_DIRS_FILE, 'w') as f:
        json.dump(directories, f)
    
    # Invalidate cache when directories are changed
    global last_directory_change
    last_directory_change = time.time()
    logger.info(f"Updated last_directory_change timestamp to {last_directory_change}")
    directory_structure_cache.clear()
    directory_images_cache.clear()
    logger.info("Cleared directory and image caches")

def is_image(file_path):
    """Check if a file is an image based on its MIME type."""
    mime_type, _ = mimetypes.guess_type(file_path)
    return mime_type and mime_type.startswith('image/')

def get_directory_structure(path):
    """Return the directory structure as a nested dictionary with caching."""
    # Check if we have a valid cached version
    cache_key = f"structure:{path}"
    if cache_key in directory_structure_cache:
        cache_time, cached_data = directory_structure_cache[cache_key]
        # Check if cache is still valid
        if time.time() - cache_time < app.config['CACHE_TIMEOUT'] and cache_time > last_directory_change:
            print(f"Using cached directory structure for {path}")
            return cached_data
    
    # If not cached or cache invalid, compute the structure
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
    
    # Cache the result
    directory_structure_cache[cache_key] = (time.time(), result)
    return result

def get_directory_images(directory_path):
    """Get all images in a directory with caching."""
    # Check if we have a valid cached version
    cache_key = f"images:{directory_path}"
    if cache_key in directory_images_cache:
        cache_time, cached_data = directory_images_cache[cache_key]
        # Check if cache is still valid
        if time.time() - cache_time < app.config['CACHE_TIMEOUT'] and cache_time > last_directory_change:
            logger.info(f"Using cached images for {directory_path}")
            return cached_data
    
    # If not cached or cache invalid, get the images
    images = []
    try:
        for item in os.listdir(directory_path):
            item_path = os.path.join(directory_path, item)
            if os.path.isfile(item_path) and is_image(item_path):
                # Get file creation time and modification time
                try:
                    # Get file stats
                    stat_info = os.stat(item_path)
                    # Use the earlier of creation time or modification time as "date created"
                    # On some systems, creation time might not be available
                    created_time = stat_info.st_ctime
                    modified_time = stat_info.st_mtime
                    
                    # Just return the file path, name, and date information
                    images.append({
                        'name': item,
                        'path': item_path,
                        'url': f"/image?path={item_path}",
                        'created': created_time,
                        'modified': modified_time,
                        'date_str': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(created_time))
                    })
                except Exception as e:
                    logger.error(f"Error getting file info for {item_path}: {e}")
                    # Add the image without date information if there's an error
                    images.append({
                        'name': item,
                        'path': item_path,
                        'url': f"/image?path={item_path}",
                        'created': 0,
                        'modified': 0,
                        'date_str': 'Unknown date'
                    })
    except (PermissionError, FileNotFoundError) as e:
        # Handle permission errors or if directory doesn't exist anymore
        logger.error(f"Error accessing directory {directory_path}: {e}")
    
    logger.info(f"Found {len(images)} images in {directory_path}")
    
    # Cache the result
    directory_images_cache[cache_key] = (time.time(), images)
    return images

@app.route('/')
def index():
    directories = get_monitored_directories()
    directory_trees = []
    
    for directory in directories:
        if os.path.exists(directory):
            directory_trees.append(get_directory_structure(directory))
    
    return render_template('index.html', directory_trees=directory_trees)

@app.route('/add_directory', methods=['POST'])
def add_directory():
    directory = request.form.get('directory')
    logger.info(f"Received request to add directory: {directory}")
    
    if not directory:
        logger.warning("No directory provided in request")
        return redirect(url_for('index'))
    
    if not os.path.exists(directory):
        logger.error(f"Directory does not exist: {directory}")
        return redirect(url_for('index'))
    
    if not os.path.isdir(directory):
        logger.error(f"Path is not a directory: {directory}")
        return redirect(url_for('index'))
    
    directories = get_monitored_directories()
    logger.info(f"Current monitored directories: {len(directories)}")
    
    if directory in directories:
        logger.info(f"Directory already being monitored: {directory}")
    else:
        logger.info(f"Adding new directory to monitor: {directory}")
        directories.append(directory)
        save_monitored_directories(directories)
        # Clear caches when adding a directory
        cache_size_before = len(directory_structure_cache), len(directory_images_cache)
        directory_structure_cache.clear()
        directory_images_cache.clear()
        logger.info(f"Cleared caches. Before: {cache_size_before}, After: (0, 0)")
    
    return redirect(url_for('index'))

@app.route('/remove_directory', methods=['POST'])
def remove_directory():
    directory = request.form.get('directory')
    logger.info(f"Received request to remove directory: {directory}")
    
    if not directory:
        logger.warning("No directory provided in request")
        return redirect(url_for('index'))
    
    directories = get_monitored_directories()
    logger.info(f"Current monitored directories: {len(directories)}")
    
    if directory in directories:
        logger.info(f"Removing directory from monitoring: {directory}")
        directories.remove(directory)
        save_monitored_directories(directories)
        # Clear caches when removing a directory
        cache_size_before = len(directory_structure_cache), len(directory_images_cache)
        directory_structure_cache.clear()
        directory_images_cache.clear()
        logger.info(f"Cleared caches. Before: {cache_size_before}, After: (0, 0)")
    else:
        logger.warning(f"Directory not found in monitored list: {directory}")
    
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

@app.route('/image')
def serve_image():
    """Serve an image file directly."""
    path = request.args.get('path')
    if path and os.path.exists(path) and is_image(path):
        return send_file(path)
    return '', 404

if __name__ == '__main__':
    app.run(debug=True)
