// config/database.js
const sql = require('mssql');
const dotenv = require('dotenv');
dotenv.config();

const dbConfig = {
  server: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '1433', 10),
  options: {
    encrypt: false, // Set to true in production if using Azure
    trustServerCertificate: true // set to false to check server certificate
  }
};

async function connectDB() {
  try {
    const pool = new sql.ConnectionPool(dbConfig);
    await pool.connect(); // connect to database
    console.log('Database connected sucessfully');
    return pool;
  } catch (err) {
    console.error('Database connection failed:', err.message);
    throw err;
  }
}

module.exports = { connectDB };