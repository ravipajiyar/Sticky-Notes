const { ensureSchema, closeDB, isPostgres } = require("./config/database");

const migrate = async () => {
  console.log(
    `Running database migration against ${isPostgres ? "PostgreSQL (Render)" : "MySQL"}...`,
  );
  await ensureSchema();
  console.log("Database schema is ready.");
};

migrate()
  .catch((error) => {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closeDB();
    } catch (error) {
      console.error("Failed to close database connection:", error.message);
    }
  });
