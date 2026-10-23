const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const notesRoutes = require("./routes/notes");
const { ensureSchema } = require("./config/database");
const dotenv = require("dotenv");
const path = require("path");
const jwt = require("jsonwebtoken");
const passport = require("passport");
const cookieParser = require("cookie-parser");

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET || "dev-only-secret-change-me";

if (isProduction && !process.env.JWT_SECRET) {
  console.error("JWT_SECRET must be set in production.");
  process.exit(1);
}

app.set("trust proxy", 1);

const configuredOrigins = [process.env.FRONTEND_URL, process.env.CORS_ORIGINS]
  .filter(Boolean)
  .flatMap((value) => value.split(","))
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);

const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:5500",
  "https://sticky-notes-pro.onrender.com",
  ...configuredOrigins,
]);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (!allowedOrigins.has(origin)) {
        // Do not throw: same-origin requests proxied through Vercel still work,
        // while browsers block direct cross-origin access because no CORS
        // headers are returned for unlisted origins.
        return callback(null, false);
      }
      return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
app.use(passport.initialize());

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", database: process.env.DATABASE_URL ? "postgres" : "mysql" });
});

const staticFilesPath = path.join(__dirname, "../frontend/views");

function hasValidToken(req) {
  const token = req.cookies.token;
  if (!token) return false;
  try {
    jwt.verify(token, jwtSecret);
    return true;
  } catch {
    return false;
  }
}

// API Routes
app.use("/auth", authRoutes);
app.use("/notes", notesRoutes);

// Page Routing (before static so /index.html cannot bypass the guard)
app.get("/", (req, res) => {
  res.redirect(hasValidToken(req) ? "/index.html" : "/auth.html");
});

app.get("/index.html", (req, res) => {
  if (!hasValidToken(req)) {
    return res.redirect("/auth.html");
  }
  res.sendFile(path.join(staticFilesPath, "index.html"));
});

// Serve static files from frontend/views (local dev / single-service hosting).
app.use(express.static(staticFilesPath, { index: false }));

// Database Connection & Server Start
ensureSchema()
  .then(() => {
    app.listen(port, () => {
      if (!isProduction) {
        console.log(`Server is running on port ${port}`);
      }
    });
  })
  .catch((error) => {
    console.error("Database initialization failed:", error);
    process.exit(1);
  });
