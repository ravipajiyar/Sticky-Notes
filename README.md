# StickyPro

[![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Vercel](https://img.shields.io/badge/Vercel-Frontend-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)
[![Render](https://img.shields.io/badge/Render-API-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://render.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

> **StickyPro** — An offline-first, full-stack sticky notes app with secure authentication, real-time sync, and a clean modern UI.

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Pages & Views](#-pages--views)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [API Reference](#-api-reference)
- [Deployment](#-deployment)
- [Security Notes](#-security-notes)
- [Contributing](#-contributing)
- [License](#-license)
- [Author](#-author)

---

## 📖 Overview

StickyPro is a modern sticky notes application built to help you capture, organize, and sync your ideas effortlessly. With offline-first capabilities powered by IndexedDB and seamless background synchronization, your notes are always accessible whether you're online or offline.

---

## ✨ Features

### 🗒️ Note Management
- **Full CRUD Operations** — Create, read, update, and delete notes with ease
- **Rich Text Editing** — Edit titles and content directly with contenteditable
- **Color Customization** — Choose from multiple background and text colors
- **Categories** — Organize notes by Work, Personal, or Ideas
- **Pinning** — Pin important notes to keep them at the top
- **Drag & Resize** — Freely position and resize notes on your canvas

### 🔐 Authentication & Security
- **JWT Authentication** — Secure login/signup with HttpOnly cookies
- **Google OAuth** — Optional one-click sign-in with Google
- **Password Hashing** — Passwords encrypted using bcrypt
- **Session Management** — Auto-login and secure logout

### ⚡ Offline-First Experience
- **IndexedDB Storage** — Notes persist locally in your browser
- **Batched Background Sync** — Changes sync automatically when online
- **Offline Resilience** — Create and edit notes without internet connection
- **Import/Export** — Backup and restore notes as JSON files

### 🎨 User Experience
- **Dark Mode** — Toggle between light and dark themes
- **Search & Filter** — Find notes quickly by title or content
- **OData Filtering** — Advanced filtering by category and pinned status
- **Responsive Design** — Works seamlessly across devices
- **Real-time Status** — Track sync status and note count

---

## 🗺 Pages & Views

| View | Description |
|------|-------------|
| `/auth.html` | Login and signup page with Google OAuth option |
| `/index.html` | Main dashboard with notes grid, sidebar, and controls |

---

## 🛠 Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| **Vanilla JavaScript** | Core functionality and DOM manipulation |
| **HTML5/CSS3** | Structure and styling |
| **jQuery UI** | Drag and resize functionality |
| **IndexedDB** | Offline-first local storage |
| **Axios** | HTTP client for API requests |
| **Font Awesome** | Icons |

### Backend
| Technology | Purpose |
|------------|---------|
| **Node.js + Express 5** | REST API server |
| **Passport.js** | Authentication middleware (Google OAuth) |
| **JWT (jsonwebtoken)** | Token-based authentication |
| **bcrypt** | Password hashing |
| **cookie-parser** | HttpOnly cookie handling |
| **cors** | Cross-origin resource sharing |

### Database
| Technology | Purpose |
|------------|---------|
| **PostgreSQL** | Primary database (Render) |
| **MySQL** | Alternative database (Aiven/Local) |

### Deployment
| Service | Purpose |
|---------|---------|
| **Vercel** | Frontend static hosting with API proxy |
| **Render** | Backend API and PostgreSQL database |

---

## 🏗 Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    Browser (Client)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   HTML/CSS   │  │ Vanilla JS   │  │    IndexedDB        │  │
│  │   (Vercel)   │  │    (App)     │  │  (Offline Storage)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │ /auth/* and /notes/* (proxied)
                            ▼
                    ┌─────────────────────┐
                    │  Express API        │
                    │  (Render)           │
                    │  • Auth Routes      │
                    │  • Notes Routes     │
                    │  • JWT Middleware   │
                    └──────────┬──────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │  PostgreSQL   │
                        │  (Render DB)  │
                        └──────────────┘
```

The Vercel rewrite proxy keeps API requests same-origin, ensuring HttpOnly cookies work reliably and avoiding third-party-cookie issues.

---

## 📁 Project Structure

```bash
StickyNotes/
├── backend/
│   ├── config/
│   │   └── database.js      # Database adapter (Postgres/MySQL)
│   ├── middleware/
│   │   └── auth.js          # JWT authentication middleware
│   ├── models/
│   │   ├── user.js
│   │   └── notes.js
│   ├── routes/
│   │   ├── auth.js          # Auth endpoints
│   │   └── notes.js         # Notes CRUD endpoints
│   ├── app.js               # Express app setup
│   ├── migrate.js           # Database schema migration
│   ├── odata-to-sql.js      # OData filter parser
│   ├── package.json
│   └── .env.example
├── frontend/
│   └── views/
│       ├── index.html       # Main dashboard
│       ├── auth.html        # Login/Signup page
│       ├── app.js           # Main app logic & sync
│       ├── note.js          # Note model
│       ├── noteView.js      # Note UI component
│       ├── style.css        # Styles & themes
│       ├── stickynote.png
│       └── person.png
├── render.yaml              # Render Blueprint
├── vercel.json              # Vercel configuration
├── docker-compose.yml       # Local MySQL setup
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v22+
- [npm](https://www.npmjs.com/)
- PostgreSQL or MySQL database

### Local Development

1. **Clone the repository**
```bash
git clone https://github.com/ravipajiyar/Sticky-Notes.git
cd Sticky-Notes
```

2. **Setup backend**
```bash
cd backend
cp .env.example .env
npm install
npm run migrate
npm start
```

3. **Open the app**
Navigate to [http://localhost:3001](http://localhost:3001). The Express server serves both API and frontend files.

### Environment Variables

#### For PostgreSQL (Recommended)
```env
DATABASE_URL=postgres://user:password@localhost:5432/stickynotes
PGSSL=false
JWT_SECRET=your-super-secret-key
NODE_ENV=development
FRONTEND_URL=http://localhost:3001
```

#### For MySQL
```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=stickynotes
DB_USER=root
DB_PASSWORD=your-password
JWT_SECRET=your-super-secret-key
NODE_ENV=development
```

#### Optional - Google OAuth
```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
```

---

## 🔌 API Reference

All API routes require authentication except `/auth/signup`, `/auth/login`, and `/auth/google`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/signup` | Create a new account |
| `POST` | `/auth/login` | Authenticate user and set cookie |
| `POST` | `/auth/logout` | Clear authentication cookie |
| `GET` | `/auth/me` | Get current authenticated user |
| `GET` | `/auth/providers` | Check enabled auth providers |
| `GET` | `/auth/google` | Initiate Google OAuth flow |
| `GET` | `/auth/google/callback` | Google OAuth callback |
| `GET` | `/notes/list` | List notes with pagination & OData filters |
| `POST` | `/notes` | Create a new note |
| `GET` | `/notes/:id` | Get a single note |
| `PUT` | `/notes/update/:id` | Update a note |
| `POST` | `/notes/batch-update` | Batch sync offline changes |
| `DELETE` | `/notes/delete/:id` | Delete a note |
| `GET` | `/health` | Health check endpoint |

---

## 🌐 Deployment

### Deploy Backend on Render

1. Push your code to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com/) → **New + → Blueprint**
3. Connect your repository and apply `render.yaml`
4. Set environment variables when prompted:
   - `FRONTEND_URL` - Your Vercel URL (use placeholder first, update later)
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Optional
5. Deploy and verify: `https://your-service.onrender.com/health`

### Deploy Frontend on Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard) → **Add New → Project**
2. Import your GitHub repository
3. Set **Root Directory** to repository root (`./`)
4. **Framework Preset**: Other
5. Leave build settings as configured in `vercel.json`
6. Deploy

### Connect Frontend & Backend

1. Copy your Vercel production URL
2. Go to Render → Your service → **Environment**
3. Update:
```env
FRONTEND_URL=https://your-app.vercel.app
CORS_ORIGINS=https://your-app.vercel.app
```
4. Redeploy the backend service
5. Test your app at the Vercel URL

### Google OAuth Setup (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → Create OAuth 2.0 credentials
2. Add authorized redirect URI: `https://your-app.vercel.app/auth/google/callback`
3. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to Render environment variables
4. Redeploy

---

## 🔒 Security Notes

- **HttpOnly Cookies** — JWT tokens stored in secure HttpOnly cookies
- **SameSite Protection** — `SameSite=None; Secure` in production
- **Password Security** — All passwords hashed with bcrypt (10 rounds)
- **CORS Protection** — Strict origin allowlisting
- **Environment Security** — Secrets managed via environment variables
- **SQL Injection Prevention** — Parameterized queries throughout
- **Auth Guards** — Protected routes require valid JWT tokens

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

**Ravi Pajiyar**

- GitHub: [@ravipajiyar](https://github.com/ravipajiyar)
- LinkedIn: [Ravi Pajiyar](https://www.linkedin.com/in/ravi-pajiyar-a4a5512ba/)

---

Built with ❤️ for better note-taking
