// Global cache for directory contents and images
const directoryCache = {};
const imageCache = {};

// Pagination and sorting state
let currentPage = 1;
let totalPages = 1;
let imagesPerPage = 10;
let currentImages = [];
let currentSortMethod = 'date-desc'; // Default sort: date created, newest first

document.addEventListener('DOMContentLoaded', function() {
    // Initialize directory tree functionality
    initDirectoryTree();
    
    // Add click event listeners to tree items
    document.querySelectorAll('.tree-toggle').forEach(item => {
        item.addEventListener('click', handleTreeItemClick);
    });
    
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
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const paginationStatus = document.getElementById('pagination-status');
    
    // Update buttons state
    prevPageBtn.disabled = currentPage <= 1 || totalImages === 0;
    nextPageBtn.disabled = currentPage >= pages || totalImages === 0;
    
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
    console.log(`Updated pagination controls: ${totalImages} images, ${pages} pages, current page: ${currentPage}`);
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
            openImageViewer(selectedImageIndex);
            event.preventDefault();
        }
        return;
    }
    
    // Only process arrow keys for navigation
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

function initImageViewer() {
    // Set up image viewer event listeners
    const modal = document.getElementById('image-viewer-modal');
    const closeBtn = modal.querySelector('.close');
    const prevBtn = document.getElementById('prev-image');
    const nextBtn = document.getElementById('next-image');
    
    // Close button events
    closeBtn.addEventListener('click', closeImageViewer);
    
    // Navigation buttons with debounce to prevent double-clicking
    prevBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        console.log('Prev button clicked');
        if (!isNavigating) {
            navigateImage('prev');
        }
    });
    
    nextBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        console.log('Next button clicked');
        if (!isNavigating) {
            navigateImage('next');
        }
    });
    
    // Click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeImageViewer();
        }
    });
    
    // Add global keyboard event listener specifically for the viewer
    document.addEventListener('keydown', function(e) {
        if (imageViewerOpen) {
            handleImageViewerKeyboard(e);
        }
    });
    
    console.log('Image viewer initialized with simplified UI and keyboard navigation and debounce protection');
}

// Navigation debug function has been removed

// This function has been removed as we no longer need the image list panel
// We're keeping the navigation debug functionality in updateNavigationDebug

// This function has been removed as we no longer need the image list panel

function updateImageViewer(absoluteIndex) {
    if (!currentImages || absoluteIndex < 0 || absoluteIndex >= currentImages.length) return;
    
    // Get the image from the full collection
    const image = currentImages[absoluteIndex];
    if (!image) return;
    
    // Update viewer elements
    const viewerImage = document.getElementById('viewer-image');
    const viewerName = document.getElementById('viewer-image-name');
    const imageCounter = document.getElementById('image-counter');
    
    viewerImage.src = image.url;
    viewerName.textContent = image.name;
    imageCounter.textContent = `Image ${absoluteIndex + 1} of ${currentImages.length}`;
    
    // Debug information has been removed
    
    console.log(`Updated image viewer to show image at absolute index ${absoluteIndex}`);
}

function openImageViewer(index) {
    const gallery = document.getElementById('image-gallery');
    if (!gallery) return;
    
    const images = Array.from(gallery.querySelectorAll('.image-item'));
    if (index < 0 || index >= images.length) return;
    
    // Get the absolute index directly from the data attribute if available
    let absoluteIndex;
    const selectedImage = images[index];
    if (selectedImage && selectedImage.hasAttribute('data-absolute-index')) {
        absoluteIndex = parseInt(selectedImage.getAttribute('data-absolute-index'));
        console.log(`Using data-absolute-index: ${absoluteIndex}`);
    } else {
        // Calculate the absolute index in the full image collection
        absoluteIndex = (currentPage - 1) * imagesPerPage + index;
        console.log(`Calculated absolute index: ${absoluteIndex}`);
    }
    
    if (absoluteIndex >= currentImages.length) {
        console.error(`Invalid absolute index: ${absoluteIndex}, max: ${currentImages.length-1}`);
        return;
    }
    
    // Set current image index (relative to current page)
    currentViewerIndex = index;
    
    // Update the image viewer
    updateImageViewer(absoluteIndex);
    
    // Show the modal
    const modal = document.getElementById('image-viewer-modal');
    modal.style.display = 'block';
    imageViewerOpen = true;
    
    // Debug information has been removed
    
    // Debug information
    console.log(`Opened image viewer for image at absolute index ${absoluteIndex} (page ${currentPage}, relative index ${index})`);
    console.log(`Current page has ${images.length} images visible in the grid`);
    
    // Log all images for debugging
    console.log('All images in current collection:');
    currentImages.forEach((img, i) => {
        console.log(`[${i}] ${img.name}`);
    });
}

function closeImageViewer() {
    const modal = document.getElementById('image-viewer-modal');
    modal.style.display = 'none';
    imageViewerOpen = false;
    currentViewerIndex = -1;
    
    console.log('Closed image viewer');
}

function navigateImage(direction) {
    if (!currentImages || currentImages.length === 0 || isNavigating) return;
    
    // Set the navigating flag to prevent multiple rapid calls
    isNavigating = true;
    console.log(`NAVIGATION STARTED: ${direction}`);
    
    // Calculate the absolute index in the full image collection
    const currentAbsoluteIndex = (currentPage - 1) * imagesPerPage + currentViewerIndex;
    let newAbsoluteIndex = currentAbsoluteIndex;
    
    // Determine the total number of images
    const totalImages = currentImages.length;
    
    // Reset the navigating flag after a short delay (do this early to ensure it gets reset)
    setTimeout(() => {
        isNavigating = false;
        console.log('NAVIGATION COMPLETED - Ready for next navigation');
    }, 200); // 200ms debounce
    
    // Log the current state for debugging
    console.log(`Before navigation: currentPage=${currentPage}, currentViewerIndex=${currentViewerIndex}, absoluteIndex=${currentAbsoluteIndex}`);
    console.log(`Current images array length: ${currentImages.length}`);
    
    // Log the current image and its neighbors
    if (currentImages[currentAbsoluteIndex]) {
        console.log(`Current image: [${currentAbsoluteIndex}] ${currentImages[currentAbsoluteIndex].name}`);
    }
    if (currentAbsoluteIndex > 0 && currentImages[currentAbsoluteIndex - 1]) {
        console.log(`Previous image: [${currentAbsoluteIndex - 1}] ${currentImages[currentAbsoluteIndex - 1].name}`);
    }
    if (currentAbsoluteIndex < totalImages - 1 && currentImages[currentAbsoluteIndex + 1]) {
        console.log(`Next image: [${currentAbsoluteIndex + 1}] ${currentImages[currentAbsoluteIndex + 1].name}`);
    }
    
    // Determine the new absolute index based on direction
    switch (direction) {
        case 'prev':
            // Always move exactly one image backward
            if (currentAbsoluteIndex > 0) {
                newAbsoluteIndex = currentAbsoluteIndex - 1;
            }
            break;
            
        case 'next':
            // Always move exactly one image forward
            if (currentAbsoluteIndex < totalImages - 1) {
                newAbsoluteIndex = currentAbsoluteIndex + 1;
            }
            break;
            
        case 'first':
            newAbsoluteIndex = 0;
            break;
            
        case 'last':
            newAbsoluteIndex = totalImages - 1;
            break;
    }
    
    // Log the new absolute index for debugging
    console.log(`Navigation direction: ${direction}, new absoluteIndex=${newAbsoluteIndex}`);
    
    if (newAbsoluteIndex !== currentAbsoluteIndex) {
        // Calculate which page this image is on
        const newPage = Math.floor(newAbsoluteIndex / imagesPerPage) + 1;
        const newRelativeIndex = newAbsoluteIndex % imagesPerPage;
        
        console.log(`New page: ${newPage}, new relative index: ${newRelativeIndex}`);
        
        // Get the image from the full collection
        const image = currentImages[newAbsoluteIndex];
        if (!image) {
            console.error(`Image at index ${newAbsoluteIndex} not found!`);
            return;
        }
        
        // Update viewer elements
        updateImageViewer(newAbsoluteIndex);
        
        // If we need to change page
        if (newPage !== currentPage) {
            changePage(newPage);
        } else {
            // Just update the selected image in the grid
            selectImage(newRelativeIndex);
        }
        
        // Update the current viewer index to the relative position on the current page
        currentViewerIndex = newRelativeIndex;
        
        // Get current visible images count for debugging
        const gallery = document.getElementById('image-gallery');
        const visibleImages = gallery ? gallery.querySelectorAll('.image-item').length : 0;
        
        console.log(`Navigated to image at absolute index ${newAbsoluteIndex} (page ${newPage}, relative index ${newRelativeIndex})`);
        console.log(`Current page has ${visibleImages} images visible in the grid out of ${totalImages} total images`);
    }
    
    // Note: The navigation flag reset has been moved to the beginning of the function
    // to ensure it always gets reset, even if there's an error during navigation
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
    
    // Get images for this page
    const pageImages = currentImages.slice(startIndex, endIndex);
    
    console.log(`Rendering page ${page} with images from index ${startIndex} to ${endIndex-1}`);
    
    // Debug: Log the actual images being rendered on this page
    console.log('Images on current page:');
    pageImages.forEach((img, idx) => {
        console.log(`Page index ${idx}, absolute index ${startIndex + idx}: ${img.name}`);
    });
    
    // Add images to gallery
    pageImages.forEach((image, idx) => {
        const div = document.createElement('div');
        div.className = 'image-item';
        if (idx === selectedIndex) {
            div.classList.add('selected');
        }
        div.setAttribute('data-index', idx);
        
        // Calculate the absolute index for this image
        const absoluteIndex = startIndex + idx;
        div.setAttribute('data-absolute-index', absoluteIndex);
        
        // Add debug info to the element
        div.setAttribute('data-debug', `Page: ${page}, Rel: ${idx}, Abs: ${absoluteIndex}`);
        
        const img = document.createElement('img');
        img.src = image.url;
        img.alt = image.name;
        img.loading = 'lazy';
        
        // Add click handler for selection only
        div.addEventListener('click', function(e) {
            console.log(`Clicked image: ${image.name} at page index ${idx}, absolute index ${absoluteIndex}`);
            selectImage(idx);
            e.stopPropagation();
        });
        
        // Add double-click handler to open the image viewer
        div.addEventListener('dblclick', function(e) {
            console.log(`Double-clicked image: ${image.name} at page index ${idx}, absolute index ${absoluteIndex}`);
            openImageViewer(idx);
            e.stopPropagation();
        });
        
        const info = document.createElement('div');
        info.className = 'image-info';
        info.textContent = image.name;
        
        div.appendChild(img);
        div.appendChild(info);
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
