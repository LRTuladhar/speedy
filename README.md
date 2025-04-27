# Speedy Photo Management App

Speedy is a simple and fast photo management application built with Python and Flask. It allows users to add directories to monitor, navigate through directory trees, and view image thumbnails.

## Features

- Add and remove directories to monitor
- Navigate directory trees in the left sidebar
- View image thumbnails in the main content area
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

3. Add directories containing your photos using the form in the left sidebar

4. Navigate through the directory tree by clicking on directories

5. View image thumbnails in the main content area

## Requirements

- Python 3.7+
- Flask
- Pillow (PIL Fork)
- Werkzeug
- Flask-WTF

## License

MIT
