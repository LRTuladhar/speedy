document.addEventListener('DOMContentLoaded', function() {
    // Initialize directory tree functionality
    initDirectoryTree();
    
    // Add click event listeners to tree items
    document.querySelectorAll('.tree-toggle').forEach(item => {
        item.addEventListener('click', handleTreeItemClick);
    });
});

function initDirectoryTree() {
    // Expand/collapse functionality for directory tree
    document.querySelectorAll('.tree-toggle').forEach(toggle => {
        toggle.addEventListener('click', function() {
            const parent = this.parentElement;
            const children = parent.querySelector('.tree-children');
            
            // Toggle active class
            this.classList.toggle('active');
            
            // If this item has children and they're not loaded yet, load them
            if (children && children.children.length === 0) {
                const path = parent.getAttribute('data-path');
                loadDirectoryContents(path, children);
            }
        });
    });
}

function handleTreeItemClick(event) {
    // Remove active class from all items
    document.querySelectorAll('.tree-toggle').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Add active class to clicked item
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
                        span.addEventListener('click', handleTreeItemClick);
                        
                        headerDiv.appendChild(span);
                        
                        const ul = document.createElement('ul');
                        ul.className = 'tree-children';
                        
                        li.appendChild(headerDiv);
                        li.appendChild(ul);
                        container.appendChild(li);
                    }
                });
                
                // If no directories were found, show a message
                if (container.children.length === 0) {
                    container.innerHTML = '<li class="empty">No subdirectories</li>';
                }
            } else {
                container.innerHTML = '<li class="error">Failed to load directory contents</li>';
            }
        })
        .catch(error => {
            console.error('Error loading directory contents:', error);
            container.innerHTML = '<li class="error">Error loading directory contents</li>';
        });
}

function loadDirectoryImages(path) {
    const gallery = document.getElementById('image-gallery');
    
    // Show loading indicator
    gallery.innerHTML = '<div class="gallery-placeholder"><i class="fas fa-spinner fa-spin"></i><p>Loading images...</p></div>';
    
    // Fetch images for the directory
    fetch(`/get_directory_images?directory=${encodeURIComponent(path)}`)
        .then(response => response.json())
        .then(images => {
            if (images.length === 0) {
                gallery.innerHTML = '<div class="gallery-placeholder"><i class="fas fa-images"></i><p>No images found in this directory</p></div>';
                return;
            }
            
            // Clear gallery
            gallery.innerHTML = '';
            
            // Add images to gallery
            images.forEach(image => {
                const div = document.createElement('div');
                div.className = 'image-item';
                
                const img = document.createElement('img');
                img.src = image.thumbnail;
                img.alt = image.name;
                img.loading = 'lazy';
                
                const info = document.createElement('div');
                info.className = 'image-info';
                info.textContent = image.name;
                
                div.appendChild(img);
                div.appendChild(info);
                gallery.appendChild(div);
            });
        })
        .catch(error => {
            console.error('Error loading images:', error);
            gallery.innerHTML = '<div class="gallery-placeholder"><i class="fas fa-exclamation-circle"></i><p>Error loading images</p></div>';
        });
}
