const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { connectDB } = require('../config/database');
const dotenv = require('dotenv');
const sql = require('mssql');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

dotenv.config();

// Configure Passport Google Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3001/auth/google/callback"
  },
  async function(accessToken, refreshToken, profile, done) {
    try {
      console.log("Google profile:", profile); // Log the Google profile
      const pool = await connectDB();

      // Check if user already exists
      const existingUser = await pool.request()
        .input('googleId', sql.NVarChar, profile.id)
        .query('SELECT TOP 1 * FROM users WHERE googleId = @googleId');

      if (existingUser.recordset.length > 0) {
        // User exists, return the user
        return done(null, existingUser.recordset[0]);
      }

      // User doesn't exist, create a new one
      const username = profile.emails[0].value || `google_user_${profile.id}`;

      // Generate a random password (user won't need this for Google auth)
      const randomPassword = Math.random().toString(36).slice(-10);
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      // Create the new user with Google profile info
      const request = pool.request();
      request.input('username', sql.NVarChar, username);
      request.input('password', sql.NVarChar, hashedPassword);
      request.input('googleId', sql.NVarChar, profile.id);
      request.input('displayName', sql.NVarChar, profile.displayName || '');

      const result = await request.query`
        INSERT INTO users (username, password, googleId, displayName)
        OUTPUT INSERTED.id
        VALUES (@username, @password, @googleId, @displayName)
      `;

      const userId = result.recordset[0].id;

      // Fetch the newly created user
      const newUserResult = await pool.request()
        .input('userId', sql.Int, userId)
        .query('SELECT TOP 1 * FROM users WHERE id = @userId');

      return done(null, newUserResult.recordset[0]);
    } catch (error) {
      console.error("Error during Google auth:", error); // Log any errors
      return done(error, null);
    }
  }
));

// Google auth routes
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: 'http://localhost:3000/auth.html?error=Google%20authentication%20failed' }),
    async function(req, res) {
      console.log("Google callback hit"); // Log when the callback is hit
      // Generate JWT token for authenticated user
      const token = jwt.sign(
        { id: req.user.id, username: req.user.username },
        process.env.JWT_SECRET,
        { expiresIn: '1000h' }
      );

      // Set the JWT in a cookie
      res.cookie('token', token, {
          httpOnly: true, // Prevents client-side JavaScript access
          secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
          sameSite: 'strict', // Helps prevent CSRF attacks
          maxAge: 1000 * 60 * 60 // Expires in 1 hour (adjust as needed)
      });

      const redirectUrl = `http://localhost:3001/index.html`;
      console.log('Redirecting to:', redirectUrl); // Log redirect URL
      res.redirect(redirectUrl);
    }
  );

// Handle token validation from frontend
router.post('/google/token', async (req, res) => {
    // const { token } = req.body;
    const token = req.cookies.token;
    console.log("This is the request ::",req.cookies.token)

    if (!token) {
        return res.status(400).json({ message: 'Token is required' });
    }

    try {
        // Validate the token (this is usually done by your auth middleware)
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log(decoded)
        // Return user info
        const pool = await connectDB();
        const userResult = await pool.request()
          .input('userId', sql.Int, decoded.id)
          .query('SELECT id, username, displayName FROM users WHERE id = @userId');

        if (userResult.recordset.length === 0) {
          return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({
          message: 'Token is valid',
          user: userResult.recordset[0],
          token: token
        });
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(401).json({ message: 'Invalid token' });
    }
  });

// Keep your existing routes
// Signup Route
router.post('/signup', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Please provide username and password' });
    }

    try {
        const pool = await connectDB();
        // Check if user already exists
        const existingUser = await pool.request()
            .input('username', sql.NVarChar, username)
            .query('SELECT TOP 1 * FROM users WHERE username = @username');

        if (existingUser.recordset.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create the new user
        const request = pool.request();
        request.input('username', sql.NVarChar, username);
        request.input('password', sql.NVarChar, hashedPassword);

        const result = await request.query`
            INSERT INTO users (username, password)
            OUTPUT INSERTED.id
            VALUES (@username, @password)
        `;

        const userId = result.recordset[0].id;

        // Fetch the newly created user
        const newUserResult = await pool.request()
            .input('userId', sql.Int, userId)
            .query('SELECT TOP 1 * FROM users WHERE id = @userId');
        const newUser = newUserResult.recordset[0];

        // Generate JWT token
        const token = jwt.sign({ id: newUser.id, username: newUser.username }, process.env.JWT_SECRET, { expiresIn: '1000h' });//changed here
        res.status(201).json({ message: 'User created successfully', token: token });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Signup failed', error: error.message });
    }
});

// Login Route
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Please provide username and password' });
    }

    try {
        const pool = await connectDB();

        // Find the user
        const userResult = await pool.request()
            .input('username', sql.NVarChar, username)
            .query('SELECT TOP 1 id, username, password FROM users WHERE username = @username');
        const user = userResult.recordset[0];

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Compare passwords
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1000h' });//changed here

        // Set the JWT in a cookie
        res.cookie('token', token, {
            httpOnly: true, // Prevents client-side JavaScript access
            secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
            sameSite: 'strict', // Helps prevent CSRF attacks
            maxAge: 1000 * 60 * 60 // Expires in 1 hour (adjust as needed)
        });

        console.log(`User "${username}" logged in successfully.`); // Display the username

        res.status(200).json({ message: 'Logged in successfully', token: token, username: username });//sending the username here
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Login failed', error: error.message });
    }
});

module.exports = router;