const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { connectDB } = require("../config/database");
const dotenv = require("dotenv");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: isProduction
        ? "https://sticky-notes-pro.onrender.com/auth/google/callback"
        : "http://localhost:3001/auth/google/callback",
    },
    async function (accessToken, refreshToken, profile, done) {
      try {
        const pool = await connectDB();

        // MySQL: Using LIMIT 1 instead of TOP 1
        const [users] = await pool.query(
          "SELECT * FROM users WHERE googleId = ? LIMIT 1",
          [profile.id],
        );

        if (users.length > 0) {
          return done(null, users[0]);
        }

        const username = profile.emails[0].value || `google_user_${profile.id}`;
        const randomPassword = Math.random().toString(36).slice(-10);
        const hashedPassword = await bcrypt.hash(randomPassword, 10);

        const [result] = await pool.query(
          "INSERT INTO users (username, password, googleId, displayName) VALUES (?, ?, ?, ?)",
          [username, hashedPassword, profile.id, profile.displayName || ""],
        );

        const [newUser] = await pool.query("SELECT * FROM users WHERE id = ?", [
          result.insertId,
        ]);
        return done(null, newUser[0]);
      } catch (error) {
        console.error("Error during Google auth:", error);
        return done(error, null);
      }
    },
  ),
);

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/auth.html?error=Google%20authentication%20failed",
  }),
  async function (req, res) {
    const token = jwt.sign(
      { id: req.user.id, username: req.user.username },
      process.env.JWT_SECRET,
      { expiresIn: "1000h" },
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "None" : "Lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    });

    res.redirect("/index.html");
  },
);

router.post("/google/token", async (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.status(400).json({ message: "Token is required" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const pool = await connectDB();
    const [users] = await pool.query(
      "SELECT id, username, displayName FROM users WHERE id = ?",
      [decoded.id],
    );

    if (users.length === 0)
      return res.status(404).json({ message: "User not found" });

    res.status(200).json({
      message: "Token is valid",
      user: users[0],
      token: token,
    });
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
});

router.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: "Missing credentials" });

  try {
    const pool = await connectDB();
    const [existing] = await pool.query(
      "SELECT * FROM users WHERE username = ? LIMIT 1",
      [username],
    );

    if (existing.length > 0)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (username, password) VALUES (?, ?)",
      [username, hashedPassword],
    );

    const token = jwt.sign(
      { id: result.insertId, username },
      process.env.JWT_SECRET,
      { expiresIn: "1000h" },
    );
    res
      .status(201)
      .json({ message: "User created successfully", token: token });
  } catch (error) {
    res.status(500).json({ message: "Signup failed", error: error.message });
  }
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const pool = await connectDB();
    const [users] = await pool.query(
      "SELECT * FROM users WHERE username = ? LIMIT 1",
      [username],
    );
    const user = users[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "1000h" },
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "None" : "Lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });

    res
      .status(200)
      .json({
        message: "Logged in successfully",
        token: token,
        username: username,
      });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
});

module.exports = router;
