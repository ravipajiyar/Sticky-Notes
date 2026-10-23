const mysql = require("mysql2/promise");
const { Pool } = require("pg");
require("dotenv").config();

const connectionString = process.env.DATABASE_URL;
const usePostgres = /^postgres(ql)?:\/\//i.test(connectionString || "");

if (connectionString && !usePostgres) {
  throw new Error(
    "DATABASE_URL must be a PostgreSQL connection string (postgres://...). Use DB_* variables for MySQL.",
  );
}

function pgSslConfig(url) {
  if (process.env.PGSSL === "false") return false;
  if (process.env.PGSSL === "true") return { rejectUnauthorized: false };
  if (/sslmode=require/i.test(url)) return { rejectUnauthorized: false };

  try {
    const host = new URL(url).hostname;
    // Render's internal database hostname has no dots and does not support SSL.
    if (host === "localhost" || host === "127.0.0.1" || !host.includes(".")) {
      return false;
    }
    return { rejectUnauthorized: false };
  } catch {
    return { rejectUnauthorized: false };
  }
}

const pgPool = usePostgres
  ? new Pool({
      connectionString,
      ssl: pgSslConfig(connectionString),
      max: 10,
      idleTimeoutMillis: 30000,
    })
  : null;

const mysqlPool = usePostgres
  ? null
  : mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT,
      waitForConnections: true,
      connectionLimit: 10,
      ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
    });

function toPgPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

// PostgreSQL folds unquoted identifiers to lower case. The existing code
// (and the frontend) expects camelCase keys, so map them back after reading.
const columnAliases = {
  userid: "userId",
  googleid: "googleId",
  displayname: "displayName",
  textcolor: "textColor",
};

function mapRow(row) {
  if (!row || typeof row !== "object") return row;
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[columnAliases[key] || key] = value;
  }
  return mapped;
}

async function runPgQuery(runner, sql, params = []) {
  const command = sql.trim().split(/\s+/)[0].toUpperCase();
  let text = toPgPlaceholders(sql);

  if (command === "INSERT" && !/\bRETURNING\b/i.test(text)) {
    text += " RETURNING id";
  }

  const result = await runner.query(text, params);

  if (command === "INSERT") {
    return [
      {
        insertId: result.rows[0] ? result.rows[0].id : null,
        affectedRows: result.rowCount,
      },
      result,
    ];
  }

  if (command === "UPDATE" || command === "DELETE") {
    return [{ affectedRows: result.rowCount, changedRows: result.rowCount }, result];
  }

  return [result.rows.map(mapRow), result];
}

const pgAdapter = {
  query: (sql, params) => runPgQuery(pgPool, sql, params),
  async getConnection() {
    const client = await pgPool.connect();
    return {
      query: (sql, params) => runPgQuery(client, sql, params),
      beginTransaction: () => client.query("BEGIN"),
      commit: () => client.query("COMMIT"),
      rollback: () => client.query("ROLLBACK"),
      release: () => client.release(),
    };
  },
};

// Helper for the existing code structure
async function connectDB() {
  return usePostgres ? pgAdapter : mysqlPool;
}

async function ensureSchema() {
  const pool = await connectDB();

  if (usePostgres) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(512) NOT NULL,
        googleId VARCHAR(255) NULL,
        displayName VARCHAR(255) NULL
      )
    `);

    await pool.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (LOWER(username))",
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        category VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        color VARCHAR(50) NOT NULL,
        pinned SMALLINT DEFAULT 0,
        textColor VARCHAR(50) NOT NULL,
        position TEXT NULL,
        width VARCHAR(50) NULL,
        height VARCHAR(50) NULL
      )
    `);
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(512) NOT NULL,
      googleId VARCHAR(255) NULL,
      displayName VARCHAR(255) NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      title VARCHAR(500) NOT NULL,
      category VARCHAR(100) NOT NULL,
      content TEXT NOT NULL,
      color VARCHAR(50) NOT NULL,
      pinned TINYINT(1) DEFAULT 0,
      textColor VARCHAR(50) NOT NULL,
      position TEXT NULL,
      width VARCHAR(50) NULL,
      height VARCHAR(50) NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

async function closeDB() {
  if (pgPool) await pgPool.end();
  if (mysqlPool) await mysqlPool.end();
}

module.exports = {
  connectDB,
  ensureSchema,
  closeDB,
  isPostgres: usePostgres,
};
