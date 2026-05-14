const express = require('express');
const router = express.Router();
const { connectDB } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const sql = require('mssql');
const { parseOData } = require('odata-parser');
const { translateODataToSql } = require('../odata-to-sql');

// Helper function to get request identifier
const getRequestIdentifier = (req) => {
    return req.headers['x-request-id'] || 'UnknownRequest';
};

// Create a new note
router.post('/', authenticateToken, async (req, res) => {
    const requestId = getRequestIdentifier(req);
    const { title, category, content, color, pinned, textColor, position, width, height } = req.body;
    
    try {
        const pool = await connectDB();
        
        // Insert the new note
        const result = await pool.request()
            .input('userId', sql.Int, req.user.id)
            .input('title', sql.NVarChar, title || 'New Note')
            .input('category', sql.NVarChar, category || 'Personal')
            .input('content', sql.NVarChar, content || '')
            .input('color', sql.NVarChar, color || 'yellow')
            .input('pinned', sql.Bit, pinned || false)
            .input('textColor', sql.NVarChar, textColor || '#000000')
            .input('position', sql.NVarChar, position ? JSON.stringify(position) : null)
            .input('width', sql.NVarChar, width || '')
            .input('height', sql.NVarChar, height || '')
            .query(`
                INSERT INTO notes (userId, title, category, content, color, pinned, textColor, position, width, height)
                OUTPUT INSERTED.id
                VALUES (@userId, @title, @category, @content, @color, @pinned, @textColor, @position, @width, @height)
            `);
        
        const noteId = result.recordset[0].id;
        
        res.status(201).json({
            requestId,
            message: 'Note created successfully',
            noteId: noteId
        });
    } catch (error) {
        console.error('Error creating note:', error);
        res.status(500).json({ 
            requestId, 
            message: 'Failed to create note', 
            error: error.message 
        });
    }
});

// Get all notes (list view)
router.get('/list', authenticateToken, async (req, res) => {
    const requestId = getRequestIdentifier(req);
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        
        let odataFilter = req.query.$filter ? decodeURIComponent(req.query.$filter) : '';
        if (odataFilter.startsWith('$filter=')) {
            odataFilter = odataFilter.slice(8);
        }
        
        const pool = await connectDB();
        
        let whereClause = 'WHERE userId = @userId';
        const params = { userId: { type: sql.Int, value: req.user.id } };

        if (odataFilter) {
            try {
                const { where, parameters } = translateODataToSql(odataFilter);
                if (where) {
                    whereClause += ` AND (${where})`;
                    Object.assign(params, parameters);
                }
            } catch (error) {
                return res.status(400).json({ 
                    requestId,
                    message: 'Invalid OData filter', 
                    error: error.message,
                    filter: odataFilter
                });
            }
        }

        // First get total count
        const countQuery = `
            SELECT COUNT(*) as total
            FROM notes
            ${whereClause}
        `;
        
        const countRequest = pool.request();
        for (const [key, param] of Object.entries(params)) {
            countRequest.input(key.replace('@', ''), param.type, param.value);
        }
        const countResult = await countRequest.query(countQuery);
        const totalNotes = countResult.recordset[0].total;
        
        const query = `
            SELECT id, title, category, content, color, pinned, textColor, position, width, height
            FROM notes
            ${whereClause}
            ORDER BY pinned DESC, id DESC
            OFFSET ${offset} ROWS
            FETCH NEXT ${limit} ROWS ONLY;
        `;
        
        const request = pool.request();
        for (const [key, param] of Object.entries(params)) {
            request.input(key.replace('@', ''), param.type, param.value);
        }
        
        const result = await request.query(query);
        
        const totalPages = Math.ceil(totalNotes / limit);
        const hasMore = page < totalPages;
        
        res.status(200).json({
            requestId,
            notes: result.recordset,
            currentPage: page,
            totalPages: totalPages,
            totalNotes: totalNotes,
            hasMore: hasMore
        });
    } catch (error) {
        console.error('Error getting notes:', error);
        res.status(500).json({ 
            requestId,
            message: 'Failed to get notes', 
            error: error.message 
        });
    }
});

// Get a single note
router.get('/:id', authenticateToken, async (req, res) => {
    const requestId = getRequestIdentifier(req);
    const noteId = req.params.id;

    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('noteId', sql.Int, noteId)
            .input('userId', sql.Int, req.user.id)
            .query(`
                SELECT id, title, category, content, color, pinned, textColor, position, width, height
                FROM notes
                WHERE id = @noteId AND userId = @userId
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ requestId, message: 'Note not found' });
        }

        res.status(200).json({ requestId, ...result.recordset[0] });
    } catch (error) {
        console.error('Error getting note:', error);
        res.status(500).json({ requestId, message: 'Failed to get note', error: error.message });
    }
});

// Create a new note
router.post('/batch-update', authenticateToken, async (req, res) => {
    const requestId = req.headers['x-request-id'] || 'batch-' + Date.now();
    const { updates } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(updates)) {
        return res.status(400).json({ 
            requestId,
            message: 'Invalid batch format - expected array of updates',
            received: typeof updates
        });
    }

    const results = {
        successfulNotes: [],
        failedNotes: []
    };

    try {
        const pool = await connectDB();
        const transaction = new sql.Transaction(pool);
        
        await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
        
        try {
            for (const update of updates) {
                let noteId;
                try {
                    // Validate required fields
                    if (!update.noteId) {
                        throw new Error('Missing noteId in batch update');
                    }
                    noteId = update.noteId;

                    // Get current note state
                    const getResult = await transaction.request()
                        .input('noteId', sql.Int, noteId)
                        .input('userId', sql.Int, userId)
                        .query(`
                            SELECT title, category, content, color, pinned, 
                                   textColor, position, width, height
                            FROM notes
                            WHERE id = @noteId AND userId = @userId
                        `);

                    if (getResult.recordset.length === 0) {
                        throw new Error('Note not found');
                    }

                    // Merge updates with existing data
                    const currentNote = getResult.recordset[0];
                    const mergedNote = {
                        title: update.title || currentNote.title,
                        category: update.category || currentNote.category,
                        content: update.content || currentNote.content,
                        color: update.color || currentNote.color,
                        pinned: update.pinned !== undefined ? update.pinned : currentNote.pinned,
                        textColor: update.textColor || currentNote.textColor,
                        position: update.position ? JSON.stringify(update.position) : currentNote.position,
                        width: update.width || currentNote.width,
                        height: update.height || currentNote.height
                    };

                    // Perform update
                    await transaction.request()
                        .input('noteId', sql.Int, noteId)
                        .input('userId', sql.Int, userId)
                        .input('title', sql.NVarChar, mergedNote.title)
                        .input('category', sql.NVarChar, mergedNote.category)
                        .input('content', sql.NVarChar, mergedNote.content)
                        .input('color', sql.NVarChar, mergedNote.color)
                        .input('pinned', sql.Bit, mergedNote.pinned)
                        .input('textColor', sql.NVarChar, mergedNote.textColor)
                        .input('position', sql.NVarChar, mergedNote.position)
                        .input('width', sql.NVarChar, mergedNote.width)
                        .input('height', sql.NVarChar, mergedNote.height)
                        .query(`
                            UPDATE notes SET
                                title = @title,
                                category = @category,
                                content = @content,
                                color = @color,
                                pinned = @pinned,
                                textColor = @textColor,
                                position = @position,
                                width = @width,
                                height = @height
                            WHERE id = @noteId AND userId = @userId
                        `);

                    results.successfulNotes.push(noteId);
                } catch (error) {
                    results.failedNotes.push({
                        noteId: noteId || 'unknown',
                        error: error.message
                    });
                    // Continue processing other updates
                }
            }

            await transaction.commit();
            res.status(207).json({
                requestId,
                message: 'Batch update processed',
                totalUpdates: updates.length,
                ...results
            });
        } catch (error) {
            await transaction.rollback();
            console.error('Batch transaction error:', error);
            res.status(500).json({
                requestId,
                message: 'Batch transaction failed',
                error: error.message
            });
        }
    } catch (error) {
        console.error('Batch update error:', error);
        res.status(500).json({
            requestId,
            message: 'Batch update failed',
            error: error.message
        });
    }
});

// Update a note
router.put('/update/:id', authenticateToken, async (req, res) => {
    const requestId = getRequestIdentifier(req);
    const noteId = req.params.id;
    const updates = req.body;

    // **Validation (Example):**
    if (updates.category) {
        const validCategories = ['Personal', 'Work', 'Ideas', 'Other']; // Allowed categories
        if (!validCategories.includes(updates.category)) {
            return res.status(400).json({ requestId, message: 'Invalid category' });
        }
    }

    try {
        // First, get the current note to maintain existing values (only fetch what's needed)
        const pool = await connectDB();
        const getNoteResult = await pool.request()
            .input('noteId', sql.Int, noteId)
            .input('userId', sql.Int, req.user.id)
            .query(`
                SELECT title, category, content, color, pinned, textColor, position, width, height
                FROM notes
                WHERE id = @noteId AND userId = @userId
            `);

        if (getNoteResult.recordset.length === 0) {
            return res.status(404).json({ requestId, message: 'Note not found' });
        }

        // Current note data
        const currentNote = getNoteResult.recordset[0];

        // Prepare the update request with all fields (updated or existing)
        const request = pool.request();
        request.input('noteId', sql.Int, noteId);
        request.input('userId', sql.Int, req.user.id);
        request.input('title', sql.NVarChar, updates.title || currentNote.title);
        request.input('category', sql.NVarChar, updates.category || currentNote.category);
        request.input('content', sql.NVarChar, updates.content || currentNote.content);
        request.input('color', sql.NVarChar, updates.color || currentNote.color);
        request.input('pinned', sql.Bit, updates.pinned !== undefined ? updates.pinned : currentNote.pinned);
        request.input('textColor', sql.NVarChar, updates.textColor || currentNote.textColor);

        // Handle position specially since it's stored as a JSON string
        const position = updates.position
            ? JSON.stringify(updates.position)
            : currentNote.position;
        request.input('position', sql.NVarChar, position);

        request.input('width', sql.NVarChar, updates.width || currentNote.width);
        request.input('height', sql.NVarChar, updates.height || currentNote.height);

        const query = `
            UPDATE notes SET
                title = @title,
                category = @category,
                content = @content,
                color = @color,
                pinned = @pinned,
                textColor = @textColor,
                position = @position,
                width = @width,
                height = @height
            WHERE id = @noteId AND userId = @userId
        `;

        const result = await request.query(query);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ requestId, message: 'Note not found or not updated' });
        }

        res.status(200).json({ requestId, message: 'Note updated successfully' });
    } catch (error) {
        console.error('Error updating note:', error);
        res.status(500).json({ requestId, message: 'Failed to update note', error: error.message });
    }
});

// Delete a note
router.delete('/delete/:id', authenticateToken, async (req, res) => {
    const requestId = getRequestIdentifier(req);
    const noteId = req.params.id;

    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('noteId', sql.Int, noteId)
            .input('userId', sql.Int, req.user.id)
            .query('DELETE FROM notes WHERE id = @noteId AND userId = @userId');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ requestId, message: 'Note not found' });
        }

        res.status(200).json({ requestId, message: 'Note deleted successfully' });
    } catch (error) {
        console.error('Error deleting note:', error);
        res.status(500).json({ requestId, message: 'Failed to delete note', error: error.message });
    }
});

module.exports = router;