class NoteView {
    constructor(note, onDelete, onPin, onCategoryChange, onContentChange, onTitleChange, onColorChange, onResize, onTextColorChange, onDrag) {
        this.note = note;
        this.onDelete = onDelete;
        this.onPin = onPin;
        this.onCategoryChange = onCategoryChange;
        this.onContentChange = onContentChange;
        this.onTitleChange = onTitleChange;
        this.onColorChange = onColorChange;
        this.onResize = onResize;
        this.onTextColorChange = onTextColorChange;
        this.onDrag = onDrag;
        this.element = this.createNoteElement(note);
        this.setupEventListeners();
    }

    createNoteElement(note) {
        const noteElement = document.createElement('div');
        noteElement.className = `note note-${note.color || 'yellow'}`;
        noteElement.innerHTML = `
            <div class="note-header">
                <div class="note-title" contenteditable="true" ${note.title === 'Click to edit title' ? 'data-default="true"' : ''}>${note.title}</div>
                <div class="note-controls">
                    <select class="note-category-dropdown">
                        <option value="Personal" ${note.category === 'Personal' ? 'selected' : ''}>Personal</option>
                        <option value="Work" ${note.category === 'Work' ? 'selected' : ''}>Work</option>
                        <option value="Ideas" ${note.category === 'Ideas' ? 'selected' : ''}>Ideas</option>
                    </select>
                    <div class="pin-note" title="Pin/Unpin Note">📌</div>
                    <div class="delete-note" title="Delete Note">×</div>
                </div>
            </div>
            <div class="note-content" contenteditable="true" ${note.content === '<p>Type your note here...</p>' ? 'data-default="true"' : ''}>${note.content}</div>
            <div class="note-footer">
                <div class="note-actions">
                    <div class="color-selector">
                        <div class="color-toggle" title="Background Color">🎨</div>
                        <div class="color-options hidden">
                            <div class="color-option color-blue ${note.color === 'blue' ? 'selected' : ''}" data-color="blue" title="Blue"></div>
                            <div class="color-option color-green ${note.color === 'green' ? 'selected' : ''}" data-color="green" title="Green"></div>
                            <div class="color-option color-yellow ${note.color === 'yellow' ? 'selected' : ''}" data-color="yellow" title="Yellow"></div>
                            <div class="color-option color-orange ${note.color === 'orange' ? 'selected' : ''}" data-color="orange" title="Orange"></div>
                            <div class="color-option color-red ${note.color === 'red' ? 'selected' : ''}" data-color="red" title="Red"></div>
                        </div>
                    </div>
                    <div class="text-color-selector">
                        <div class="text-color-toggle" title="Text Color">Aa</div>
                        <div class="text-color-options hidden">
                            <div class="text-color-option text-black ${!note.textColor || note.textColor === '#000000' ? 'selected' : ''}" data-color="#000000" title="Black"></div>
                            <div class="text-color-option text-blue ${note.textColor === '#2196F3' ? 'selected' : ''}" data-color="#2196F3" title="Blue"></div>
                            <div class="text-color-option text-green ${note.textColor === '#4CAF50' ? 'selected' : ''}" data-color="#4CAF50" title="Green"></div>
                            <div class="text-color-option text-red ${note.textColor === '#F44336' ? 'selected' : ''}" data-color="#F44336" title="Red"></div>
                        </div>
                    </div>
                </div>
                <div class="resize-handle" title="Resize">◢</div>
            </div>
        `;

        // Apply saved styles
        if (note.textColor) {
            const contentEl = noteElement.querySelector('.note-content');
            const titleEl = noteElement.querySelector('.note-title');
            if (contentEl) contentEl.style.color = note.textColor;
            if (titleEl) titleEl.style.color = note.textColor;
            noteElement.dataset.originalTextColor = note.textColor;
        }
        
        // Apply saved dimensions if present
        if (note.width) noteElement.style.width = note.width;
        if (note.height) noteElement.style.height = note.height;
        
        // Apply saved position if present
        if (note.position) {
            noteElement.style.position = 'absolute';
            noteElement.style.left = note.position.left + 'px';
            noteElement.style.top = note.position.top + 'px';
        }
        
        // Apply pinned state if applicable
        if (note.pinned) {
            noteElement.classList.add('pinned');
            const pinButton = noteElement.querySelector('.pin-note');
            if (pinButton) pinButton.classList.add('active');
        }
        
        return noteElement;
    }

    setupEventListeners() {
        const noteElement = this.element;
        const deleteBtn = noteElement.querySelector('.delete-note');
        const titleElement = noteElement.querySelector('.note-title');
        const categoryDropdown = noteElement.querySelector('.note-category-dropdown');
        const contentElement = noteElement.querySelector('.note-content');
        const colorOptions = noteElement.querySelectorAll('.color-option');
        const pinElement = noteElement.querySelector('.pin-note');
        const resizeHandle = noteElement.querySelector('.resize-handle');
        const textColorOptions = noteElement.querySelectorAll('.text-color-option');
        const colorToggle = noteElement.querySelector('.color-toggle');
        const colorOptionsContainer = noteElement.querySelector('.color-options');
        const textColorToggle = noteElement.querySelector('.text-color-toggle');
        const textColorOptionsContainer = noteElement.querySelector('.text-color-options');

        // Pin note functionality
        pinElement.addEventListener('click', () => {
            const isPinned = !this.note.pinned;
            this.note.pinned = isPinned;
            
            if (isPinned) {
                noteElement.classList.add('pinned');
                pinElement.classList.add('active');
            } else {
                noteElement.classList.remove('pinned');
                pinElement.classList.remove('active');
            }
            
            this.onPin(this.note.id, isPinned);
        });

        // Color toggles with improved click handling
        colorToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            colorOptionsContainer.classList.toggle('hidden');
            colorToggle.classList.toggle('active');
            // Close text color options if open
            textColorOptionsContainer.classList.add('hidden');
            textColorToggle.classList.remove('active');
        });

        textColorToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            textColorOptionsContainer.classList.toggle('hidden');
            textColorToggle.classList.toggle('active');
            // Close color options if open
            colorOptionsContainer.classList.add('hidden');
            colorToggle.classList.remove('active');
        });

        // Background color selection - FIXED
        colorOptions.forEach(colorOption => {
            colorOption.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Get color from data attribute (more reliable)
                const colorName = colorOption.getAttribute('data-color');
                
                if (colorName) {
                    // Remove existing color classes from note element
                    noteElement.className = noteElement.className
                        .split(' ')
                        .filter(cls => !cls.startsWith('note-') || cls === 'note')
                        .join(' ');
                    
                    // Add new color class
                    noteElement.classList.add(`note-${colorName}`);
                    
                    // Update UI - remove selected class from all options and add to clicked option
                    colorOptions.forEach(opt => opt.classList.remove('selected'));
                    colorOption.classList.add('selected');
                    
                    // Update note object and save
                    this.note.color = colorName;
                    this.onColorChange(this.note.id, colorName);
                    
                    // Hide options after selection
                    colorOptionsContainer.classList.add('hidden');
                    colorToggle.classList.remove('active');
                }
            });
        });

        // Text color selection - FIXED
        textColorOptions.forEach(textColorOption => {
            textColorOption.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Get color from data attribute (more reliable)
                const textColor = textColorOption.getAttribute('data-color');
                
                if (textColor) {
                    // Apply color to note content and title
                    contentElement.style.color = textColor;
                    titleElement.style.color = textColor;
                    
                    // Store original text color for dark mode
                    noteElement.dataset.originalTextColor = textColor;
                    this.note.textColor = textColor;
                    
                    // Update UI - remove selected class from all options and add to clicked option
                    textColorOptions.forEach(opt => opt.classList.remove('selected'));
                    textColorOption.classList.add('selected');
                    
                    // Save changes
                    this.onTextColorChange(this.note.id, textColor);
                    
                    // Hide options after selection
                    textColorOptionsContainer.classList.add('hidden');
                    textColorToggle.classList.remove('active');
                }
            });
        });

        // Make title editable on click
        titleElement.addEventListener('click', () => {
            if (titleElement.getAttribute('data-default') === 'true') {
                titleElement.textContent = '';
                titleElement.removeAttribute('data-default');
            }
            titleElement.focus();
        });

        titleElement.addEventListener('blur', () => {
            if (titleElement.textContent.trim() === '') {
                titleElement.textContent = 'Untitled';
            }
            this.onTitleChange(this.note.id, titleElement.textContent);
        });

        contentElement.addEventListener('focus', () => {
            if (contentElement.getAttribute('data-default') === 'true') {
                contentElement.innerHTML = '';
                contentElement.removeAttribute('data-default');
            }
        });

        contentElement.addEventListener('blur', () => {
            if (contentElement.innerHTML.trim() === '') {
                contentElement.innerHTML = '<p>Type your note here...</p>';
                contentElement.setAttribute('data-default', 'true');
            }
            this.onContentChange(this.note.id, contentElement.innerHTML);
        });

        deleteBtn.addEventListener('click', () => {
            this.onDelete(this.note.id);
        });

        categoryDropdown.addEventListener('change', () => {
            this.onCategoryChange(this.note.id, categoryDropdown.value);
        });

        // Make notes draggable - but only if not pinned
        try {
            if (typeof $ !== 'undefined') {
                $(noteElement).draggable({
                    handle: '.note-header',
                    containment: '.notes-grid',
                    stack: '.note',
                    start: (event, ui) => {
                        // Only allow dragging if the note is not pinned
                        if (this.note.pinned) {
                            return false;
                        }
                        $(noteElement).addClass('dragging');
                    },
                    stop: (event, ui) => {
                        $(noteElement).removeClass('dragging');
                        this.onDrag(this.note.id, {left: ui.position.left, top: ui.position.top});
                    }
                });
            }
        } catch (e) {
            console.error('jQuery UI draggable not available:', e);
        }

        // Resizing functionality
        let initialWidth, initialHeight, initialX, initialY, resizingNote = null;

        const startResize = (e) => {
            e.stopPropagation();
            e.preventDefault();

            resizingNote = noteElement;
            const rect = resizingNote.getBoundingClientRect();

            initialWidth = rect.width;
            initialHeight = rect.height;
            initialX = e.clientX;
            initialY = e.clientY;

            resizingNote.classList.add('resizing');

            document.addEventListener('mousemove', resizeNote);
            document.addEventListener('mouseup', stopResize);
        };

        const resizeNote = (e) => {
            if (!resizingNote) return;

            const newWidth = initialWidth + (e.clientX - initialX);
            const newHeight = initialHeight + (e.clientY - initialY);

            // Set minimum size
            if (newWidth > 150) {
                resizingNote.style.width = newWidth + 'px';
            }

            if (newHeight > 100) {
                resizingNote.style.height = newHeight + 'px';
            }
        };

        const stopResize = () => {
            if (resizingNote) {
                resizingNote.classList.remove('resizing');
                document.removeEventListener('mousemove', resizeNote);
                document.removeEventListener('mouseup', stopResize);

                this.onResize(this.note.id, resizingNote.style.width, resizingNote.style.height);

                resizingNote = null;
            }
        };

        resizeHandle.addEventListener('mousedown', startResize);
    }
}