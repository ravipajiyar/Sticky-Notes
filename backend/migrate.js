const mysql = require('mysql2/promise');
require('dotenv').config();

const migrate = async () => {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
        ssl: { rejectUnauthorized: false }
    });

    console.log("🚀 Connected to Aiven! Creating tables...");

    try {
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(512) NOT NULL,
                googleId VARCHAR(255) NULL,
                displayName VARCHAR(255) NULL
            )
        `);

        await connection.query(`
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

        console.log("✅ Tables created successfully!");
    } catch (err) {
        console.error("❌ Migration failed:", err.message);
    } finally {
        await connection.end();
    }
};

migrate();