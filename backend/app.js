const express = require('express'); 
const cors = require('cors'); 
const authRoutes = require('./routes/auth');
const notesRoutes = require('./routes/notes.js');
const { connectDB } = require('./config/database');
const dotenv = require('dotenv');
const path = require('path');
const passport = require('passport');
const cookieParser = require('cookie-parser'); 

dotenv.config(); 

const app = express();
const port = 3001;

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(passport.initialize());

// Cookie parser middleware for incoming request
app.use(cookieParser());

const staticFilesPath = path.join(__dirname, '../frontend/views');
app.use(express.static(staticFilesPath));
console.log(staticFilesPath);


// API Routes
app.use('/auth', authRoutes);
app.use('/notes', notesRoutes);


app.get('/', (req, res) => {
    res.redirect('/auth.html');
});

app.get('/index.html', (req, res) => {
  const token = req.cookies.token;


  if (!token) {
    return res.redirect('/auth.html'); // Redirect to login page
  }
  res.sendFile(path.join(staticFilesPath, 'index.html'));

});

connectDB()
  .then(() => console.log('✅ Database connection test: Success!'))
  .catch(error => console.error('❌ Database connection test: Failed!', error));

app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});