class Note {
    constructor(id, title, category, content, color, pinned, textColor, position, width, height) {
        this.id = id || Date.now();
        this.title = title || 'Click to edit title';
        this.category = category || 'Personal';
        this.content = content || '<p>Type your note here...</p>';
        this.color = color || 'yellow';
        this.pinned = pinned === undefined ? true : pinned;
        this.textColor = textColor || '#000';
        this.position = position || null;
        this.width = width || '';
        this.height = height || '';
    }

    static setupIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = window.indexedDB.open('NotesAppDB', 2);

            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.error);
                reject('Error opening IndexedDB');
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('notes')) {
                    const notesStore = db.createObjectStore('notes', {keyPath: 'id'});
                    notesStore.createIndex('pinned', 'pinned', {unique: false});
                }
            };

            request.onsuccess = (event) => {
                const db = event.target.result;
                resolve(db);
            };
        });
    }
    static saveNotes(notes) {
        return Note.setupIndexedDB().then(db => {
            const transaction = db.transaction(['notes'], 'readwrite');
            const notesStore = transaction.objectStore('notes');

            // Clear all existing notes
            const clearRequest = notesStore.clear();

            clearRequest.onsuccess = () => {
                // Add all current notes
                notes.forEach(note => {
                    notesStore.add(note);
                });
            };

            return new Promise((resolve, reject) => {
                transaction.oncomplete = () => {
                    resolve();
                };

                transaction.onerror = (event) => {
                    console.error('Transaction error:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }

    static loadNotes() {
        return Note.setupIndexedDB().then(db => {
            const transaction = db.transaction(['notes'], 'readonly');
            const notesStore = transaction.objectStore('notes');
            const getRequest = notesStore.getAll();

            return new Promise((resolve, reject) => {
                getRequest.onsuccess = (event) => {
                    const savedNotes = event.target.result;
                    resolve(savedNotes);
                };

                getRequest.onerror = (event) => {
                    console.error('Error loading notes:', event.target.error);
                    reject(event.target.error);
                };
            });
        });
    }
}