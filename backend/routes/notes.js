const express = require("express");
const router = express.Router();
const { connectDB } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");
const { translateODataToSql } = require("../odata-to-sql");

const getRequestIdentifier = (req) =>
  req.headers["x-request-id"] || "Req-" + Date.now();

// CREATE
router.post("/", authenticateToken, async (req, res) => {
  const requestId = getRequestIdentifier(req);
  const {
    title,
    category,
    content,
    color,
    pinned,
    textColor,
    position,
    width,
    height,
  } = req.body;

  try {
    const pool = await connectDB();
    const [result] = await pool.query(
      `INSERT INTO notes (userId, title, category, content, color, pinned, textColor, position, width, height)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        title || "New Note",
        category || "Personal",
        content || "",
        color || "yellow",
        pinned ? 1 : 0,
        textColor || "#000000",
        position ? JSON.stringify(position) : null,
        width || "",
        height || "",
      ],
    );

    res
      .status(201)
      .json({ requestId, message: "Note created", noteId: result.insertId });
  } catch (error) {
    res
      .status(500)
      .json({
        requestId,
        message: "Failed to create note",
        error: error.message,
      });
  }
});

// LIST (OData + MySQL Pagination)
router.get("/list", authenticateToken, async (req, res) => {
  const requestId = getRequestIdentifier(req);
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    let odataFilter = req.query.$filter
      ? decodeURIComponent(req.query.$filter)
      : "";
    if (odataFilter.startsWith("$filter=")) odataFilter = odataFilter.slice(8);

    const pool = await connectDB();
    let whereClause = "WHERE userId = ?";
    let values = [req.user.id];

    if (odataFilter) {
      const { where, parameters } = translateODataToSql(odataFilter);
      if (where) {
        // Convert odata-parser style @p0 to MySQL ?
        let mysqlWhere = where.replace(/@p\d+/g, "?");
        whereClause += ` AND (${mysqlWhere})`;
        values.push(...parameters);
      }
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM notes ${whereClause}`,
      values,
    );
    const totalNotes = countRows[0].total;

    // MySQL uses LIMIT ? OFFSET ? instead of OFFSET / FETCH
    const [rows] = await pool.query(
      `SELECT * FROM notes ${whereClause} ORDER BY pinned DESC, id DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    );

    const totalPages = Math.ceil(totalNotes / limit);
    res.status(200).json({
      requestId,
      notes: rows,
      currentPage: page,
      totalPages: totalPages,
      totalNotes: totalNotes,
      hasMore: page < totalPages,
    });
  } catch (error) {
    res
      .status(500)
      .json({
        requestId,
        message: "Failed to get notes",
        error: error.message,
      });
  }
});

// GET SINGLE
router.get("/:id", authenticateToken, async (req, res) => {
  const requestId = getRequestIdentifier(req);
  try {
    const pool = await connectDB();
    const [rows] = await pool.query(
      "SELECT * FROM notes WHERE id = ? AND userId = ?",
      [req.params.id, req.user.id],
    );
    if (rows.length === 0)
      return res.status(404).json({ requestId, message: "Note not found" });
    res.status(200).json({ requestId, ...rows[0] });
  } catch (error) {
    res
      .status(500)
      .json({ requestId, message: "Failed to get note", error: error.message });
  }
});

// BATCH UPDATE (MySQL Transactions)
router.post("/batch-update", authenticateToken, async (req, res) => {
  const requestId = getRequestIdentifier(req);
  const { updates } = req.body;
  const pool = await connectDB();
  const connection = await pool.getConnection();
  const results = { successfulNotes: [], failedNotes: [] };

  try {
    await connection.beginTransaction();
    for (const update of updates) {
      try {
        if (!update.noteId) throw new Error("Missing noteId");

        const [existing] = await connection.query(
          "SELECT * FROM notes WHERE id = ? AND userId = ?",
          [update.noteId, req.user.id],
        );
        if (existing.length === 0) throw new Error("Note not found");

        const current = existing[0];
        const pos = update.position
          ? JSON.stringify(update.position)
          : current.position;

        await connection.query(
          `UPDATE notes SET title=?, category=?, content=?, color=?, pinned=?, textColor=?, position=?, width=?, height=? 
                     WHERE id=? AND userId=?`,
          [
            update.title || current.title,
            update.category || current.category,
            update.content || current.content,
            update.color || current.color,
            update.pinned !== undefined
              ? update.pinned
                ? 1
                : 0
              : current.pinned,
            update.textColor || current.textColor,
            pos,
            update.width || current.width,
            update.height || current.height,
            update.noteId,
            req.user.id,
          ],
        );
        results.successfulNotes.push(update.noteId);
      } catch (err) {
        results.failedNotes.push({ noteId: update.noteId, error: err.message });
      }
    }
    await connection.commit();
    res.status(207).json({ requestId, message: "Batch processed", ...results });
  } catch (error) {
    await connection.rollback();
    res
      .status(500)
      .json({ requestId, message: "Batch sync failed", error: error.message });
  } finally {
    connection.release();
  }
});

// UPDATE SINGLE
router.put("/update/:id", authenticateToken, async (req, res) => {
  const requestId = getRequestIdentifier(req);
  try {
    const pool = await connectDB();
    const [existing] = await pool.query(
      "SELECT * FROM notes WHERE id = ? AND userId = ?",
      [req.params.id, req.user.id],
    );
    if (existing.length === 0)
      return res.status(404).json({ requestId, message: "Note not found" });

    const current = existing[0];
    const updates = req.body;
    const pos = updates.position
      ? JSON.stringify(updates.position)
      : current.position;

    await pool.query(
      `UPDATE notes SET title=?, category=?, content=?, color=?, pinned=?, textColor=?, position=?, width=?, height=? 
             WHERE id=? AND userId=?`,
      [
        updates.title || current.title,
        updates.category || current.category,
        updates.content || current.content,
        updates.color || current.color,
        updates.pinned !== undefined
          ? updates.pinned
            ? 1
            : 0
          : current.pinned,
        updates.textColor || current.textColor,
        pos,
        updates.width || current.width,
        updates.height || current.height,
        req.params.id,
        req.user.id,
      ],
    );
    res.status(200).json({ requestId, message: "Note updated successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ requestId, message: "Update failed", error: error.message });
  }
});

// DELETE
router.delete("/delete/:id", authenticateToken, async (req, res) => {
  const requestId = getRequestIdentifier(req);
  try {
    const pool = await connectDB();
    const [result] = await pool.query(
      "DELETE FROM notes WHERE id = ? AND userId = ?",
      [req.params.id, req.user.id],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ requestId, message: "Note not found" });
    res.status(200).json({ requestId, message: "Note deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ requestId, message: "Delete failed", error: error.message });
  }
});

module.exports = router;
