// backend/middleware/auth.js
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();

const jwtSecret = process.env.JWT_SECRET || "dev-only-secret-change-me";

function getToken(req) {
  const bearer = req.headers.authorization;
  if (bearer && bearer.startsWith("Bearer ")) {
    return bearer.slice(7);
  }
  return req.cookies ? req.cookies.token : null;
}

function authenticateToken(req, res, next) {
  const token = getToken(req);

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  jwt.verify(token, jwtSecret, (err, user) => {
    if (err) {
      console.error("JWT verification error:", err.message);
      return res.status(403).json({ message: "Invalid or expired session" });
    }

    req.user = user;
    next();
  });
}

module.exports = { authenticateToken };
