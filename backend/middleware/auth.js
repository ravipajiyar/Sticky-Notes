// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

function authenticateToken(req, res, next) {
  const token = req.cookies.token;

  if (token == null) {
    return res.sendStatus(401); // No token
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT verification error:', err);
      return res.sendStatus(403); // Invalid token
    }

    req.user = user; // Add user information to the request
    next(); 
  });
}

module.exports = { authenticateToken };