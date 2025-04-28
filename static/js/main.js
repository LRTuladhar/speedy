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
    const addDirectoryForm = document.querySelector('form[action*="add_directory"]');
    if (addDirectoryForm) {
        console.log('Add directory form found, attaching event listener');
        addDirectoryForm.addEventListener('submit', function(event) {
            const directoryInput = this.querySelector('input[name="directory"]');
            if (directoryInput) {
                console.log(`Attempting to add directory: ${directoryInput.value}`);
            }
        });
    } else {
        console.warn('Add directory form not found');
    }
    
    // Initialize pagination controls
    initPaginationControls();
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
            // Store in cache
            imageCache[path] = images;
            console.log(`Cached images for ${path}`);
            
            renderImages(images, gallery);
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
    
    // Store sorted images for pagination
    currentImages = sortedImages;
    
    if (sortedImages.length === 0) {
        gallery.innerHTML = '<div class="gallery-placeholder"><i class="fas fa-images"></i><p>No images found in this directory</p></div>';
        updatePaginationControls(0, 0);
        return;
    }
    
    // Calculate pagination
    totalPages = Math.ceil(sortedImages.length / imagesPerPage);
    if (currentPage > totalPages) {
        currentPage = 1;
    }
    
    // Update pagination controls
    updatePaginationControls(sortedImages.length, totalPages);
    
    // Get current page images
    const startIndex = (currentPage - 1) * imagesPerPage;
    const endIndex = Math.min(startIndex + imagesPerPage, sortedImages.length);
    const currentPageImages = sortedImages.slice(startIndex, endIndex);
    
    // Clear gallery
    gallery.innerHTML = '';
    
    // Add images to gallery
    currentPageImages.forEach(image => {
        const div = document.createElement('div');
        div.className = 'image-item';
        
        const img = document.createElement('img');
        img.src = image.url;
        img.alt = image.name;
        img.loading = 'lazy';
        
        // Add click handler to view full-size image
        img.addEventListener('click', function() {
            window.open(image.url, '_blank');
        });
        
        const info = document.createElement('div');
        info.className = 'image-info';
        info.textContent = image.name;
        
        div.appendChild(img);
        div.appendChild(info);
        gallery.appendChild(div);
    });
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
            currentPage--;
            renderImages(currentImages, document.getElementById('image-gallery'));
        }
    });
    
    // Next page button
    nextPageBtn.addEventListener('click', function() {
        if (currentPage < totalPages) {
            currentPage++;
            renderImages(currentImages, document.getElementById('image-gallery'));
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
