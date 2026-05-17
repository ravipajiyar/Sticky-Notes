const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const notesRoutes = require("./routes/notes");
const { connectDB } = require("./config/database");
const dotenv = require("dotenv");
const path = require("path");
const passport = require("passport");
const cookieParser = require("cookie-parser");

dotenv.config();

const app = express();
// FIX 1: Use dynamic port for Render
const port = process.env.PORT || 3001;

// FIX 2: Production CORS settings
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:5500",
  "https://sticky-notes-pro.onrender.com", // Replace with your actual Render URL
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        return callback(new Error("CORS Policy Blocked"), false);
      }
      return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());
app.use(cookieParser());

// Serve static files from frontend/views
const staticFilesPath = path.join(__dirname, "../frontend/views");
app.use(express.static(staticFilesPath));

// API Routes
app.use("/auth", authRoutes);
app.use("/notes", notesRoutes);

// Page Routing
app.get("/", (req, res) => {
  res.redirect("/auth.html");
});

app.get("/index.html", (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.redirect("/auth.html");
  }
  res.sendFile(path.join(staticFilesPath, "index.html"));
});

// Database Connection & Server Start
connectDB()
  .then(() => {
    app.listen(port, () => {
      // Clean production log
      if (process.env.NODE_ENV !== "production") {
        console.log(`🚀 Server is running on port ${port}`);
      }
    });
  })
  .catch((error) => {
    console.error("❌ Database Initialization Failed!", error);
    process.exit(1); // Exit if DB fails
  });
