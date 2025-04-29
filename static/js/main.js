// Global cache for directory contents and images
const directoryCache = {};
const imageCache = {};

// Pagination and sorting state
let currentPage = 1;
let totalPages = 1;
let imagesPerPage = 10;
let currentImages = [];
let currentSortMethod = 'date-desc'; // Default sort: date created, newest first

// Application settings
let appSettings = {
    trash_folder: '',
    favorites_folder: ''
};

document.addEventListener('DOMContentLoaded', function() {
    // Load application settings
    loadSettings();
    
    // Initialize directory tree functionality
    initDirectoryTree();
    
    // Add click event listeners to tree items
    document.querySelectorAll('.tree-toggle').forEach(item => {
        item.addEventListener('click', handleTreeItemClick);
    });
    
    // Initialize settings modal
    initSettingsModal();
    
    // Add event listener for the add directory form
    const addDirectoryForm = document.getElementById('add-directory-form');
    if (addDirectoryForm) {
        console.log('Add directory form found, attaching event listener');
        addDirectoryForm.addEventListener('submit', function(event) {
            event.preventDefault(); // Prevent the default form submission
            
            const directoryInput = this.querySelector('input[name="directory"]');
            if (directoryInput && directoryInput.value) {
                const directoryPath = directoryInput.value;
                console.log(`Attempting to add directory: ${directoryPath}`);
                
                // Show the progress dialog
                showProgressDialog(directoryPath);
                
                // Start the scan process
                scanDirectory(directoryPath);
            }
        });
    } else {
        console.warn('Add directory form not found');
    }
    
    // Initialize pagination controls
    initPaginationControls();
    
    // Initialize modal close buttons
    document.querySelectorAll('.modal .close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            // Find the parent modal
            const modal = this.closest('.modal');
            if (modal) {
                if (modal.id === 'progress-modal') {
                    hideProgressDialog();
                } else if (modal.id === 'image-viewer-modal') {
                    closeImageViewer();
                } else if (modal.id === 'settings-modal') {
                    hideSettingsModal();
                }
            }
        });
    });
    
    // Initialize keyboard navigation for image grid
    initKeyboardNavigation();
    
    // Initialize image viewer
    initImageViewer();
    
    // Handle window resize to recalculate grid dimensions
    window.addEventListener('resize', function() {
        // Reset grid columns so they'll be recalculated
        gridColumns = 0;
        calculateGridDimensions();
    });
});

function initDirectoryTree() {
    // Expand/collapse functionality for directory tree
    document.querySelectorAll('.tree-toggle').forEach(toggle => {
        toggle.addEventListener('click', function(event) {
            // Prevent the event from bubbling up to avoid triggering handleTreeItemClick twice
            event.stopPropagation();
            
            const treeItem = this.closest('.tree-item');
            const children = treeItem.querySelector('.tree-children');
            
            // Toggle expanded class on the tree item
            treeItem.classList.toggle('expanded');
            
            // Toggle folder icon between open and closed
            const folderIcon = this.querySelector('i.fas');
            if (folderIcon) {
                if (treeItem.classList.contains('expanded')) {
                    folderIcon.classList.remove('fa-folder');
                    folderIcon.classList.add('fa-folder-open');
                } else {
                    folderIcon.classList.remove('fa-folder-open');
                    folderIcon.classList.add('fa-folder');
                }
            }
            
            // If this item has children and they're not loaded yet, load them
            if (children && children.children.length === 0) {
                const path = treeItem.getAttribute('data-path');
                loadDirectoryContents(path, children);
            }
        });
    });
    
    // Add a function to clear cache when adding or removing directories
    document.querySelectorAll('form').forEach(form => {
        if (form.action.includes('add_directory') || form.action.includes('remove_directory')) {
            form.addEventListener('submit', function() {
                // Clear caches when modifying directories
                const formType = form.action.includes('add_directory') ? 'add' : 'remove';
                const directoryInput = this.querySelector('input[name="directory"]');
                const directoryPath = directoryInput ? directoryInput.value : 'unknown';
                
                console.log(`[${formType.toUpperCase()}] Directory operation on: ${directoryPath}`);
                console.log('Clearing directory and image caches due to directory modification');
                
                // Log cache stats before clearing
                console.log(`Cache stats before clearing - Directories: ${Object.keys(directoryCache).length}, Images: ${Object.keys(imageCache).length}`);
                
                // Clear caches
                Object.keys(directoryCache).forEach(key => delete directoryCache[key]);
                Object.keys(imageCache).forEach(key => delete imageCache[key]);
                
                console.log('Caches cleared successfully');
            });
        }
    });
}

function handleTreeItemClick(event) {
    // Prevent the default action
    event.preventDefault();
    
    // Remove selected class from all items
    document.querySelectorAll('.tree-toggle').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Add selected class to clicked item
    event.currentTarget.classList.add('selected');
    
    // Get the path of the clicked directory
    const treeItem = event.currentTarget.closest('.tree-item');
    const path = treeItem.getAttribute('data-path');
    
    // Load images for this directory
    loadDirectoryImages(path);
}

function loadDirectoryContents(path, container) {
    // Show loading indicator
    container.innerHTML = '<li class="loading">Loading...</li>';
    
    // Check if we have this directory in cache
    if (directoryCache[path]) {
        console.log(`Loading directory ${path} from cache`);
        renderDirectoryContents(directoryCache[path], container, path);
        return;
    }
    
    // Fetch directory contents
    fetch(`/get_directory_structure?directory=${encodeURIComponent(path)}`)
        .then(response => response.json())
        .then(data => {
            // Clear loading indicator
            container.innerHTML = '';
            
            // Find the directory in the returned data
            let directory = null;
            for (const dir of data) {
                if (dir.path === path) {
                    directory = dir;
                    break;
                }
                
                // Check nested directories
                const findNestedDir = (dirs, targetPath) => {
                    for (const d of dirs) {
                        if (d.path === targetPath) {
                            return d;
                        }
                        if (d.children) {
                            const found = findNestedDir(d.children, targetPath);
                            if (found) return found;
                        }
                    }
                    return null;
                };
                
                directory = findNestedDir(dir.children || [], path);
                if (directory) break;
            }
            
            // Store in cache
            if (directory && directory.children) {
                directoryCache[path] = directory;
                console.log(`Cached directory ${path}`);
            }
            
            renderDirectoryContents(directory, container, path);
        })
        .catch(error => {
            console.error('Error loading directory contents:', error);
            container.innerHTML = '<li class="error">Error loading directory contents</li>';
        });
}

function renderDirectoryContents(directory, container, path) {
    // Clear container
    container.innerHTML = '';
    
    if (directory && directory.children) {
        // Add child directories to the tree
        directory.children.forEach(child => {
            if (child.type === 'directory') {
                const li = document.createElement('li');
                li.className = 'tree-item';
                li.setAttribute('data-path', child.path);
                
                // Create header div to contain toggle and delete button
                const headerDiv = document.createElement('div');
                headerDiv.className = 'tree-item-header';
                
                const span = document.createElement('span');
                span.className = 'tree-toggle';
                span.innerHTML = `<i class="fas fa-folder"></i> ${child.name}`;
                span.addEventListener('click', function(e) {
                    // Handle both expanding/collapsing and selection
                    handleTreeItemClick(e);
                    
                    // Manually trigger the expand/collapse functionality
                    const treeItem = this.closest('.tree-item');
                    treeItem.classList.toggle('expanded');
                    
                    // Toggle folder icon
                    const folderIcon = this.querySelector('i.fas');
                    if (folderIcon) {
                        if (treeItem.classList.contains('expanded')) {
                            folderIcon.classList.remove('fa-folder');
                            folderIcon.classList.add('fa-folder-open');
                        } else {
                            folderIcon.classList.remove('fa-folder-open');
                            folderIcon.classList.add('fa-folder');
                        }
                    }
                    
                    // If children container is empty, load the contents
                    const childrenContainer = treeItem.querySelector('.tree-children');
                    if (childrenContainer && childrenContainer.children.length === 0) {
                        const path = treeItem.getAttribute('data-path');
                        loadDirectoryContents(path, childrenContainer);
                    }
                });
                
                headerDiv.appendChild(span);
                
                const ul = document.createElement('ul');
                ul.className = 'tree-children';
                
                li.appendChild(headerDiv);
                li.appendChild(ul);
                container.appendChild(li);
            }
        });
        
        // If no directories were found, don't show any message
        // Just leave the container empty
    } else {
        container.innerHTML = '<li class="error">Failed to load directory contents</li>';
    }
}

function loadDirectoryImages(path) {
    const gallery = document.getElementById('image-gallery');
    
    // Reset pagination to first page when loading a new directory
    currentPage = 1;
    
    // Show loading indicator
    gallery.innerHTML = '<div class="gallery-placeholder"><i class="fas fa-spinner fa-spin"></i><p>Loading images...</p></div>';
    
    // Check if we have these images in cache
    if (imageCache[path]) {
        console.log(`Loading images for ${path} from cache`);
        renderImages(imageCache[path], gallery);
        return;
    }
    
    // Fetch images for the directory
    fetch(`/get_directory_images?directory=${encodeURIComponent(path)}`)
        .then(response => response.json())
        .then(images => {
            console.log(`Received ${images.length} images from server for ${path}`);
            
            // Debug: Log all received images
            console.log('Raw images from server:');
            images.forEach((img, i) => {
                console.log(`[${i}] ${img.name} (${img.path})`);
            });
            
            // Add index property to each image for debugging
            const processedImages = images.map((img, idx) => ({
                ...img,
                index: idx, // Add index for debugging
                originalIndex: idx // Keep track of original position
            }));
            
            // Store in cache - but we'll process them in renderImages
            imageCache[path] = processedImages;
            console.log(`Cached ${processedImages.length} images for ${path}`);
            
            // Log the image collection for debugging
            logImageCollection();
            
            renderImages(processedImages, gallery);
        })
        .catch(error => {
            console.error('Error loading images:', error);
            gallery.innerHTML = '<div class="gallery-placeholder"><i class="fas fa-exclamation-circle"></i><p>Error loading images</p></div>';
            updatePaginationControls(0, 0);
        });
}

function renderImages(images, gallery) {
    // Sort images first
    const sortedImages = sortImages(images, currentSortMethod);
    
    // CRITICAL FIX: Check for duplicate images that might cause the skipping issue
    console.log('Checking for duplicate images...');
    const imageMap = new Map();
    const validImages = [];
    
    // First pass: build a map of all images by their path to detect duplicates
    sortedImages.forEach((img, idx) => {
        if (!imageMap.has(img.path)) {
            imageMap.set(img.path, { image: img, indices: [idx] });
            validImages.push(img);
        } else {
            // This is a duplicate image
            imageMap.get(img.path).indices.push(idx);
            console.log(`Duplicate image detected: ${img.name} at indices ${imageMap.get(img.path).indices.join(', ')}`);
        }
    });
    
    console.log(`Original images: ${sortedImages.length}, After removing duplicates: ${validImages.length}`);
    
    // Store the deduplicated images for pagination
    currentImages = validImages;
    
    if (currentImages.length === 0) {
        gallery.innerHTML = '<div class="gallery-placeholder"><i class="fas fa-images"></i><p>No images found in this directory</p></div>';
        updatePaginationControls(0, 0);
        // Reset selected image when no images
        selectedImageIndex = -1;
        return;
    }
    
    // Log the final processed images
    console.log('Final processed image collection:');
    currentImages.forEach((img, i) => {
        console.log(`[${i}] ${img.name}`);
    });
    
    // Calculate pagination
    totalPages = Math.ceil(currentImages.length / imagesPerPage);
    if (currentPage > totalPages) {
        currentPage = 1;
    }
    
    // Update pagination controls
    updatePaginationControls(currentImages.length, totalPages);
    
    // Reset selected image when changing pages
    // selectedImageIndex = -1;
    
    // Reset grid columns calculation when gallery content changes
    gridColumns = 0;
    
    // Use our helper function to render the gallery for the current page
    renderGalleryForPage(currentPage, selectedImageIndex);
    
    // After rendering, calculate grid dimensions
    setTimeout(calculateGridDimensions, 100);
}

// Function to change the current page
function changePage(page) {
    // Make sure we have the latest totalPages value
    const currentTotalPages = Math.ceil(currentImages.length / imagesPerPage);
    
    if (page < 1 || page > currentTotalPages || page === currentPage) {
        console.warn(`Invalid page change request: ${page} (current: ${currentPage}, total: ${currentTotalPages})`);
        return 0;
    }
    
    console.log(`Changing page from ${currentPage} to ${page} (total pages: ${currentTotalPages})`);
    
    currentPage = page;
    const imagesRendered = renderGalleryForPage(page);
    
    // Update pagination UI
    const pageLinks = document.querySelectorAll('.pagination a');
    pageLinks.forEach(link => {
        const linkPage = parseInt(link.getAttribute('data-page'));
        if (linkPage === page) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
    
    // Update the prev/next buttons state
    updatePaginationButtonsState(currentTotalPages);
    
    console.log(`Changed to page ${page}, rendered ${imagesRendered} images`);
    return imagesRendered;
}

function initPaginationControls() {
    // Add event listeners for pagination controls
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const itemsPerPageSelect = document.getElementById('items-per-page');
    const sortBySelect = document.getElementById('sort-by');
    
    // Previous page button
    prevPageBtn.addEventListener('click', function() {
        if (currentPage > 1) {
            changePage(currentPage - 1);
        }
    });
    
    // Next page button
    nextPageBtn.addEventListener('click', function() {
        if (currentPage < totalPages) {
            changePage(currentPage + 1);
        }
    });
    
    // Items per page select
    itemsPerPageSelect.addEventListener('change', function() {
        imagesPerPage = parseInt(this.value);
        currentPage = 1; // Reset to first page when changing items per page
        renderImages(currentImages, document.getElementById('image-gallery'));
        console.log(`Changed to ${imagesPerPage} images per page`);
    });
    
    // Sort by select
    sortBySelect.addEventListener('change', function() {
        currentSortMethod = this.value;
        currentPage = 1; // Reset to first page when changing sort order
        renderImages(currentImages, document.getElementById('image-gallery'));
        console.log(`Changed sort order to ${currentSortMethod}`);
    });
    
    // Set initial values from selects
    imagesPerPage = parseInt(itemsPerPageSelect.value);
    currentSortMethod = sortBySelect.value;
    console.log(`Initialized pagination with ${imagesPerPage} images per page`);
    console.log(`Initialized sorting with ${currentSortMethod}`);
}

function updatePaginationControls(totalImages, pages) {
    const paginationStatus = document.getElementById('pagination-status');
    
    // Update status text
    if (totalImages === 0) {
        paginationStatus.textContent = 'No images';
    } else {
        const startIndex = (currentPage - 1) * imagesPerPage + 1;
        const endIndex = Math.min(startIndex + imagesPerPage - 1, totalImages);
        paginationStatus.textContent = `Showing ${startIndex}-${endIndex} of ${totalImages} images`;
    }
    
    // Store the current total pages value in a global variable for navigation
    totalPages = pages;
    
    // Update the prev/next buttons state
    updatePaginationButtonsState(pages, totalImages);
    
    console.log(`Updated pagination controls: ${totalImages} images, ${pages} pages, current page: ${currentPage}`);
}

// Separate function to update pagination buttons state
function updatePaginationButtonsState(pages, totalImages = null) {
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    
    if (!prevPageBtn || !nextPageBtn) {
        console.error('Pagination buttons not found');
        return;
    }
    
    // If totalImages is not provided, use the current images length
    const imageCount = totalImages !== null ? totalImages : currentImages.length;
    
    // Update buttons state
    prevPageBtn.disabled = currentPage <= 1 || imageCount === 0;
    nextPageBtn.disabled = currentPage >= pages || imageCount === 0;
    
    console.log(`Updated pagination buttons: prev ${prevPageBtn.disabled ? 'disabled' : 'enabled'}, next ${nextPageBtn.disabled ? 'disabled' : 'enabled'}`);
}

function sortImages(images, sortMethod) {
    // Create a copy of the images array to avoid modifying the original
    const sortedImages = [...images];
    
    // Sort based on the selected method
    switch (sortMethod) {
        case 'date-desc': // Date created, newest first
            return sortedImages.sort((a, b) => b.created - a.created);
            
        case 'date-asc': // Date created, oldest first
            return sortedImages.sort((a, b) => a.created - b.created);
            
        case 'name-asc': // Name, A-Z
            return sortedImages.sort((a, b) => a.name.localeCompare(b.name));
            
        case 'name-desc': // Name, Z-A
            return sortedImages.sort((a, b) => b.name.localeCompare(a.name));
            
        default: // Default to date-desc if unknown sort method
            console.warn(`Unknown sort method: ${sortMethod}, defaulting to date-desc`);
            return sortedImages.sort((a, b) => b.created - a.created);
    }
}

// Debug function to log the image collection
function logImageCollection() {
    if (!currentImages || currentImages.length === 0) {
        console.log('No images in current collection');
        return;
    }
    
    console.log(`Current image collection has ${currentImages.length} images:`);
    currentImages.forEach((img, idx) => {
        console.log(`[${idx}] ${img.name}`);
    });
}

// Progress dialog functions
let scanTaskId = null;
let scanInterval = null;
let scanStartTime = 0;

function showProgressDialog(directoryPath) {
    const modal = document.getElementById('progress-modal');
    const progressBar = document.getElementById('progress-bar');
    const progressStatus = document.getElementById('progress-status');
    const progressDetails = document.getElementById('progress-details');
    const fileCount = document.getElementById('file-count');
    const elapsedTime = document.getElementById('elapsed-time');
    
    // Reset progress elements
    progressBar.style.width = '0%';
    progressStatus.textContent = 'Scanning directory...';
    progressDetails.textContent = `Path: ${directoryPath}`;
    fileCount.textContent = '0';
    elapsedTime.textContent = '0s';
    
    // Show the modal
    modal.style.display = 'block';
    scanStartTime = Date.now();
}

function hideProgressDialog() {
    const modal = document.getElementById('progress-modal');
    modal.style.display = 'none';
    
    // Clear the polling interval if it exists
    if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
    }
}

function updateProgressDialog(data) {
    const progressBar = document.getElementById('progress-bar');
    const progressStatus = document.getElementById('progress-status');
    const progressDetails = document.getElementById('progress-details');
    const fileCount = document.getElementById('file-count');
    const elapsedTime = document.getElementById('elapsed-time');
    
    // Update progress bar
    progressBar.style.width = `${data.progress}%`;
    
    // Update status text based on scan status
    if (data.status === 'scanning') {
        progressStatus.textContent = `Scanning directory... ${data.progress}%`;
    } else if (data.status === 'complete') {
        progressStatus.textContent = 'Scan complete!';
    } else if (data.status === 'error') {
        progressStatus.textContent = 'Error scanning directory';
        progressDetails.textContent = data.error || 'Unknown error';
    }
    
    // Update details
    const relativePath = data.current_path.replace(data.directory, '');
    progressDetails.textContent = relativePath ? `Scanning: ${relativePath}` : `Scanning: ${data.directory}`;
    
    // Update file count
    fileCount.textContent = `${data.files_found} files (${data.images_found} images)`;
    
    // Update elapsed time
    const elapsed = Math.round(data.elapsed_time);
    elapsedTime.textContent = formatTime(elapsed);
    
    // If scan is complete, handle completion
    if (data.status === 'complete') {
        handleScanComplete(data);
    }
}

function formatTime(seconds) {
    if (seconds < 60) {
        return `${seconds}s`;
    } else {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    }
}

function scanDirectory(directoryPath) {
    // Create form data
    const formData = new FormData();
    formData.append('directory', directoryPath);
    
    // Start the scan
    fetch('/scan_directory', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'started') {
            scanTaskId = data.task_id;
            console.log(`Scan started with task ID: ${scanTaskId}`);
            
            // Poll for updates
            scanInterval = setInterval(() => pollScanStatus(scanTaskId), 500);
        } else {
            console.error('Failed to start scan:', data);
            updateProgressDialog({
                status: 'error',
                progress: 0,
                error: data.message || 'Failed to start scan',
                files_found: 0,
                images_found: 0,
                current_path: directoryPath,
                elapsed_time: 0,
                directory: directoryPath
            });
        }
    })
    .catch(error => {
        console.error('Error starting scan:', error);
        updateProgressDialog({
            status: 'error',
            progress: 0,
            error: 'Network error: ' + error.message,
            files_found: 0,
            images_found: 0,
            current_path: directoryPath,
            elapsed_time: 0,
            directory: directoryPath
        });
    });
}

function pollScanStatus(taskId) {
    fetch(`/scan_status/${taskId}`)
        .then(response => response.json())
        .then(data => {
            updateProgressDialog(data);
            
            // If scan is complete or errored, stop polling
            if (data.status === 'complete' || data.status === 'error') {
                clearInterval(scanInterval);
                scanInterval = null;
            }
        })
        .catch(error => {
            console.error('Error polling scan status:', error);
            // Don't stop polling on network errors, it might be temporary
        });
}

function handleScanComplete(data) {
    console.log('Scan completed:', data);
    
    // After 2 seconds, submit the form to actually add the directory
    setTimeout(() => {
        const form = document.getElementById('add-directory-form');
        if (form) {
            // Create a new form to submit directly to the server
            const directSubmitForm = document.createElement('form');
            directSubmitForm.method = 'POST';
            directSubmitForm.action = form.action;
            
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'directory';
            input.value = data.directory;
            
            directSubmitForm.appendChild(input);
            document.body.appendChild(directSubmitForm);
            directSubmitForm.submit();
        }
    }, 2000);
}

// Image grid keyboard navigation
let selectedImageIndex = -1;
let gridColumns = 0;

function initKeyboardNavigation() {
    // Add event listener for keyboard navigation
    document.addEventListener('keydown', handleKeyNavigation);
    
    // Add click handler to select images
    document.addEventListener('click', function(event) {
        const imageItem = event.target.closest('.image-item');
        if (imageItem) {
            selectImage(Array.from(document.querySelectorAll('.image-item')).indexOf(imageItem));
        }
    });
}

// Track if the image viewer is open
let imageViewerOpen = false;

function handleKeyNavigation(event) {
    // If image viewer is open, handle its navigation
    if (imageViewerOpen) {
        handleImageViewerKeyboard(event);
        return;
    }
    
    const gallery = document.getElementById('image-gallery');
    if (!gallery) return;
    
    const images = Array.from(gallery.querySelectorAll('.image-item'));
    if (images.length === 0) return;
    
    // Handle Enter key to open the selected image in the viewer
    if (event.key === 'Enter') {
        if (selectedImageIndex >= 0 && selectedImageIndex < images.length) {
            const selectedImage = images[selectedImageIndex];
            const absoluteIndex = parseInt(selectedImage.getAttribute('data-absolute-index'), 10);
            
            if (!isNaN(absoluteIndex) && absoluteIndex >= 0 && absoluteIndex < currentImages.length) {
                console.log(`Opening image viewer for image at index ${selectedImageIndex} (absolute index: ${absoluteIndex})`);
                
                // Show the image viewer modal
                const modal = document.getElementById('image-viewer-modal');
                if (modal) {
                    modal.style.display = 'block';
                    imageViewerOpen = true;
                    
                    // Disable scrolling on the body
                    document.body.style.overflow = 'hidden';
                    
                    // Update the image viewer with the selected image
                    updateImageViewer(absoluteIndex);
                }
            }
            event.preventDefault();
        }
        return;
    }
    
    // Handle favorite and delete actions
    if (event.key === 'f' || event.key === 'F') {
        // Favorite the selected image
        if (selectedImageIndex >= 0 && selectedImageIndex < images.length) {
            const selectedImage = images[selectedImageIndex];
            const absoluteIndex = parseInt(selectedImage.getAttribute('data-absolute-index'), 10);
            if (!isNaN(absoluteIndex) && absoluteIndex >= 0 && absoluteIndex < currentImages.length) {
                const image = currentImages[absoluteIndex];
                console.log(`Favoriting image at index ${selectedImageIndex} (absolute index: ${absoluteIndex}): ${image.name}`);
                favoriteImage(image.path);
                event.preventDefault();
            }
        }
        return;
    }
    
    if (event.key === 'Delete' || event.key === 'Backspace') {
        // Delete the selected image
        if (selectedImageIndex >= 0 && selectedImageIndex < images.length) {
            const selectedImage = images[selectedImageIndex];
            const absoluteIndex = parseInt(selectedImage.getAttribute('data-absolute-index'), 10);
            if (!isNaN(absoluteIndex) && absoluteIndex >= 0 && absoluteIndex < currentImages.length) {
                const image = currentImages[absoluteIndex];
                if (confirm(`Are you sure you want to move "${image.name}" to trash?`)) {
                    console.log(`Deleting image at index ${selectedImageIndex} (absolute index: ${absoluteIndex}): ${image.name}`);
                    deleteImage(image.path);
                    event.preventDefault();
                }
            }
        }
        return;
    }
    
    // Only process navigation keys for grid navigation
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
        return;
    }
    
    // Calculate grid dimensions if not already done
    if (gridColumns === 0) {
        calculateGridDimensions();
    }
    
    // If no image is selected, select the first one
    if (selectedImageIndex === -1 && images.length > 0) {
        selectImage(0);
        return;
    }
    
    // Make sure we have the latest totalPages value
    const currentTotalPages = Math.ceil(currentImages.length / imagesPerPage);
    
    // Calculate new index based on arrow key
    let newIndex = selectedImageIndex;
    let newPage = currentPage;
    let needPageChange = false;
    
    console.log(`Key navigation: current page ${currentPage}, total pages ${currentTotalPages}, selected index ${selectedImageIndex}, grid columns ${gridColumns}`);
    
    switch (event.key) {
        case 'ArrowLeft':
            if (selectedImageIndex % gridColumns > 0) {
                // Move left within the current page
                newIndex = selectedImageIndex - 1;
            } else if (selectedImageIndex === 0 && currentPage > 1) {
                // Only go to previous page if we're at the very first image of the current page
                newPage = currentPage - 1;
                needPageChange = true;
                // Go to the last image of the previous page
                newIndex = imagesPerPage - 1;
                console.log(`Moving to previous page ${newPage}, target index ${newIndex}`);
            } else if (selectedImageIndex % gridColumns === 0 && selectedImageIndex > 0) {
                // If at the start of a row (but not the first row), move to the end of the previous row
                const prevRowEnd = Math.floor(selectedImageIndex / gridColumns - 1) * gridColumns + (gridColumns - 1);
                if (prevRowEnd >= 0 && prevRowEnd < images.length) {
                    newIndex = prevRowEnd;
                }
            }
            break;
            
        case 'ArrowRight':
            if (selectedImageIndex % gridColumns < gridColumns - 1 && selectedImageIndex < images.length - 1) {
                // Move right within the current page
                newIndex = selectedImageIndex + 1;
            } else if (selectedImageIndex === images.length - 1 && currentPage < currentTotalPages) {
                // Only go to next page if we're at the very last image of the current page
                newPage = currentPage + 1;
                needPageChange = true;
                // Set to the first image of the next page
                newIndex = 0;
                console.log(`Moving to next page ${newPage}, target index ${newIndex}`);
            } else if (selectedImageIndex % gridColumns === gridColumns - 1) {
                // If at the end of a row (but not the last row), move to the beginning of the next row
                const nextRowStart = Math.floor(selectedImageIndex / gridColumns + 1) * gridColumns;
                if (nextRowStart < images.length) {
                    newIndex = nextRowStart;
                }
            }
            break;
            
        case 'ArrowUp':
            if (selectedImageIndex >= gridColumns) {
                // Move up within the current page
                newIndex = selectedImageIndex - gridColumns;
            } else if (currentPage > 1 && selectedImageIndex < gridColumns) {
                // Only go to previous page if we're in the first row
                // Move to the bottom of the previous page
                newPage = currentPage - 1;
                needPageChange = true;
                // Try to maintain the same column position
                newIndex = Math.min(
                    imagesPerPage - gridColumns + (selectedImageIndex % gridColumns),
                    imagesPerPage - 1
                );
                console.log(`Moving up to previous page ${newPage}, target index ${newIndex}`);
            }
            break;
            
        case 'ArrowDown':
            if (selectedImageIndex + gridColumns < images.length) {
                // Move down within the current page
                newIndex = selectedImageIndex + gridColumns;
            } else if (currentPage < currentTotalPages) {
                // Only go to the next page if we're in the last row
                const lastRowStart = Math.floor((images.length - 1) / gridColumns) * gridColumns;
                if (selectedImageIndex >= lastRowStart) {
                    // Move to the top of the next page
                    newPage = currentPage + 1;
                    needPageChange = true;
                    // Try to maintain the same column position
                    newIndex = selectedImageIndex % gridColumns;
                    console.log(`Moving down to next page ${newPage}, target index ${newIndex}`);
                }
            }
            break;
            
        case 'PageUp':
            if (currentPage > 1) {
                // Move to the previous page
                newPage = currentPage - 1;
                needPageChange = true;
                // Try to maintain the same position
                newIndex = Math.min(selectedImageIndex, imagesPerPage - 1);
            }
            break;
            
        case 'PageDown':
            if (currentPage < currentTotalPages) {
                // Move to the next page
                newPage = currentPage + 1;
                needPageChange = true;
                // Try to maintain the same position
                newIndex = Math.min(selectedImageIndex, imagesPerPage - 1);
            }
            break;
            
        case 'Home':
            if (currentPage > 1) {
                // Move to the first page
                newPage = 1;
                needPageChange = true;
                newIndex = 0;
            } else {
                // Move to the first image on the current page
                newIndex = 0;
            }
            break;
            
        case 'End':
            if (currentPage < currentTotalPages) {
                // Move to the last page
                newPage = currentTotalPages;
                needPageChange = true;
                // Select the last image on the last page
                const imagesOnLastPage = currentImages.length % imagesPerPage || imagesPerPage;
                newIndex = imagesOnLastPage - 1;
            } else {
                // Move to the last image on the current page
                newIndex = images.length - 1;
            }
            break;
    }
    
    // Handle page change if needed
    if (needPageChange) {
        console.log(`Changing page from ${currentPage} to ${newPage}, target index will be ${newIndex}`);
        
        // Store the target index for after page change
        const targetIndex = newIndex;
        
        // Change to the new page
        changePage(newPage);
        
        // After the page is rendered, select the appropriate image
        setTimeout(() => {
            const newImages = Array.from(document.querySelectorAll('.image-item'));
            if (newImages.length > 0) {
                // Make sure the index is valid for the new page
                const validIndex = Math.min(targetIndex, newImages.length - 1);
                console.log(`Page changed, selecting index ${validIndex} out of ${newImages.length} images`);
                selectImage(validIndex);
                
                // Ensure the selected image is visible
                if (newImages[validIndex]) {
                    newImages[validIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            } else {
                console.warn('No images found after page change');
            }
        }, 200); // Increased timeout to ensure page rendering is complete
        
        event.preventDefault();
        return;
    }
    
    // Select the new image if index changed (within the same page)
    if (newIndex !== selectedImageIndex) {
        selectImage(newIndex);
        
        // Ensure the selected image is visible
        images[newIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        // Prevent default scrolling behavior
        event.preventDefault();
    }
}

function handleImageViewerKeyboard(event) {
    // Handle keyboard navigation in the image viewer
    switch (event.key) {
        case 'Escape':
            closeImageViewer();
            event.preventDefault();
            break;
            
        case 'i':
        case 'I':
            // Toggle image info visibility
            toggleImageInfo();
            event.preventDefault();
            break;
            
        case 'ArrowLeft':
            console.log('Left arrow key pressed');
            if (!isNavigating) {
                navigateImage('prev');
            }
            event.preventDefault();
            break;
            
        case 'ArrowRight':
            console.log('Right arrow key pressed');
            if (!isNavigating) {
                navigateImage('next');
            }
            event.preventDefault();
            break;
            
        case 'Delete':
        case 'Backspace':
            console.log('Delete key pressed');
            // Trigger delete action for current image
            const deleteBtn = document.getElementById('delete-image-viewer');
            if (deleteBtn && currentImages[currentViewerIndex]) {
                // Simulate a click on the delete button
                const currentImage = currentImages[currentViewerIndex];
                if (confirm(`Are you sure you want to move "${currentImage.name}" to trash?`)) {
                    const imagePath = currentImage.path;
                    const nextIndex = currentViewerIndex < currentImages.length - 1 ? currentViewerIndex + 1 : currentViewerIndex - 1;
                    
                    deleteImage(imagePath, function() {
                        // If there are no more images, close the viewer
                        if (currentImages.length === 0) {
                            closeImageViewer();
                            return;
                        }
                        
                        // Navigate to the next image (or previous if at the end)
                        if (nextIndex >= 0) {
                            updateImageViewer(nextIndex);
                        } else {
                            // No images left in this direction, close the viewer
                            closeImageViewer();
                        }
                    });
                }
            }
            event.preventDefault();
            break;
            
        case 'Home':
            navigateImage('first');
            event.preventDefault();
            break;
            
        case 'End':
            navigateImage('last');
            event.preventDefault();
            break;
    }
}

function selectImage(index) {
    const gallery = document.getElementById('image-gallery');
    if (!gallery) return;
    
    const images = gallery.querySelectorAll('.image-item');
    if (index < 0 || index >= images.length) return;
    
    // Remove selected class from all images
    images.forEach(img => img.classList.remove('selected'));
    
    // Add selected class to the target image
    images[index].classList.add('selected');
    selectedImageIndex = index;
    
    console.log(`Selected image at index ${index}`);
}

function calculateGridDimensions() {
    const gallery = document.getElementById('image-gallery');
    if (!gallery || gallery.children.length === 0) return;
    
    // Get the first image item
    const firstImage = gallery.querySelector('.image-item');
    if (!firstImage) return;
    
    // Calculate how many images fit in a row
    const imageWidth = firstImage.offsetWidth;
    const galleryWidth = gallery.offsetWidth;
    
    gridColumns = Math.floor(galleryWidth / imageWidth);
    if (gridColumns < 1) gridColumns = 1; // Ensure at least 1 column
    
    console.log(`Grid dimensions calculated: ${gridColumns} columns`);
}

// Image Viewer Functions
let currentViewerIndex = -1;
let isNavigating = false; // Flag to prevent multiple rapid navigation calls
let showImageInfo = false; // Flag to track if image info is visible

function initImageViewer() {
    // Set up image viewer event listeners
    const modal = document.getElementById('image-viewer-modal');
    const closeBtn = modal.querySelector('.close');
    const prevBtn = document.getElementById('prev-image');
    const nextBtn = document.getElementById('next-image');
    const deleteBtn = document.getElementById('delete-image-viewer');
    const trashBtn = document.getElementById('trash-image-button');
    const favoriteBtn = document.getElementById('favorite-image-button');
    const favoriteViewerBtn = document.getElementById('favorite-image-viewer');
    
    // Set data attributes for the favorite buttons
    if (favoriteBtn) {
        favoriteBtn.setAttribute('data-path', '');
    }
    
    if (favoriteViewerBtn) {
        favoriteViewerBtn.setAttribute('data-path', '');
    }
    
    // Close button event
    closeBtn.addEventListener('click', closeImageViewer);
    
    // Previous image button
    prevBtn.addEventListener('click', function() {
        navigateImage('prev');
    });
    
    // Next image button
    nextBtn.addEventListener('click', function() {
        navigateImage('next');
    });
    
    // Function to handle image deletion
    const handleImageDelete = function() {
        // Make sure we're using the correct index
        if (currentViewerIndex < 0 || currentViewerIndex >= currentImages.length) {
            console.error(`Invalid currentViewerIndex: ${currentViewerIndex}, cannot delete image`);
            return;
        }
        
        const currentImage = currentImages[currentViewerIndex];
        if (currentImage && confirm(`Are you sure you want to move "${currentImage.name}" to trash?`)) {
            const imagePath = currentImage.path;
            
            // Determine which image to show next
            const nextIndex = currentViewerIndex < currentImages.length - 1 ? currentViewerIndex + 1 : currentViewerIndex - 1;
            
            console.log(`Deleting image at index ${currentViewerIndex}: ${currentImage.name}, next index will be ${nextIndex}`);
            
            deleteImage(imagePath, function() {
                // If there are no more images, close the viewer
                if (currentImages.length === 0) {
                    closeImageViewer();
                    return;
                }
                
                // Navigate to the next image (or previous if at the end)
                if (nextIndex >= 0) {
                    updateImageViewer(nextIndex);
                } else {
                    // No images left in this direction, close the viewer
                    closeImageViewer();
                }
            });
        }
    };
    
    // Function to handle toggling image favorite status
    const handleImageFavorite = function() {
        if (currentViewerIndex === null || currentViewerIndex < 0 || currentViewerIndex >= currentImages.length) {
            console.error(`Invalid currentViewerIndex: ${currentViewerIndex}, cannot toggle favorite status`);
            return;
        }

        const currentImage = currentImages[currentViewerIndex];
        const imagePath = currentImage.path;

        if (imagePath) {
            console.log(`Toggling favorite status for image: ${currentImage.name}`);
            // Update the data-path attribute for the favorite buttons
            if (favoriteBtn) {
                favoriteBtn.setAttribute('data-path', imagePath);
            }
            
            if (favoriteViewerBtn) {
                favoriteViewerBtn.setAttribute('data-path', imagePath);
            }
            
            // Call the favorite function
            favoriteImage(imagePath);
        }
    };

    // Delete button in the info panel
    if (deleteBtn) {
        deleteBtn.addEventListener('click', handleImageDelete);
    }
    
    // New trash button at the bottom right of the image
    if (trashBtn) {
        trashBtn.addEventListener('click', handleImageDelete);
    }
    
    // Favorite button in the info panel
    if (favoriteViewerBtn) {
        favoriteViewerBtn.addEventListener('click', handleImageFavorite);
    }
    
    // Favorite button at the bottom right of the image
    if (favoriteBtn) {
        favoriteBtn.addEventListener('click', handleImageFavorite);
    }
    
    console.log('Image viewer initialized with keyboard navigation');
}

// Function to close the image viewer
function closeImageViewer() {
    console.log('Closing image viewer');
    
    // Hide the modal
    const modal = document.getElementById('image-viewer-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Reset the viewer state
    imageViewerOpen = false;
    currentViewerIndex = -1;
    
    // Re-enable scrolling on the body
    document.body.style.overflow = 'auto';
    
    console.log('Image viewer closed');
}

// Update image viewer with the current image
function updateImageViewer(index) {
    if (index === null || index < 0 || index >= currentImages.length) {
        console.error(`Invalid index: ${index}`);
        return;
    }

    currentViewerIndex = index;
    const currentImage = currentImages[index];
    const imagePath = currentImage.path;
    
    // Update the image source
    const imageElement = document.getElementById('viewer-image');
    if (imageElement) {
        imageElement.src = `/image?path=${encodeURIComponent(imagePath)}`;
        imageElement.alt = currentImage.name;
    }

    // Update image info
    const imageInfoName = document.getElementById('image-info-name');
    if (imageInfoName) {
        imageInfoName.textContent = currentImage.name;
    }
    
    // Update the data-path attribute for the favorite buttons
    const favoriteBtn = document.getElementById('favorite-image-button');
    const favoriteViewerBtn = document.getElementById('favorite-image-viewer');
    
    if (favoriteBtn) {
        favoriteBtn.setAttribute('data-path', imagePath);
    }
    
    if (favoriteViewerBtn) {
        favoriteViewerBtn.setAttribute('data-path', imagePath);
    }
    
    // Check if this image is favorited and update the buttons
    checkImageFavorited(imagePath, (isFavorited) => {
        updateFavoriteButtonAppearance(favoriteBtn, isFavorited);
        updateFavoriteButtonAppearance(favoriteViewerBtn, isFavorited);
    });

    // Update navigation buttons
    updateNavigationButtons();

    // Update the viewer title
    const viewerTitle = document.getElementById('image-viewer-title');
    if (viewerTitle) {
        viewerTitle.textContent = `${index + 1} / ${currentImages.length}`;
    }
    
    console.log(`Updated image viewer to show image at index ${index}, currentViewerIndex set to ${currentViewerIndex}`);
}

function navigateImage(direction) {
    if (!currentImages || currentImages.length === 0 || isNavigating) return;
    
    // Set the navigating flag to prevent multiple rapid calls
    isNavigating = true;
    console.log(`NAVIGATION STARTED: ${direction}`);
    
    // Determine the total number of images
    const totalImages = currentImages.length;
    
    // Reset the navigating flag after a short delay (do this early to ensure it gets reset)
    setTimeout(() => {
        isNavigating = false;
        console.log('NAVIGATION COMPLETED - Ready for next navigation');
    }, 200); // 200ms debounce
    
    // Log the current state for debugging
    console.log(`Before navigation: currentViewerIndex=${currentViewerIndex}`);
    console.log(`Current images array length: ${currentImages.length}`);
    
    // Log the current image and its neighbors
    if (currentImages[currentViewerIndex]) {
        console.log(`Current image: [${currentViewerIndex}] ${currentImages[currentViewerIndex].name}`);
    }
    if (currentViewerIndex > 0 && currentImages[currentViewerIndex - 1]) {
        console.log(`Previous image: [${currentViewerIndex - 1}] ${currentImages[currentViewerIndex - 1].name}`);
    }
    if (currentViewerIndex < totalImages - 1 && currentImages[currentViewerIndex + 1]) {
        console.log(`Next image: [${currentViewerIndex + 1}] ${currentImages[currentViewerIndex + 1].name}`);
    }
    
    // Store the current index
    let newIndex = currentViewerIndex;
    
    // Determine the new index based on direction
    switch (direction) {
        case 'prev':
            // Always move exactly one image backward
            if (currentViewerIndex > 0) {
                newIndex = currentViewerIndex - 1;
            }
            break;
            
        case 'next':
            // Always move exactly one image forward
            if (currentViewerIndex < totalImages - 1) {
                newIndex = currentViewerIndex + 1;
            }
            break;
            
        case 'first':
            newIndex = 0;
            break;
            
        case 'last':
            newIndex = totalImages - 1;
            break;
    }
    
    // Log the new index for debugging
    console.log(`Navigation direction: ${direction}, new index=${newIndex}`);
    
    if (newIndex !== currentViewerIndex) {
        // Get the image from the collection
        const image = currentImages[newIndex];
        if (!image) {
            console.error(`Image at index ${newIndex} not found!`);
            return;
        }
        
        // Update viewer elements directly with the new index
        updateImageViewer(newIndex);
        
        // Calculate which page this image is on for the grid view
        const newPage = Math.floor(newIndex / imagesPerPage) + 1;
        const newRelativeIndex = newIndex % imagesPerPage;
        
        // If we need to change page in the grid view
        if (newPage !== currentPage) {
            changePage(newPage);
            // After changing page, select the correct image in the grid
            setTimeout(() => selectImage(newRelativeIndex), 100);
        } else {
            // Just update the selected image in the grid
            selectImage(newRelativeIndex);
        }
        
        console.log(`Navigated to image at index ${newIndex}`);
    }
}

// Helper function to render gallery for a specific page
function renderGalleryForPage(page, selectedIndex = -1) {
    const gallery = document.getElementById('image-gallery');
    if (!gallery || !currentImages || currentImages.length === 0) return;
    
    // Clear gallery first
    gallery.innerHTML = '';
    
    // Calculate start and end indices for this page
    const startIndex = (page - 1) * imagesPerPage;
    const endIndex = Math.min(startIndex + imagesPerPage, currentImages.length);
    
    // Get the images for this page
    const pageImages = currentImages.slice(startIndex, endIndex);
    
    // Log the images on this page for debugging
    console.log(`Rendering gallery for page ${page} (${startIndex}-${endIndex-1})`);
    pageImages.forEach((img, idx) => {
        console.log(`Page index ${idx}, absolute index ${startIndex + idx}: ${img.name}`);
    });
    
    // Render each image
    pageImages.forEach((image, idx) => {
        const absoluteIndex = startIndex + idx;
        const div = document.createElement('div');
        div.className = 'image-item';
        div.setAttribute('data-index', idx);
        div.setAttribute('data-absolute-index', absoluteIndex);
        
        if (idx === selectedIndex) {
            div.classList.add('selected');
        }
        
        // Create image element
        const img = document.createElement('img');
        img.src = image.url;
        img.alt = image.name;
        img.loading = 'lazy'; // Use lazy loading for better performance
        
        // Add click event to select the image (not open viewer)
        img.addEventListener('click', function() {
            // Get the index from the parent div
            const index = parseInt(div.getAttribute('data-index'), 10);
            if (!isNaN(index)) {
                selectImage(index);
            }
        });
        
        // Add double-click event to open the image viewer
        img.addEventListener('dblclick', function() {
            // Get the absolute index from the parent div
            const absoluteIndex = parseInt(div.getAttribute('data-absolute-index'), 10);
            
            if (!isNaN(absoluteIndex) && absoluteIndex >= 0 && absoluteIndex < currentImages.length) {
                console.log(`Opening image viewer for image at index ${idx} (absolute index: ${absoluteIndex})`);
                
                // Show the image viewer modal
                const modal = document.getElementById('image-viewer-modal');
                if (modal) {
                    modal.style.display = 'block';
                    imageViewerOpen = true;
                    
                    // Disable scrolling on the body
                    document.body.style.overflow = 'hidden';
                    
                    // Update the image viewer with the selected image
                    updateImageViewer(absoluteIndex);
                }
            }
        });
        
        // Create image info element
        const info = document.createElement('div');
        info.className = 'image-info';
        info.innerHTML = `
            <div class="image-name">${image.name}</div>
        `;
        
        // Create action buttons container
        const actionButtons = document.createElement('div');
        actionButtons.className = 'image-action-buttons';
        
        // Create favorite button
        const favoriteButton = document.createElement('button');
        favoriteButton.className = 'image-favorite-button';
        favoriteButton.title = 'Add to favorites';
        favoriteButton.setAttribute('data-path', image.path);
        favoriteButton.innerHTML = '<i class="far fa-star"></i>'; // Start with outline star
        
        // Check if this image is already favorited
        checkImageFavorited(image.path, (isFavorited) => {
            updateFavoriteButtonAppearance(favoriteButton, isFavorited);
            
            // If favorited, make sure the action buttons container is visible
            if (isFavorited) {
                actionButtons.classList.add('has-favorited');
            }
        });
        
        // Add click event to favorite button
        favoriteButton.addEventListener('click', function(e) {
            e.stopPropagation(); // Prevent opening the image viewer
            e.preventDefault();
            favoriteImage(image.path);
        });
        
        // Create delete button
        const deleteButton = document.createElement('button');
        deleteButton.className = 'image-delete-button';
        deleteButton.title = 'Move to trash';
        deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
        
        // Add click event to delete button
        deleteButton.addEventListener('click', function(e) {
            e.stopPropagation(); // Prevent opening the image viewer
            e.preventDefault();
            if (confirm(`Are you sure you want to move "${image.name}" to trash?`)) {
                deleteImage(image.path);
            }
        });
        
        // Add buttons to action buttons container
        actionButtons.appendChild(deleteButton);
        actionButtons.appendChild(favoriteButton);
        
        // Add all elements to the image item
        div.appendChild(img);
        div.appendChild(info);
        div.appendChild(actionButtons);
        gallery.appendChild(div);
    });
    
    console.log(`Rendered gallery for page ${page} with ${pageImages.length} images`);
    return pageImages.length; // Return the number of images rendered
}

function updateViewerNavigation(index, totalImages) {
    const prevBtn = document.getElementById('prev-image');
    const nextBtn = document.getElementById('next-image');
    
    prevBtn.disabled = index <= 0;
    nextBtn.disabled = index >= totalImages - 1;
    
    // Update visual state
    prevBtn.style.opacity = index <= 0 ? '0.5' : '1';
    nextBtn.style.opacity = index >= totalImages - 1 ? '0.5' : '1';
}

// Settings functions
function loadSettings() {
    fetch('/settings')
        .then(response => response.json())
        .then(data => {
            appSettings = data;
            console.log('Settings loaded:', appSettings);
            
            // Update the settings form with current values
            const trashFolderInput = document.getElementById('trash-folder');
            if (trashFolderInput) {
                trashFolderInput.value = appSettings.trash_folder || '';
            }
            
            const favoritesFolderInput = document.getElementById('favorites-folder');
            if (favoritesFolderInput) {
                favoritesFolderInput.value = appSettings.favorites_folder || '';
            }
        })
        .catch(error => {
            console.error('Error loading settings:', error);
        });
}

function saveSettings() {
    const trashFolderInput = document.getElementById('trash-folder');
    const favoritesFolderInput = document.getElementById('favorites-folder');
    if (!trashFolderInput || !favoritesFolderInput) return;
    
    const settings = {
        trash_folder: trashFolderInput.value.trim(),
        favorites_folder: favoritesFolderInput.value.trim()
    };
    
    fetch('/settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            appSettings = data.settings;
            console.log('Settings saved successfully:', appSettings);
            alert('Settings saved successfully!');
            hideSettingsModal();
        } else {
            console.error('Error saving settings:', data.error);
            alert('Error saving settings: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Error saving settings:', error);
        alert('Error saving settings: ' + error.message);
    });
}

function initSettingsModal() {
    // Settings button click handler
    const settingsButton = document.getElementById('settings-button');
    if (settingsButton) {
        settingsButton.addEventListener('click', showSettingsModal);
    }
    
    // Save settings button click handler
    const saveSettingsButton = document.getElementById('save-settings');
    if (saveSettingsButton) {
        saveSettingsButton.addEventListener('click', saveSettings);
    }
}

function showSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        // Update form with current settings
        const trashFolderInput = document.getElementById('trash-folder');
        if (trashFolderInput) {
            trashFolderInput.value = appSettings.trash_folder || '';
        }
        
        modal.style.display = 'block';
    }
}

function hideSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Delete image function
function deleteImage(imagePath, callback) {
    if (!imagePath) {
        console.error('No image path provided for deletion');
        return;
    }
    
    console.log(`Deleting image: ${imagePath}`);
    
    fetch('/delete-image', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: imagePath })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('Image deleted successfully:', data.message);
            
            // Remove the image from currentImages array
            const imageIndex = currentImages.findIndex(img => img.path === imagePath);
            if (imageIndex !== -1) {
                console.log(`Removing image from currentImages at index ${imageIndex}`);
                currentImages.splice(imageIndex, 1);
                
                // If the deleted image was before the current viewer index, adjust the index
                if (imageViewerOpen && imageIndex < currentViewerIndex) {
                    currentViewerIndex--;
                    console.log(`Adjusted currentViewerIndex to ${currentViewerIndex} after deletion`);
                }
                
                // Update pagination if needed
                if (currentImages.length === 0) {
                    // No images left
                    document.getElementById('image-gallery').innerHTML = 
                        '<div class="no-images-message"><i class="fas fa-image"></i><p>No images found in this directory</p></div>';
                    updatePaginationControls(0, 0);
                } else {
                    // Recalculate total pages
                    const newTotalPages = Math.ceil(currentImages.length / imagesPerPage);
                    
                    // If current page is now beyond total pages, go to last page
                    if (currentPage > newTotalPages) {
                        currentPage = newTotalPages;
                    }
                    
                    // Re-render the current page
                    renderGalleryForPage(currentPage);
                    updatePaginationControls(currentImages.length, newTotalPages);
                }
            }
            
            if (typeof callback === 'function') {
                callback();
            }
        } else {
            console.error('Error deleting image:', data.error);
            alert('Error deleting image: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Error deleting image:', error);
        alert('Error deleting image: ' + error.message);
    });
}

// Check if an image is favorited
function checkImageFavorited(imagePath, callback) {
    if (!imagePath) {
        console.error('No image path provided for favorite check');
        return;
    }
    
    fetch('/check-favorited', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: imagePath })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (callback && typeof callback === 'function') {
                callback(data.is_favorited);
            }
        } else {
            console.error('Error checking favorite status:', data.error);
        }
    })
    .catch(error => {
        console.error('Error checking favorite status:', error);
    });
}

// Update favorite button appearance based on favorite status
function updateFavoriteButtonAppearance(button, isFavorited) {
    if (!button) return;
    
    if (isFavorited) {
        button.classList.add('favorited');
        button.title = 'Remove from favorites';
        // Change the star to filled
        button.innerHTML = '<i class="fas fa-star"></i>';
        
        // Find parent container and add has-favorited class
        const parentContainer = button.closest('.image-action-buttons');
        if (parentContainer) {
            parentContainer.classList.add('has-favorited');
        }
    } else {
        button.classList.remove('favorited');
        button.title = 'Add to favorites';
        // Change to outline star
        button.innerHTML = '<i class="far fa-star"></i>';
        
        // Find parent container and remove has-favorited class if no other favorited buttons
        const parentContainer = button.closest('.image-action-buttons');
        if (parentContainer) {
            // Check if there are any other favorited buttons in this container
            const hasFavoritedButtons = parentContainer.querySelector('.image-favorite-button.favorited');
            if (!hasFavoritedButtons) {
                parentContainer.classList.remove('has-favorited');
            }
        }
    }
}

// Favorite image function - now toggles favorite status
function favoriteImage(imagePath) {
    if (!imagePath) {
        console.error('No image path provided for favorite toggle');
        return;
    }
    
    console.log(`Toggling favorite status for image: ${imagePath}`);
    
    fetch('/favorite-image', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: imagePath })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log(data.message);
            
            // Update UI based on whether it was favorited or unfavorited
            const wasFavorited = data.was_favorited;
            
            // Find and update all buttons for this image
            const favoriteButtons = document.querySelectorAll('.image-favorite-button');
            favoriteButtons.forEach(button => {
                const buttonImagePath = button.getAttribute('data-path');
                if (buttonImagePath === imagePath) {
                    updateFavoriteButtonAppearance(button, !wasFavorited);
                }
            });
            
            // Update viewer buttons if they exist
            const favoriteBtn = document.getElementById('favorite-image-button');
            const favoriteViewerBtn = document.getElementById('favorite-image-viewer');
            
            if (favoriteBtn && favoriteBtn.getAttribute('data-path') === imagePath) {
                updateFavoriteButtonAppearance(favoriteBtn, !wasFavorited);
            }
            
            if (favoriteViewerBtn && favoriteViewerBtn.getAttribute('data-path') === imagePath) {
                updateFavoriteButtonAppearance(favoriteViewerBtn, !wasFavorited);
            }
            
            // No dialog boxes for favorite actions as per user preference
        } else {
            console.error('Error toggling favorite status:', data.error);
            // Only log errors, don't show alerts
        }
    })
    .catch(error => {
        console.error('Error toggling favorite status:', error);
        // Only log errors, don't show alerts
    });
}
