# Speedy Photo Management App

Speedy is a simple and fast photo management application built with Python and Flask. It allows users to add directories to monitor, navigate through directory trees, view images, and manage their photo collection with features like favorites and trash.

## Features

- Add and remove directories to monitor
- Navigate directory trees in the left sidebar
- View image thumbnails in the main content area with pagination
- Full-screen image viewer with keyboard navigation
- Mark photos as favorites with one click
- Move unwanted photos to trash
- Customizable settings for trash and favorites folders
- Responsive design for a better user experience

## Installation

1. Clone or download this repository
2. Create a virtual environment (recommended)
3. Install the required dependencies

```bash
# Create a virtual environment
python -m venv venv

# Activate the virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## Usage

1. Start the application:

```bash
python app.py
```

2. Open your web browser and navigate to `http://127.0.0.1:5000`

3. Configure your settings (optional):
   - Click the gear icon in the top-right corner
   - Set custom paths for trash and favorites folders
   - Click "Save Settings"

4. Add directories containing your photos using the form in the left sidebar

5. Navigate through the directory tree by clicking on directories

6. View and manage your photos:
   - Browse image thumbnails in the main content area
   - Click on an image to open it in the full-screen viewer
   - Use the star icon to mark photos as favorites
   - Use the trash icon to move unwanted photos to the trash folder
   - Navigate between images using arrow keys or the on-screen navigation buttons

7. Use pagination controls to browse through large collections

## Requirements

- Python 3.7+
- Flask 2.3.3+
- Pillow 10.0.0+ (PIL Fork)
- Werkzeug 2.3.7+
- Flask-WTF 1.1.1+

All dependencies are listed in the requirements.txt file.

## Keyboard Shortcuts

### Image Grid Navigation

- **Arrow Keys**: Navigate between images in the grid
- **Enter**: Open the selected image in the viewer
- **F**: Mark the selected image as favorite
- **Delete/Backspace**: Move the selected image to trash
- **Page Up/Down**: Navigate between pages
- **Home**: Go to the first image
- **End**: Go to the last image

### Image Viewer

- **Left Arrow**: Previous image
- **Right Arrow**: Next image
- **Home**: First image
- **End**: Last image
- **Delete/Backspace**: Move current image to trash
- **Escape**: Close image viewer
- **I**: Toggle image information panel

## License

MIT
