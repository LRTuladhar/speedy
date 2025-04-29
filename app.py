import os
import json
import mimetypes
import time
import logging
import threading
import uuid
import shutil
from flask import Flask, render_template, request, jsonify, redirect, url_for, send_file, session
from PIL import Image
from werkzeug.utils import secure_filename
from functools import lru_cache

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload size
app.config['CACHE_TIMEOUT'] = 60  # Cache timeout in seconds

# Directory scan progress tracking
scan_tasks = {}
# Structure: {
#   'task_id': {
#     'directory': '/path/to/dir',
#     'status': 'scanning|complete|error',
#     'progress': 0-100,
#     'files_found': 0,
#     'images_found': 0,
#     'current_path': '/current/path/being/scanned',
#     'error': 'error message if any',
#     'start_time': timestamp,
#     'end_time': timestamp
#   }
# }

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

# Settings file path
SETTINGS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'settings.json')

# Default settings
DEFAULT_SETTINGS = {
    'trash_folder': os.path.join(os.path.dirname(os.path.abspath(__file__)), 'trash'),
    'favorites_folder': os.path.join(os.path.dirname(os.path.abspath(__file__)), 'favorites')
}

def get_settings():
    """Get application settings, creating default settings if they don't exist"""
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, 'r') as f:
                settings = json.load(f)
                # Ensure all default settings exist
                for key, value in DEFAULT_SETTINGS.items():
                    if key not in settings:
                        settings[key] = value
                return settings
        except Exception as e:
            logger.error(f"Error reading settings file: {e}")
    
    # Create default settings if file doesn't exist
    save_settings(DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS.copy()

def save_settings(settings):
    """Save application settings"""
    try:
        # Ensure the directory exists
        os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
        
        with open(SETTINGS_FILE, 'w') as f:
            json.dump(settings, f, indent=4)
        return True
    except Exception as e:
        logger.error(f"Error saving settings: {e}")
        return False

def ensure_trash_folder():
    """Ensure the trash folder exists"""
    settings = get_settings()
    trash_folder = settings['trash_folder']
    
    try:
        os.makedirs(trash_folder, exist_ok=True)
        return trash_folder
    except Exception as e:
        logger.error(f"Error creating trash folder: {e}")
        return None

def ensure_favorites_folder():
    """Ensure the favorites folder exists and has proper permissions"""
    settings = get_settings()
    favorites_folder = settings['favorites_folder']
    
    try:
        # Create the directory if it doesn't exist
        os.makedirs(favorites_folder, exist_ok=True)
        
        # Ensure the directory has write permissions
        if not os.access(favorites_folder, os.W_OK):
            try:
                # Try to fix permissions
                current_mode = os.stat(favorites_folder).st_mode
                os.chmod(favorites_folder, current_mode | 0o755)  # Add write permission
                logger.info(f"Updated permissions for favorites folder: {favorites_folder}")
            except Exception as perm_err:
                logger.warning(f"Could not update permissions on favorites folder: {perm_err}")
        
        return favorites_folder
    except Exception as e:
        logger.error(f"Error creating favorites folder: {e}")
        return None

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

def get_directory_structure(path, lazy_load=True):
    """Return the directory structure as a nested dictionary with caching.
    When lazy_load is True, only scan the current directory level and not subdirectories.
    """
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
                # If lazy loading, just add a placeholder for the directory
                if lazy_load:
                    result['children'].append({
                        'name': item,
                        'path': item_path,
                        'type': 'directory',
                        'children': [],  # Empty children array as placeholder
                        'lazy': True     # Mark as lazy loaded
                    })
                else:
                    # If not lazy loading, recursively get the structure
                    result['children'].append(get_directory_structure(item_path, lazy_load))
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
    """Main application page. Only show directory names without scanning contents."""
    directories = get_monitored_directories()
    directory_trees = []
    
    for directory in directories:
        if os.path.exists(directory):
            # Just create a basic structure with the directory name and path, no scanning
            directory_trees.append({
                'name': os.path.basename(directory),
                'path': directory,
                'type': 'directory',
                'children': [],
                'lazy': True  # Mark as lazy loaded
            })
    
    return render_template('index.html', directory_trees=directory_trees)

@app.route('/settings', methods=['GET'])
def get_app_settings():
    """Get application settings"""
    return jsonify(get_settings())

@app.route('/settings', methods=['POST'])
def update_app_settings():
    """Update application settings"""
    try:
        settings = request.json
        current_settings = get_settings()
        
        # Update only provided settings
        for key, value in settings.items():
            if key in current_settings:
                current_settings[key] = value
        
        # Save updated settings
        if save_settings(current_settings):
            # Ensure folders exist
            ensure_trash_folder()
            ensure_favorites_folder()
            return jsonify({'success': True, 'settings': current_settings})
        else:
            return jsonify({'success': False, 'error': 'Failed to save settings'}), 500
    except Exception as e:
        logger.error(f"Error updating settings: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/delete-image', methods=['POST'])
def delete_image():
    """Move an image to the trash folder"""
    try:
        image_path = request.json.get('path')
        if not image_path or not os.path.exists(image_path):
            return jsonify({'success': False, 'error': 'Image not found'}), 404
        
        # Get the trash folder path
        trash_folder = ensure_trash_folder()
        if not trash_folder:
            return jsonify({'success': False, 'error': 'Failed to create trash folder'}), 500
        
        # Create a destination path in the trash folder
        filename = os.path.basename(image_path)
        # Add timestamp to avoid name conflicts
        timestamp = int(time.time())
        trash_filename = f"{timestamp}_{filename}"
        trash_path = os.path.join(trash_folder, trash_filename)
        
        # Move the file to trash
        import shutil
        shutil.move(image_path, trash_path)
        
        # Invalidate cache
        global last_directory_change
        last_directory_change = time.time()
        
        return jsonify({
            'success': True, 
            'message': 'Image moved to trash',
            'original_path': image_path,
            'trash_path': trash_path
        })
    except Exception as e:
        logger.error(f"Error deleting image: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/scan_directory', methods=['POST'])
def scan_directory():
    """Start a background task to scan a directory and track progress."""
    directory = request.form.get('directory')
    logger.info(f"Received request to scan directory: {directory}")
    
    if not directory:
        return jsonify({
            'status': 'error',
            'message': 'No directory provided'
        }), 400
    
    if not os.path.exists(directory):
        return jsonify({
            'status': 'error',
            'message': f'Directory does not exist: {directory}'
        }), 400
    
    if not os.path.isdir(directory):
        return jsonify({
            'status': 'error',
            'message': f'Path is not a directory: {directory}'
        }), 400
    
    # Generate a unique task ID
    task_id = str(uuid.uuid4())
    
    # Initialize task status
    scan_tasks[task_id] = {
        'directory': directory,
        'status': 'scanning',
        'progress': 0,
        'files_found': 0,
        'images_found': 0,
        'current_path': directory,
        'start_time': time.time(),
        'end_time': None
    }
    
    # Start background scan
    thread = threading.Thread(target=scan_directory_task, args=(task_id, directory))
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'status': 'started',
        'task_id': task_id
    })

@app.route('/scan_status/<task_id>', methods=['GET'])
def scan_status(task_id):
    """Get the status of a directory scan."""
    if task_id not in scan_tasks:
        return jsonify({
            'status': 'error',
            'message': f'Task ID not found: {task_id}'
        }), 404
    
    task = scan_tasks[task_id]
    
    # Calculate elapsed time
    elapsed = time.time() - task['start_time']
    
    response = {
        'status': task['status'],
        'progress': task['progress'],
        'files_found': task['files_found'],
        'images_found': task['images_found'],
        'current_path': task['current_path'],
        'elapsed_time': elapsed,
        'directory': task['directory']
    }
    
    if task['status'] == 'error' and 'error' in task:
        response['error'] = task['error']
    
    return jsonify(response)

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
    """Get the structure of a specific directory."""
    directory = request.args.get('directory')
    
    if not directory or not os.path.exists(directory) or not os.path.isdir(directory):
        return jsonify({
            'name': 'Error',
            'path': directory or '',
            'type': 'error',
            'children': []
        })
    
    # Get the structure of just this directory, with lazy loading for subdirectories
    directory_structure = get_directory_structure(directory, lazy_load=True)
    
    return jsonify(directory_structure)

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

@app.route('/rotate-image', methods=['POST'])
def rotate_image():
    """Rotate an image and return the temporary path to the rotated version"""
    try:
        image_path = request.json.get('path')
        direction = request.json.get('direction', 'clockwise')  # clockwise or counterclockwise
        
        if not image_path or not os.path.exists(image_path):
            return jsonify({'success': False, 'error': 'Image not found'}), 404
        
        # Open the image with PIL
        img = Image.open(image_path)
        
        # Rotate the image based on direction
        if direction == 'clockwise':
            rotated_img = img.rotate(-90, expand=True)  # -90 degrees for clockwise
        else:  # counterclockwise
            rotated_img = img.rotate(90, expand=True)   # 90 degrees for counterclockwise
        
        # Create a temporary filename for the rotated image
        filename = os.path.basename(image_path)
        temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp')
        
        # Create temp directory if it doesn't exist
        if not os.path.exists(temp_dir):
            os.makedirs(temp_dir)
        
        # Save to a temporary file with a timestamp to avoid caching issues
        timestamp = int(time.time())
        temp_path = os.path.join(temp_dir, f"{timestamp}_{filename}")
        rotated_img.save(temp_path)
        
        # Return the temporary path and original path
        return jsonify({
            'success': True,
            'message': f'Image rotated {direction}',
            'original_path': image_path,
            'temp_path': temp_path,
            'direction': direction
        })
    except Exception as e:
        logger.error(f"Error rotating image: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/save-rotated-image', methods=['POST'])
def save_rotated_image():
    """Save a rotated image, replacing the original"""
    try:
        temp_path = request.json.get('temp_path')
        original_path = request.json.get('original_path')
        
        if not temp_path or not os.path.exists(temp_path):
            return jsonify({'success': False, 'error': 'Temporary rotated image not found'}), 404
        
        if not original_path or not os.path.exists(original_path):
            return jsonify({'success': False, 'error': 'Original image not found'}), 404
        
        # Check if we have write permission to the original file
        if not os.access(os.path.dirname(original_path), os.W_OK):
            return jsonify({'success': False, 'error': 'No write permission to save the image'}), 403
        
        # Copy the temporary file to the original location
        shutil.copy2(temp_path, original_path)
        
        # Remove the temporary file
        os.remove(temp_path)
        
        # Invalidate cache
        global last_directory_change
        last_directory_change = time.time()
        
        return jsonify({
            'success': True,
            'message': 'Rotated image saved',
            'path': original_path
        })
    except Exception as e:
        logger.error(f"Error saving rotated image: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

def is_image_favorited(image_path):
    """Check if an image is already in the favorites folder"""
    if not image_path:
        return False
    
    favorites_folder = ensure_favorites_folder()
    if not favorites_folder:
        return False
    
    # Get the base filename without the timestamp prefix
    filename = os.path.basename(image_path)
    
    # Check if any file in the favorites folder ends with this filename
    # This handles the timestamp prefix in the favorited filenames
    for favorite_file in os.listdir(favorites_folder):
        if favorite_file.endswith(filename):
            return os.path.join(favorites_folder, favorite_file)
    
    return False

@app.route('/favorite-image', methods=['POST'])
def favorite_image():
    """Toggle an image's favorite status - add to or remove from favorites"""
    try:
        image_path = request.json.get('path')
        if not image_path or not os.path.exists(image_path):
            return jsonify({'success': False, 'error': 'Image not found'}), 404
        
        # Check if image is already favorited
        favorited_path = is_image_favorited(image_path)
        
        # If already favorited, remove it
        if favorited_path:
            try:
                os.remove(favorited_path)
                return jsonify({
                    'success': True,
                    'message': 'Image removed from favorites',
                    'original_path': image_path,
                    'was_favorited': True
                })
            except Exception as e:
                logger.error(f"Error removing favorite: {e}")
                return jsonify({'success': False, 'error': f"Error removing from favorites: {e}"}), 500
        
        # If not favorited, add it to favorites
        # Get the favorites folder path
        favorites_folder = ensure_favorites_folder()
        if not favorites_folder:
            return jsonify({'success': False, 'error': 'Failed to create favorites folder'}), 500
        
        # Create a destination path in the favorites folder
        filename = os.path.basename(image_path)
        # Add timestamp to avoid name conflicts
        timestamp = int(time.time())
        favorite_filename = f"{timestamp}_{filename}"
        favorite_path = os.path.join(favorites_folder, favorite_filename)
        
        # Copy the file to favorites with robust error handling
        import shutil
        try:
            # Try the standard copy first
            shutil.copy2(image_path, favorite_path)
        except PermissionError as pe:
            logger.warning(f"Permission error during copy, trying alternative method: {pe}")
            try:
                # Try reading the source file and writing to destination
                with open(image_path, 'rb') as src_file:
                    content = src_file.read()
                    with open(favorite_path, 'wb') as dest_file:
                        dest_file.write(content)
                # Try to copy metadata if possible
                try:
                    os.chmod(favorite_path, os.stat(image_path).st_mode)
                except Exception as chmod_err:
                    logger.warning(f"Could not copy file permissions: {chmod_err}")
            except Exception as alt_err:
                logger.error(f"Alternative copy method failed: {alt_err}")
                raise Exception(f"Error adding image to favorites: {alt_err}")
        
        return jsonify({
            'success': True, 
            'message': 'Image added to favorites',
            'original_path': image_path,
            'favorite_path': favorite_path,
            'was_favorited': False
        })
    except Exception as e:
        logger.error(f"Error processing favorite action: {e}")
        return jsonify({'success': False, 'error': f"Error processing favorite action: {e}"}), 500

@app.route('/check-favorited', methods=['POST'])
def check_favorited():
    """Check if an image is already in favorites"""
    try:
        image_path = request.json.get('path')
        if not image_path:
            return jsonify({'success': False, 'error': 'No image path provided'}), 400
        
        favorited_path = is_image_favorited(image_path)
        
        return jsonify({
            'success': True,
            'is_favorited': bool(favorited_path),
            'favorited_path': favorited_path if favorited_path else None
        })
    except Exception as e:
        logger.error(f"Error checking favorite status: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

def scan_directory_task(task_id, directory):
    """Background task to scan a directory and count files and images."""
    task = scan_tasks[task_id]
    total_files = 0
    total_images = 0
    
    try:
        # First, count all files to estimate progress
        logger.info(f"Counting files in {directory}")
        all_files = []
        
        for root, dirs, files in os.walk(directory):
            task['current_path'] = root
            all_files.extend([os.path.join(root, f) for f in files])
            task['files_found'] = len(all_files)
            # Sleep briefly to avoid hogging CPU
            time.sleep(0.001)
        
        total_files = len(all_files)
        logger.info(f"Found {total_files} files in {directory}")
        
        # Now check which ones are images
        if total_files > 0:
            for i, file_path in enumerate(all_files):
                task['current_path'] = os.path.dirname(file_path)
                if is_image(file_path):
                    total_images += 1
                task['images_found'] = total_images
                task['progress'] = int((i + 1) / total_files * 100)
                # Sleep briefly to avoid hogging CPU
                time.sleep(0.001)
        
        # Mark as complete
        task['status'] = 'complete'
        task['progress'] = 100
        task['end_time'] = time.time()
        logger.info(f"Scan complete: {total_files} files, {total_images} images in {directory}")
        
    except Exception as e:
        logger.error(f"Error scanning directory {directory}: {e}")
        task['status'] = 'error'
        task['error'] = str(e)
        task['end_time'] = time.time()

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Speedy Photo Management')
    parser.add_argument('--port', type=int, default=5000, help='Port to run the server on')
    args = parser.parse_args()
    
    app.run(debug=True, port=args.port)
