document.addEventListener('DOMContentLoaded', function () {
    class BatchManager {
        constructor(delay = 6000) {
            this.delay = delay;
            this.timeoutId = null;
            this.isProcessing = false;
            console.log('BatchManager: Initializing...');
            
            this.dbInitialized = false;
            this.pendingOperations = [];
            this.initRetryCount = 0;
            this.batchSize = 0; // Track how many updates are pending
            
            this.dbInitPromise = this.setupIndexedDB();
            
            this.dbInitPromise.then(() => {
                console.log('BatchManager: Database ready, scheduling initial processing');
                this.processUpdates();
            }).catch(err => {
                console.error('BatchManager: Failed to initialize database:', err);
            });
        }
    
        async setupIndexedDB() {
            try {
                console.log('BatchManager: Starting database initialization');
                this.initRetryCount++;
                
                const dbName = 'NotesDB';
                
                this.db = await new Promise((resolve, reject) => {
                    console.log(`BatchManager: Opening database ${dbName}...`);
                    
                    const timeoutId = setTimeout(() => {
                        console.error('BatchManager: Database open request timed out');
                        reject(new Error('Database open request timed out'));
                    }, 5000);
                    
                    try {
                        const request = window.indexedDB.open(dbName, 1);
                        
                        request.onerror = (event) => {
                            clearTimeout(timeoutId);
                            console.error('BatchManager IndexedDB error:', event.target.error);
                            reject(event.target.error);
                        };
                        
                        request.onblocked = (event) => {
                            clearTimeout(timeoutId);
                            console.warn('BatchManager: Database opening blocked:', event);
                            reject(new Error('Database opening blocked'));
                        };
                        
                        request.onupgradeneeded = (event) => {
                            const db = event.target.result;
                            console.log('BatchManager: Creating database schema');
                            
                            try {
                                // Create notes store with noteId as key
                                const store = db.createObjectStore('notes', { keyPath: 'noteId' });
                                
                                // Create index for status queries
                                store.createIndex('status', 'status', { unique: false });
                                console.log('BatchManager: Created notes store with noteId as key');
                            } catch (error) {
                                console.error('BatchManager: Error during schema creation:', error);
                            }
                        };
                        
                        request.onsuccess = (event) => {
                            clearTimeout(timeoutId);
                            const db = event.target.result;
                            console.log('BatchManager: IndexedDB connected successfully', db);
                            
                            // Enable debugging on the database connection
                            db.onerror = (event) => {
                                console.error('Database error:', event.target.error);
                            };
                            
                            resolve(db);
                        };
                    } catch (error) {
                        clearTimeout(timeoutId);
                        console.error('BatchManager: Unexpected error during IndexedDB open:', error);
                        reject(error);
                    }
                });
                
                // Skip the test query - it's causing issues in some environments
                this.dbInitialized = true;
                console.log('BatchManager: Database initialized successfully');
                
                // Process any pending operations
                console.log(`BatchManager: Processing ${this.pendingOperations.length} pending operations`);
                while (this.pendingOperations.length > 0) {
                    const operation = this.pendingOperations.shift();
                    try {
                        await operation();
                        console.log('BatchManager: Successfully processed pending operation');
                    } catch (err) {
                        console.error('BatchManager: Error processing pending operation:', err);
                    }
                }
                
                return true;
            } catch (error) {
                console.error('BatchManager: Failed to initialize database:', error);
                this.dbInitialized = false;
                throw error;
            }
        }
    
        async waitForDB(timeout = 5000) {
            if (this.dbInitialized) return true;
            
            console.log('BatchManager: Waiting for database initialization...');
            try {
                // Add a timeout to prevent infinite waiting
                const result = await Promise.race([
                    this.dbInitPromise,
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Database initialization timeout')), timeout)
                    )
                ]);
                
                console.log('BatchManager: Database ready after waiting');
                return this.dbInitialized;
            } catch (error) {
                console.error('BatchManager: Error waiting for database:', error);
                
                // If we got a timeout error, attempt to reinitialize
                if (error.message === 'Database initialization timeout') {
                    console.log('BatchManager: Timeout occurred, attempting to reinitialize database');
                    this.dbInitPromise = this.setupIndexedDB();
                }
                
                return false;
            }
        }
    
        // Save or update note
        async saveToDB(noteId, updates) {
            console.log(`BatchManager: Saving to DB - Note ID: ${noteId}`, updates);
            
            // If DB isn't ready, queue the operation
            if (!this.dbInitialized) {
                console.log('BatchManager: Database not ready, queueing operation for later');
                return new Promise((resolve, reject) => {
                    this.pendingOperations.push(async () => {
                        try {
                            console.log(`BatchManager: Processing queued operation for note: ${noteId}`);
                            await this._saveToDB(noteId, updates);
                            resolve();
                        } catch (error) {
                            console.error(`BatchManager: Failed to process queued operation for note: ${noteId}`, error);
                            reject(error);
                        }
                    });
                });
            }
            
            try {
                return await this._saveToDB(noteId, updates);
            } catch (error) {
                console.error(`BatchManager: Error in saveToDB for note ${noteId}:`, error);
                throw error;
            }
        }
        
        
        // Internal save method that assumes DB is initialized
        async _saveToDB(noteId, updates) {
            return new Promise((resolve, reject) => {
                if (!this.dbInitialized || !this.db) {
                    console.error('BatchManager: Database not initialized yet');
                    reject(new Error('Database not ready'));
                    return;
                }
                
                try {
                    console.log(`BatchManager: Creating transaction for note: ${noteId}`);
                    let transaction;
                    try {
                        transaction = this.db.transaction(['notes'], 'readwrite');
                    } catch (err) {
                        console.error('BatchManager: Failed to create transaction:', err);
                        reject(new Error(`Failed to create transaction: ${err.message}`));
                        return;
                    }
                    
                    transaction.oncomplete = () => {
                        console.log(`BatchManager: Transaction completed successfully for note: ${noteId}`);
                    };
                    
                    transaction.onerror = (event) => {
                        console.error(`BatchManager: Transaction error for note: ${noteId}:`, event.target.error);
                        reject(event.target.error);
                    };
                    
                    console.log('BatchManager: Getting object store');
                    const store = transaction.objectStore('notes');
                    
                    // First check if the note already exists
                    console.log(`BatchManager: Checking if note ${noteId} exists`);
                    const getRequest = store.get(noteId);
                    
                    getRequest.onsuccess = (event) => {
                        const existingNote = event.target.result;
                        const dateModified = new Date().toISOString();
                        
                        let noteRecord;
                        
                        if (existingNote) {
                            console.log(`BatchManager: Updating existing note: ${noteId}`, existingNote);
                            // Update existing note
                            noteRecord = {
                                ...existingNote,
                                ...updates,
                                dateModified,
                                status: 'NotSynced'
                            };
                        } else {
                            console.log(`BatchManager: Creating new note: ${noteId}`);
                            // Create new note with dateCreated
                            const dateCreated = new Date().toISOString();
                            noteRecord = {
                                noteId,
                                ...updates,
                                dateCreated,
                                dateModified,
                                retryCount: 0,
                                status: 'NotSynced'
                            };
                        }
                        
                        // Log the actual record 
                        console.log('💾 BatchManager: Saving note:', JSON.stringify(noteRecord));
                        
                        const putRequest = store.put(noteRecord);
                        
                        putRequest.onsuccess = (event) => {
                            console.log(`BatchManager: Note ${noteId} saved successfully with key:`, event.target.result);
                            
                            // Increment the batch size counter
                            this.batchSize++;
                            
                            // Schedule processing based on batch size or wait for delay
                            this.scheduleProcessing();
                            
                            resolve();
                        };
                        
                        putRequest.onerror = (event) => {
                            console.error(`BatchManager: Error saving note ${noteId}:`, event.target.error);
                            reject(event.target.error);
                        };
                    };
                    
                    getRequest.onerror = (event) => {
                        console.error(`BatchManager: Error retrieving note ${noteId}:`, event.target.error);
                        reject(event.target.error);
                    };
                    
                } catch (error) {
                    console.error(`BatchManager: Exception in saveToDB for note ${noteId}:`, error);
                    reject(error);
                }
            });
        }
        
        async processUpdates() {
            console.log('BatchManager: processUpdates called');
            
            const dbReady = await this.waitForDB(5000);
            if (!dbReady) {
                console.error('BatchManager: Cannot process updates, database not ready');
                return;
            }
            
            if (this.isProcessing) {
                console.log('BatchManager: Already processing updates, skipping');
                return;
            }
            
            this.isProcessing = true;
            console.log('BatchManager: Starting to process updates...');
        
            try {
                const unsynced = await this.getUnsyncedNotes();
                console.log('BatchManager: Processing updates, found:', unsynced.length, 'unsynced notes');
                
                if (unsynced.length === 0) {
                    console.log('BatchManager: No updates to process');
                    this.isProcessing = false;
                    return;
                }
        
                // Create a proper batch update format - an array of note updates
                const batchUpdates = unsynced.map(note => {
                    // Ensure noteId is present
                    if (!note.noteId) {
                        console.warn('BatchManager: Skipping note without noteId', note);
                        return null;
                    }
                    
                    // Extract noteId and prepare clean note data for sending to server
                    const { noteId, status, retryCount, ...noteData } = note;
                    return {
                        noteId,  // Explicitly include noteId
                        ...noteData
                    };
                }).filter(note => note !== null); // Remove any null entries
        
                // Check if we have any valid updates to send
                if (batchUpdates.length === 0) {
                    console.log('BatchManager: No valid updates to process after filtering');
                    this.isProcessing = false;
                    return;
                }
        
                try {
                    console.log('📤 BatchManager: Sending batch update for', batchUpdates.length, 'notes');
                    // Send all updates in a single batch request
                    const response = await this.sendBatchToServer(batchUpdates);
                    
                    // Reset batch size counter after successful processing
                    this.batchSize = 0;
                    
                    // Handle successful updates
                    await Promise.all(
                        response.successfulNotes.map(async (noteId) => {
                            await this.updateNoteStatus(noteId, 'Synced');
                            console.log(`BatchManager: Marked ${noteId} as synced`);
                        })
                    );
        
                    // Handle failed updates
                    await Promise.all(
                        response.failedNotes.map(async ({ noteId, error }) => {
                            console.error(`BatchManager: Failed to update ${noteId}:`, error);
                            await this.handleFailedUpdate({ noteId });
                        })
                    );
        
                } catch (error) {
                    console.error('BatchManager: Batch update failed:', error);
                    // Mark all as failed to retry later
                    await Promise.all(
                        batchUpdates.map(note => 
                            this.handleFailedUpdate({ noteId: note.noteId })
                        )
                    );
                }
                
                console.log('BatchManager: Finished processing batch updates');
            } catch (error) {
                console.error('BatchManager: Error in processUpdates:', error);
            } finally {
                this.isProcessing = false;
                this.scheduleRetry();
            }
        }
    
        async sendBatchToServer(notes) {
            console.log('BatchManager: Sending batch to server:', notes);
            
            try {
                const token = localStorage.getItem('token');
                const response = await fetch('http://localhost:3001/notes/batch-update', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token || ''}`,
                        'X-Request-ID': `BatchUpdate-${Date.now()}`
                    },
                    body: JSON.stringify({ updates: notes })
                });
    
                const responseText = await response.text();
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${responseText}`);
                }
    
                return JSON.parse(responseText);
            } catch (error) {
                console.error('BatchManager: Batch update failed:', error);
                throw error;
            }
        }
        
        async queueUpdate(noteId, updates) {
            try {
                const startTime = Date.now();
                console.log(`BatchManager: Queueing update for ${noteId} at ${new Date().toISOString()}`);
                
                const dbReady = await this.waitForDB(10000);
                if (!dbReady) {
                    console.error('BatchManager: DB not ready after timeout');
                    throw new Error('Database not ready');
                }
                
                console.log(`BatchManager: Saving note ${noteId} (waited ${Date.now() - startTime}ms)`);
                await this.saveToDB(noteId, updates);
                
                console.log(`BatchManager: Successfully queued update for ${noteId}`);
                // No need to call scheduleProcessing here as it's called in saveToDB
            } catch (error) {
                console.error(`BatchManager: Error queueing update for ${noteId}:`, error);
                this.showNotification(`Failed to queue update. Will retry...`, 'error');
                
                setTimeout(() => {
                    console.log(`BatchManager: Retrying failed queue for ${noteId}`);
                    this.queueUpdate(noteId, updates).catch(err => {
                        console.error(`BatchManager: Retry failed for ${noteId}:`, err);
                    });
                }, 2000);
            }
        }
    
        // Helper methods
        async getUnsyncedNotes() {
            const dbReady = await this.waitForDB(5000);
            if (!dbReady) {
                console.warn('BatchManager: Database not ready yet for getUnsyncedNotes');
                return [];
            }
            
            return new Promise((resolve, reject) => {
                try {
                    console.log('BatchManager: Querying for unsynced notes...');
                    const transaction = this.db.transaction(['notes'], 'readonly');
                    const store = transaction.objectStore('notes');
                    
                    // Check if the index exists
                    if (!store.indexNames.contains('status')) {
                        console.error('BatchManager: Status index not found in notes store');
                        return resolve([]);
                    }
                    
                    const index = store.index('status');
                    const request = index.getAll('NotSynced');
                    
                    request.onsuccess = () => {
                        const results = request.result || [];
                        console.log(`BatchManager: Found ${results.length} unsynced notes:`, 
                            results.map(note => note.noteId));
                        resolve(results);
                    };
                    
                    request.onerror = (event) => {
                        console.error('BatchManager: Error getting unsynced notes:', event.target.error);
                        reject(event.target.error);
                    };
                } catch (error) {
                    console.error('BatchManager: Exception in getUnsyncedNotes:', error);
                    resolve([]);
                }
            });
        }
    
        async updateNoteStatus(noteId, status) {
            if (!await this.waitForDB(5000)) {
                return Promise.reject(new Error('Database not ready'));
            }
            
            return new Promise((resolve, reject) => {            
                const transaction = this.db.transaction(['notes'], 'readwrite');
                const store = transaction.objectStore('notes');
                
                const getRequest = store.get(noteId);
                
                getRequest.onsuccess = (event) => {
                    const note = event.target.result;
                    if (note) {
                        note.status = status;
                        const putRequest = store.put(note);
                        
                        putRequest.onsuccess = () => {
                            console.log(`BatchManager: Updated note ${noteId} status to ${status}`);
                            resolve();
                        };
                        
                        putRequest.onerror = (event) => {
                            console.error('BatchManager: Error updating status:', event.target.error);
                            reject(event.target.error);
                        };
                    } else {
                        console.error('BatchManager: Note not found for status update:', noteId);
                        reject(new Error('Note not found'));
                    }
                };
                
                getRequest.onerror = (event) => {
                    console.error('BatchManager: Error retrieving note for status update:', event.target.error);
                    reject(event.target.error);
                };
            });
        }
    
        async handleFailedUpdate(note) {
            if (!await this.waitForDB(5000)) return;
            
            const transaction = this.db.transaction(['notes'], 'readwrite');
            const store = transaction.objectStore('notes');
            
            const getRequest = store.get(note.noteId);
            
            getRequest.onsuccess = async (event) => {
                const currentNote = event.target.result;
                if (!currentNote) return;
                
                if (currentNote.retryCount >= 5) {
                    // Permanent failure - mark as failed but keep the note
                    console.log('BatchManager: Max retries reached for note:', note.noteId, 'marking as SyncFailed');
                    currentNote.status = 'SyncFailed';
                    this.showNotification(`Update for note ${currentNote.noteId} failed permanently`, 'error');
                } else {
                    // Increment retry count and mark as NotSynced again
                    currentNote.retryCount++;
                    currentNote.status = 'NotSynced';
                    console.log('BatchManager: Incrementing retry count for note:', note.noteId, 'new count:', currentNote.retryCount);
                }
                
                store.put(currentNote);
            };
        }
    
        // Utility methods
        scheduleProcessing() {
            // Define maximum batch size before forcing immediate processing
            const MAX_BATCH_SIZE = 5;
            
            // Clear any existing timeout
            clearTimeout(this.timeoutId);
            
            // If we've accumulated enough notes, process immediately
            if (this.batchSize >= MAX_BATCH_SIZE) {
                console.log(`BatchManager: Batch size (${this.batchSize}) reached threshold, processing immediately`);
                // Small delay to allow transaction to complete
                setTimeout(() => {
                    this.processUpdates().catch(err => {
                        console.error('BatchManager: Error during immediate processing:', err);
                    });
                }, 500);
                return;
            }
            
            // Otherwise, schedule normal processing with delay
            console.log(`BatchManager: Scheduling processing in ${this.delay}ms, current batch size: ${this.batchSize}`);
            this.timeoutId = setTimeout(() => {
                console.log('BatchManager: Executing scheduled processing');
                this.processUpdates().catch(err => {
                    console.error('BatchManager: Error during scheduled processing:', err);
                });
            }, this.delay);
        }
    
        scheduleRetry() {
            const retryDelay = 30000;
            console.log(`BatchManager: Scheduling retry in ${retryDelay}ms`);
            setTimeout(() => {
                console.log('BatchManager: Executing retry processing');
                this.processUpdates().catch(err => {
                    console.error('BatchManager: Error during retry processing:', err);
                });
            }, retryDelay);
        }
    
        showNotification(message, type) {
            const icon = type === 'error' ? '❌' : '📢';
            console[type === 'error' ? 'error' : 'log'](`${icon} ${message}`);
        }
    }
    
    // Create single instance
    const batchManager = new BatchManager();

    const floatingAddButton = document.getElementById('floatingAddButton');
    const notesGrid = document.querySelector('.notes-grid');
    const statusBar = document.querySelector('.status-bar');
    const appContainer = document.querySelector('.app-container');
    const textColorToggle = document.querySelector('.text-color-toggle');
    const textColorOptionsContainer = document.querySelector('.text-color-options');
    const darkModeToggle = document.querySelector('.dark-mode-toggle');
    const colorOptionsContainer = document.getElementById('colorOptionsContainer');
    

    const controlsContainer = document.querySelector('.controls');

    const searchBar = document.querySelector('.search-bar');
    searchBar.addEventListener('input', filterNotes);
    let currentPage = 1;
    let isLoading = false;
    let hasMoreNotes = true;
    
    const loginForm = document.querySelector('.login-form');
    const signupForm = document.querySelector('.signup-form');
    
    // Reset forms if they exist
    if(loginForm) loginForm.reset();
    if(signupForm) signupForm.reset();
    
    // Directly clear all text and password inputs as a fallback
    const allInputs = document.querySelectorAll('input[type="text"], input[type="password"], input[type="email"]');
    allInputs.forEach(input => {
        input.value = '';
    });
    // State
    let notes = [];
    let lastExportTime = 0;  // Track last export time to prevent duplicate exports

    function isValidNotesState() {
        return Array.isArray(notes) && notes.length > 0 && notes.every(note => note.element);
    }

    let darkMode = localStorage.getItem('darkMode') === 'true';
    if (darkMode) {
        document.body.classList.add('dark-mode');
        const toggleSwitch = document.querySelector('.dark-mode-toggle .toggle-switch');
        if (toggleSwitch) {
            toggleSwitch.classList.add('active');
        }
    }

    //Load the notes
    loadNotes();

    const categoryLinks = document.querySelectorAll('.sidebar-nav li a');
    categoryLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Remove active class from all links
            categoryLinks.forEach(l => l.parentElement.classList.remove('active'));
            
            // Add active class to clicked link
            this.parentElement.classList.add('active');
            
            const category = this.textContent.trim();
            filterNotesByCategory(category);
        });
    });
const exportNotesBtn = document.querySelector('.export-notes-btn');
exportNotesBtn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    // Preserve current state
    const currentGridContent = notesGrid.innerHTML;
    const currentNotesState = [...notes];
    
    // Call export
    exportNotes();
    
    // Ensure state is preserved
    requestAnimationFrame(() => {
        if (notesGrid.innerHTML !== currentGridContent) {
            notesGrid.innerHTML = currentGridContent;
        }
        if (notes.length !== currentNotesState.length) {
            notes = currentNotesState;
        }
        updateStatusBar();
    });
});

// Fix for import-notes-input event listener
const importNotesInput = document.getElementById('import-notes-input');
importNotesInput.addEventListener('change', function(e) {
    importNotes(e);
});

// Export notes function
function exportNotes() {
    // Create an invisible iframe for download to prevent DOM focus issues
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    
    try {
        // Create a deep copy of the notes array without DOM elements
        const notesToExport = notes.map(note => {
            const { element, ...noteData } = note;
            // Convert position object to string for proper JSON serialization
            if (noteData.position && typeof noteData.position !== 'string') {
                noteData.position = JSON.stringify(noteData.position);
            }
            return noteData;
        });

        // Create a JSON string with proper formatting
        const notesJson = JSON.stringify(notesToExport, null, 2);

        // Create a blob in the iframe context
        const iframeWindow = iframe.contentWindow;
        const blob = new iframeWindow.Blob([notesJson], { type: 'application/json' });
        const url = iframeWindow.URL.createObjectURL(blob);

        // Create a download link in the iframe
        const a = iframeWindow.document.createElement('a');
        a.href = url;
        a.download = `sticky_notes_export_${new Date().toISOString().split('T')[0]}.json`;
        
        // Trigger download
        iframeWindow.document.body.appendChild(a);
        a.click();

        // Clean up
        setTimeout(() => {
            iframeWindow.URL.revokeObjectURL(url);
            document.body.removeChild(iframe);
        }, 100);

        showNotification('Notes exported successfully!', 'success');
    } catch (error) {
        console.error('Error exporting notes:', error);
        showNotification('Failed to export notes. Please try again.', 'error');
        document.body.removeChild(iframe);
    }
}

// Import notes function
function importNotes(event) {
    try {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                let importedNotes = JSON.parse(e.target.result);
                
                // Show confirmation dialog
                if (notes.length > 0) {
                    if (!confirm('Importing notes will merge with your existing notes. Continue?')) {
                        importNotesInput.value = ''; // Reset the file input
                        return;
                    }
                }

                // Process each imported note
                importedNotes.forEach(async (importedNote) => {
                    try {
                        // Check if note already exists
                        const existingNote = notes.find(note => note.id === importedNote.id);
                        
                        if (existingNote) {
                            // Update existing note
                            await updateNoteOnServer(importedNote);
                        } else {
                            // Create new note
                            await createNoteOnServer(importedNote);
                        }
                    } catch (err) {
                        console.error('Error processing imported note:', err);
                    }
                });

                // Reload notes from server
                setTimeout(() => loadNotes(), 500);
                showNotification('Notes imported successfully!', 'success');
            } catch (error) {
                console.error('Error parsing imported notes:', error);
                showNotification('Invalid file format. Please use a proper JSON export.', 'error');
            }
            
            // Reset the file input
            importNotesInput.value = '';
        };
        reader.readAsText(file);
    } catch (error) {
        console.error('Error importing notes:', error);
        showNotification('Failed to import notes. Please try again.', 'error');
        importNotesInput.value = '';
    }
}

    async function importNotes(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const importedNotes = JSON.parse(e.target.result);
                    
                    // Show confirmation dialog
                    await loadNotes();
                    showNotification('Notes imported successfully!', 'success');
                } catch (error) {
                    console.error('Error parsing imported notes:', error);
                    showNotification('Invalid file format. Please use a proper JSON export.', 'error');
                }
                
                // Reset the file input
                importNotesInput.value = '';
            };
            reader.readAsText(file);
        } catch (error) {
            console.error('Error importing notes:', error);
            showNotification('Failed to import notes. Please try again.', 'error');
            // Reset the file input
            importNotesInput.value = '';
        }
    }

    async function updateNoteOnServer(noteData) {
        try {
            // Convert position string back to object if needed
            if (typeof noteData.position === 'string') {
                noteData.position = JSON.parse(noteData.position);
            }
            
            const response = await fetch(`http://localhost:3001/notes/update/${noteData.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'X-Request-ID': `UpdateNote-${noteData.id}`
                },
                body: JSON.stringify(noteData)
            });

            if (!response.ok) {
                console.error('Failed to update imported note:', response.status);
            }
        } catch (error) {
            console.error('Error updating imported note:', error);
        }
    }

    async function createNoteOnServer(noteData) {
        try {
            // Remove id since server will generate a new one
            const { id, ...newNoteData } = noteData;
            
            // Convert position string back to object if needed
            if (typeof newNoteData.position === 'string') {
                newNoteData.position = JSON.parse(newNoteData.position);
            }

            const response = await fetch('http://localhost:3001/notes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'X-Request-ID': 'CreateNewNote'
                },
                body: JSON.stringify(newNoteData)
            });

            if (!response.ok) {
                console.error('Failed to create imported note:', response.status);
            }
        } catch (error) {
            console.error('Error creating imported note:', error);
        }
    }
    
    function showNotification(message, type) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Add close button
        const closeBtn = document.createElement('span');
        closeBtn.className = 'close-notification';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = function() {
            document.body.removeChild(notification);
        };
        notification.appendChild(closeBtn);
        
        // Add to body
        document.body.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 5000);
    }

  
// Fixed filterNotes function
function filterNotes() {
    const searchTerm = searchBar.value.trim();
    // Get current category from sessionStorage
    const currentCategory = sessionStorage.getItem('currentCategory') || 'All Notes';
    let odataFilter = '';
    
    // First apply category filter
    if (currentCategory && currentCategory !== 'All Notes' && currentCategory !== 'Recent') {
        if (currentCategory === 'Pinned') {
            odataFilter = '(pinned eq true)';
        } else {
            const escapedCategory = currentCategory.replace(/'/g, "''");
            odataFilter = `(category eq '${escapedCategory}')`;
        }
    }
    
    // Then add search term filter if exists
    if (searchTerm) {
        const escapedSearchTerm = searchTerm.replace(/'/g, "''");
        const searchFilter = `(contains(title, '${escapedSearchTerm}') or contains(content, '${escapedSearchTerm}'))`;
        
        odataFilter = odataFilter 
            ? `${odataFilter} and ${searchFilter}`
            : searchFilter;
    }
    
    console.log("Combined OData Filter:", odataFilter);
    
    // Reset pagination
    currentPage = 1;
    hasMoreNotes = true;
    
    // Pass the odataFilter and maintain the current category
    loadNotes(1, false, odataFilter, currentCategory);
}

// Fixed filterNotesByCategory function
function filterNotesByCategory(category) {
    console.log('Filtering by category:', category);
    
    // Store current category in sessionStorage
    sessionStorage.setItem('currentCategory', category);
    
    let odataFilter = '';
    if (category && category !== 'All Notes' && category !== 'Recent') {
        if (category === 'Pinned') {
            odataFilter = '(pinned eq true)';
        } else {
            const escapedCategory = category.replace(/'/g, "''");
            odataFilter = `(category eq '${escapedCategory}')`;
        }
    }
    
    // Get current search term if exists and apply it
    const searchTerm = searchBar.value.trim();
    if (searchTerm) {
        const escapedSearchTerm = searchTerm.replace(/'/g, "''");
        const searchFilter = `(contains(title, '${escapedSearchTerm}') or contains(content, '${escapedSearchTerm}'))`;
        
        odataFilter = odataFilter 
            ? `${odataFilter} and ${searchFilter}`
            : searchFilter;
    }
    
    console.log('Generated OData filter:', odataFilter);
    
    // Reset pagination
    currentPage = 1;
    hasMoreNotes = true;
    
    // Load notes with the filter
    loadNotes(1, false, odataFilter, category);
}

    async function saveNotes() {
        //No need to save notes as backend is saving it
                const date = new Date();
                const hours = date.getHours();
                const minutes = date.getMinutes().toString().padStart(2, '0');
                const timeString = `${hours > 12 ? hours - 12 : hours}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;

                // Update the status message with the save time
                statusBar.textContent = statusBar.textContent.replace(/Last saved:.*/, `Last saved: Today ${timeString}`);
    }



    async function loadNotes(page = 1, append = false, odataFilter = '', category = '') {
        try {
            // Save current state before loading
            const currentNotesState = [...notes];
            const currentGridState = notesGrid.innerHTML;
    
            if (isLoading || (!hasMoreNotes && page > 1)) {
                const loadingIndicator = document.getElementById('loading-indicator');
                if (loadingIndicator) {
                    loadingIndicator.style.display = 'none';
                }
                return;
            }
    
            isLoading = true;
            const loadingIndicator = document.getElementById('loading-indicator') || createLoadingIndicator();
            loadingIndicator.style.display = 'flex';
    
            // Handle filter and category persistence
            if (page === 1) {
                // Only set these values when starting a new search/filter
                sessionStorage.setItem('currentFilter', odataFilter);
                if (category) {
                    sessionStorage.setItem('currentCategory', category);
                }
            } else {
                // For pagination, use the stored values if not provided
                if (!odataFilter) {
                    odataFilter = sessionStorage.getItem('currentFilter') || '';
                }
                if (!category) {
                    category = sessionStorage.getItem('currentCategory') || '';
                }
            }
    
            // Build URL with filter
            let url = `http://localhost:3001/notes/list?page=${page}&limit=10`;
            if (odataFilter) {
                const encodedFilter = encodeURIComponent(odataFilter);
                url += `&$filter=${encodedFilter}`;
            }
    
            console.log(`Loading notes with URL: ${url}`);
    
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'X-Request-ID': `LoadNotes-Page${page}${category ? '-' + category : ''}${odataFilter ? '-Filtered' : ''}`
                }
            });
    
            if (response.ok) {
                const data = await response.json();
                let savedNotes = data.notes;
    
                // Store total notes count in sessionStorage
                sessionStorage.setItem('totalNotes', data.totalNotes);
                sessionStorage.setItem('currentPage', page);
    
                if (category === "Recent") {
                    savedNotes = savedNotes.sort((a, b) => b.id - a.id).slice(0, 5);
                }
    
                // Update pagination info
                currentPage = data.currentPage;
                hasMoreNotes = data.hasMore;
    
                // Only clear if it's a new search/filter and we have valid data
                if (!append && page === 1) {
                    notesGrid.innerHTML = '';
                    notes = [];
                }
    
                if (savedNotes && savedNotes.length > 0) {
                    const newNotes = savedNotes.map(savedNote => {
                        const note = new Note(
                            savedNote.id,
                            savedNote.title,
                            savedNote.category,
                            savedNote.content,
                            savedNote.color,
                            savedNote.pinned,
                            savedNote.textColor,
                            savedNote.position ? JSON.parse(savedNote.position) : null,
                            savedNote.width,
                            savedNote.height
                        );
    
                        const noteView = new NoteView(
                            note,
                            deleteNote,
                            pinNote,
                            updateNoteCategory,
                            updateNoteContent,
                            updateNoteTitle,
                            updateNoteColor,
                            resizeNote,
                            updateNoteTextColor,
                            dragNote
                        );
                        note.element = noteView.element;
                        return note;
                    });
    
                    notes = append ? [...notes, ...newNotes] : newNotes;
                    newNotes.forEach(note => notesGrid.appendChild(note.element));
                } else if (page === 1) {
                    // If no notes found and it's the first page, show message
                    notesGrid.innerHTML = '<div class="no-notes">No Notes Found!</div>';
                } else if (append) {
                    // If no notes found but not first page and we're appending
                    // Do nothing as we'll just keep current notes
                }
    
                // Update status bar to reflect current state
                updateStatusBar();
            } else {
                console.error('Failed to load notes:', response.status);
                showNotification('Failed to load notes. Please try again.', 'error');
                // Restore previous state on error
                notes = currentNotesState;
                notesGrid.innerHTML = currentGridState;
            }
        } catch (error) {
            console.error('Error loading notes:', error);
            showNotification('Error loading notes. Please try again.', 'error');
            // Restore previous state on error
            if (notes.length > 0) {
                notes = currentNotesState;
                notesGrid.innerHTML = currentGridState;
            }
        } finally {
            const loadingIndicator = document.getElementById('loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
            isLoading = false;
        }
    }

    function createLoadingIndicator() {
        const loadingIndicator = document.createElement('div');
        loadingIndicator.id = 'loading-indicator';
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.innerHTML = '<div class="spinner"></div><span>Loading more notes...</span>';
        
        // Add to the end of notes grid instead of app container
        notesGrid.appendChild(loadingIndicator);
        return loadingIndicator;
    }
    
    // Add scroll event listener after your other event listeners
    function setupInfiniteScroll() {
        // Check if we're close to the bottom of the page when scrolling
        window.addEventListener('scroll', function() {
            const scrollPosition = window.scrollY || document.documentElement.scrollTop;
            const windowHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;
            
            // Trigger loading when user is within 200px of the bottom
            if (scrollPosition + windowHeight >= documentHeight - 200) {
                if (!isLoading && hasMoreNotes) {
                    loadNotes(currentPage + 1, true);
                }
            }
        });
    }
    
    // Initialize infinite scroll after other event listeners
    setupInfiniteScroll();
    //Controller functions starts here
    async function deleteNote(noteId) {
        // Create overlay for the entire screen
        const overlay = document.createElement('div');
        overlay.className = 'delete-overlay';

        // Create confirmation dialog
        const confirmDialog = document.createElement('div');
    confirmDialog.className = 'delete-confirmation';
    confirmDialog.innerHTML = `
        <div class="delete-header">
            <h3>Delete Note</h3>
        </div>
        <div class="delete-message">Are you sure you want to delete this note?</div>
        <div class="delete-actions">
            <button class="delete-cancel">Cancel</button>
            <button class="delete-confirm">Delete</button>
        </div>
    `;

        // Add the overlay and dialog to the body
        overlay.appendChild(confirmDialog);
    document.body.appendChild(overlay);

        // Add event listeners to the buttons
        confirmDialog.querySelector('.delete-cancel').addEventListener('click', function () {
            overlay.remove();
        });

        confirmDialog.querySelector('.delete-confirm').addEventListener('click', async function () {
           try {
                const response = await fetch(`http://localhost:3001/notes/delete/${noteId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`,
                        'X-Request-ID': `DeleteNote-${noteId}` // Adding identifier for note deletion
                    }
                });

                if (response.ok) {
                    const noteToDelete = notes.find(note => note.id === noteId);
                    if (noteToDelete) {
                        noteToDelete.element.remove(); // Remove from DOM
                    }
                    notes = notes.filter(note => note.id !== noteId); // Remove from array
                     updateStatusBar();
                    saveNotes();
                    overlay.remove();
                } else {
                    console.error('Failed to delete note:', response.status);
                    showNotification('Failed to delete note. Please try again.', 'error');
                }
            } catch (error) {
                console.error('Error deleting note:', error);
                showNotification('Error deleting note. Please try again.', 'error');
            }
        });
    }

    // Controller function to update a note's category
    async function updateNoteCategory(noteId, category) {
        const note = notes.find(note => note.id === noteId);
        if (note) {
            note.category = category;
            saveNotes();
            batchManager.queueUpdate(noteId, { category });
        }
    }

    // Controller function to update a note's content
    async function updateNoteContent(noteId, content) {
        const note = notes.find(note => note.id === noteId);
        if (note) {
            note.content = content;
            saveNotes();
            batchManager.queueUpdate(noteId, { content });
        }
    }

    // Controller function to update a note's title
    async function updateNoteTitle(noteId, title) {
        const note = notes.find(note => note.id === noteId);
        if (note) {
            note.title = title;
            saveNotes();
            batchManager.queueUpdate(noteId, { title });
        }
    }

    // Controller function to update a note's color
    async function updateNoteColor(noteId, color) {
        const note = notes.find(note => note.id === noteId);
        if (note) {
            note.color = color;
            if (note.element) {
                const classes = note.element.className
                    .split(' ')
                    .filter(cls => !cls.startsWith('note-') || cls === 'note');
                note.element.className = [...classes, `note-${color}`].join(' ');
            }
            saveNotes();
            batchManager.queueUpdate(noteId, { color });
        }
    }

    // Controller function to update a note's text color
    async function updateNoteTextColor(noteId, textColor) {
        const note = notes.find(note => note.id === noteId);
        if (note) {
            note.textColor = textColor;
            if (note.element) {
                const contentEl = note.element.querySelector('.note-content');
                const titleEl = note.element.querySelector('.note-title');
                if (contentEl) contentEl.style.color = textColor;
                if (titleEl) titleEl.style.color = textColor;
                note.element.dataset.originalTextColor = textColor;
            }
            saveNotes();
            batchManager.queueUpdate(noteId, { textColor });
        }
    }

    // Controller function to update a note's pinned state
    async function pinNote(noteId, pinned) {
        const note = notes.find(note => note.id === noteId);
        if (note) {
            note.pinned = pinned;
            updateStatusBar();
            saveNotes();
            batchManager.queueUpdate(noteId, { pinned });
        }
    }

    // Controller function to handle note resizing
    async function resizeNote(noteId, width, height) {
        const note = notes.find(note => note.id === noteId);
        if (note) {
            note.width = width;
            note.height = height;
            saveNotes();
            batchManager.queueUpdate(noteId, { width, height });
        }
    }

    // Controller function to handle note dragging
    async function dragNote(noteId, position) {
        const note = notes.find(note => note.id === noteId);
        if (note) {
            note.position = position;
            saveNotes();
            batchManager.queueUpdate(noteId, { position });
        }
    }

     function updateStatusBar() {
        // No need to save to local storage, just update status bar
        const date = new Date();
        const hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const timeString = `${hours > 12 ? hours - 12 : hours}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;

        const pinnedCount = notes.filter(note => note.pinned).length;
        statusBar.textContent = `${notes.length} notes • ${pinnedCount} pinned • Last saved: Today ${timeString}`;
    }
    // Attach event listener to the add note buttona
    floatingAddButton.addEventListener('click', async () => {
        try {
            // Make a POST request to create a new note on the server
            const response = await fetch('http://localhost:3001/notes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'X-Request-ID': 'CreateNewEmptyNote' // Adding identifier for new empty note creation
                },
                body: JSON.stringify({
                    title: '',
                    category: 'Personal',
                    content: '',
                    color: 'yellow',
                    pinned: false,
                    textColor: '#000000',
                    position: null,
                    width: '',
                    height: ''
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                const newNote = new Note(
                    data.noteId,
                    '',
                    'Personal',
                    '',
                    'yellow',
                    false,
                    '#000000',
                    null,
                    '',
                    ''
                );
                
                const noteView = new NoteView(
                    newNote,
                    deleteNote,
                    pinNote,
                    updateNoteCategory,
                    updateNoteContent,
                    updateNoteTitle,
                    updateNoteColor,
                    resizeNote,
                    updateNoteTextColor,
                    dragNote
                );
                
                // Set placeholder text only in the front-end element
                noteView.element.querySelector('.note-title').setAttribute('placeholder', 'Click to edit title');
                noteView.element.querySelector('.note-content').innerHTML = '<p class="placeholder-text">Type your note here...</p>';
                
                notes.push(newNote);
                newNote.element = noteView.element;
                notesGrid.appendChild(noteView.element);
                
                const noNotesMessage = notesGrid.querySelector('.no-notes');
                if (noNotesMessage) {
                    noNotesMessage.remove();
                }
                
                updateStatusBar();
                saveNotes();
            } else {
                console.error('Failed to create note:', response.status);
                showNotification('Failed to create note. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Error creating note:', error);
            showNotification('Error creating note. Please try again.', 'error');
        }
    });


// Hide text color options when clicking elsewhere
document.addEventListener('click', (e) => {
    // First check if the elements exist before accessing their methods
    const colorOptionsContainer = document.getElementById('colorOptionsContainer');
    const colorToggle = document.querySelector('.color-toggle');
    const textColorOptionsContainer = document.querySelector('.text-color-options');
    const textColorToggle = document.querySelector('.text-color-toggle');
    
    if (colorOptionsContainer && colorToggle) {
        if (!colorOptionsContainer.contains(e.target) && e.target !== colorToggle) {
            colorOptionsContainer.classList.add('hidden');
            colorToggle.classList.remove('active');
        }
    }
    
    if (textColorOptionsContainer && textColorToggle) {
        if (!textColorOptionsContainer.contains(e.target) && e.target !== textColorToggle) {
            textColorOptionsContainer.classList.add('hidden');
            textColorToggle.classList.remove('active');
        }
    }
});

// Add text color toggle event listener
if (textColorToggle) {
    textColorToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        textColorOptionsContainer.classList.toggle('hidden');
        textColorToggle.classList.toggle('active');
        // Close color options if open
        colorOptionsContainer.classList.add('hidden');
        colorToggle.classList.remove('active');
    });
}

darkModeToggle.addEventListener('click', function() {
    darkMode = !darkMode;
    localStorage.setItem('darkMode', darkMode);
    
    const toggleSwitch = this.querySelector('.toggle-switch');
    if (darkMode) {
        document.body.classList.add('dark-mode');
        toggleSwitch.classList.add('active');
    } else {
        document.body.classList.remove('dark-mode');
        toggleSwitch.classList.remove('active');
    }
    
    // Update all notes' text colors for better contrast in dark mode
    notes.forEach(note => {
        const noteContent = note.element.querySelector('.note-content');
        const noteTitle = note.element.querySelector('.note-title');
        
        if (darkMode) {
            // Store original text color if not in dark mode already
            if (!note.element.dataset.originalTextColor) {
                note.element.dataset.originalTextColor = note.textColor || '#000';
            }
            // Use light text in dark mode for better visibility
            noteContent.style.color = '#fff';
            noteTitle.style.color = '#fff';
        } else {
            // Restore original text color
            const originalColor = note.element.dataset.originalTextColor || note.textColor || '#000';
            noteContent.style.color = originalColor;
            noteTitle.style.color = originalColor;
        }
    });
});

});