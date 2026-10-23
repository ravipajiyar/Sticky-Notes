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
const jwtSecret = process.env.JWT_SECRET || "dev-only-secret-change-me";
const backendBaseUrl = (
  process.env.BACKEND_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  (isProduction ? "https://sticky-notes-pro-ohea.onrender.com" : "http://localhost:3001")
).replace(/\/$/, "");
const frontendBaseUrl = (process.env.FRONTEND_URL || "").replace(/\/$/, "");

const googleConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    !/replace|your-google/i.test(
      `${process.env.GOOGLE_CLIENT_ID} ${process.env.GOOGLE_CLIENT_SECRET}`,
    ),
);

const googleCallbackUrl =
  process.env.GOOGLE_CALLBACK_URL ||
  (isProduction && frontendBaseUrl
    ? `${frontendBaseUrl}/auth/google/callback`
    : `${backendBaseUrl}/auth/google/callback`);

const loginRedirectUrl = frontendBaseUrl
  ? `${frontendBaseUrl}/index.html`
  : "/index.html";
const failureRedirectUrl = `${frontendBaseUrl || ""}/auth.html?error=Google%20authentication%20failed`;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function createToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    jwtSecret,
    { expiresIn: "1000h" },
  );
}

if (googleConfigured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: googleCallbackUrl,
      },
      async function (accessToken, refreshToken, profile, done) {
        try {
          const pool = await connectDB();

          const [users] = await pool.query(
            "SELECT * FROM users WHERE googleId = ? LIMIT 1",
            [profile.id],
          );

          if (users.length > 0) {
            return done(null, users[0]);
          }

          const email =
            profile.emails && profile.emails[0] && profile.emails[0].value;
          const username = email || `google_user_${profile.id}`;
          const randomPassword = Math.random().toString(36).slice(-10);
          const hashedPassword = await bcrypt.hash(randomPassword, 10);

          let newUserId;
          try {
            const [result] = await pool.query(
              "INSERT INTO users (username, password, googleId, displayName) VALUES (?, ?, ?, ?)",
              [username, hashedPassword, profile.id, profile.displayName || ""],
            );
            newUserId = result.insertId;
          } catch (insertError) {
            if (!/duplicate|unique/i.test(insertError.message)) throw insertError;

            const [existingByEmail] = await pool.query(
              "SELECT * FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1",
              [username],
            );
            if (existingByEmail.length === 0) throw insertError;

            await pool.query(
              "UPDATE users SET googleId = ?, displayName = COALESCE(NULLIF(displayName, ''), ?) WHERE id = ?",
              [profile.id, profile.displayName || "", existingByEmail[0].id],
            );
            newUserId = existingByEmail[0].id;
          }

          const [newUser] = await pool.query(
            "SELECT * FROM users WHERE id = ?",
            [newUserId],
          );
          return done(null, newUser[0]);
        } catch (error) {
          console.error("Error during Google auth:", error);
          return done(error, null);
        }
      },
    ),
  );
}

router.get("/providers", (req, res) => {
  res.status(200).json({ google: googleConfigured });
});

router.get("/google", (req, res, next) => {
  if (!googleConfigured) {
    return res.redirect(`${frontendBaseUrl || ""}/auth.html?error=Google%20login%20is%20not%20configured`);
  }
  return passport.authenticate("google", { scope: ["profile", "email"] })(
    req,
    res,
    next,
  );
});

router.get(
  "/google/callback",
  (req, res, next) => {
    if (!googleConfigured) {
      return res.redirect(`${frontendBaseUrl || ""}/auth.html?error=Google%20login%20is%20not%20configured`);
    }
    return passport.authenticate("google", {
      session: false,
      failureRedirect: failureRedirectUrl,
    })(req, res, next);
  },
  async function (req, res) {
    const token = createToken(req.user);

    res.cookie("token", token, cookieOptions());
    res.redirect(loginRedirectUrl);
  },
);

async function handleCurrentUser(req, res) {
  const bearer = req.headers.authorization;
  const token =
    req.cookies.token ||
    (bearer && bearer.startsWith("Bearer ") ? bearer.slice(7) : null);

  if (!token) return res.status(401).json({ message: "Not authenticated" });

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const pool = await connectDB();
    const [users] = await pool.query(
      "SELECT id, username, displayName FROM users WHERE id = ?",
      [decoded.id],
    );

    if (users.length === 0)
      return res.status(404).json({ message: "User not found" });

    return res.status(200).json({
      message: "Token is valid",
      user: users[0],
    });
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

router.get("/me", handleCurrentUser);
router.post("/google/token", handleCurrentUser);

router.post("/signup", async (req, res) => {
  const username =
    typeof req.body.username === "string" ? req.body.username.trim() : "";
  const password =
    typeof req.body.password === "string" ? req.body.password : "";

  if (!username || !password)
    return res.status(400).json({ message: "Username and password are required" });

  if (username.length > 255)
    return res.status(400).json({ message: "Username is too long" });

  if (password.length < 6)
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters" });

  try {
    const pool = await connectDB();
    const [existing] = await pool.query(
      "SELECT id FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1",
      [username],
    );

    if (existing.length > 0)
      return res.status(409).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (username, password) VALUES (?, ?)",
      [username, hashedPassword],
    );

    const user = { id: result.insertId, username };
    const token = createToken(user);
    res.cookie("token", token, cookieOptions());

    res.status(201).json({
      message: "Account created successfully",
      token,
      username,
    });
  } catch (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return res.status(409).json({ message: "User already exists" });
    }
    res.status(500).json({ message: "Signup failed", error: error.message });
  }
});

router.post("/login", async (req, res) => {
  const username =
    typeof req.body.username === "string" ? req.body.username.trim() : "";
  const password =
    typeof req.body.password === "string" ? req.body.password : "";

  if (!username || !password)
    return res.status(400).json({ message: "Username and password are required" });

  try {
    const pool = await connectDB();
    const [users] = await pool.query(
      "SELECT * FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1",
      [username],
    );
    const user = users[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const token = createToken(user);
    res.cookie("token", token, cookieOptions());

    res.status(200).json({
      message: "Logged in successfully",
      token,
      username: user.username,
      displayName: user.displayName || user.username,
    });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  });
  res.status(200).json({ message: "Logged out" });
});

module.exports = router;
