# StickyPro: Offline-First Sticky Notes

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Vercel](https://img.shields.io/badge/Vercel-Frontend-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)
[![Render](https://img.shields.io/badge/Render-API-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://render.com/)

StickyPro is a full-stack sticky notes app with offline-first storage, secure JWT
authentication, and background synchronization.

## Features

- Full CRUD for sticky notes with a real-time UI
- Offline-first storage using IndexedDB
- Batched background sync with the API
- JWT authentication in HttpOnly cookies
- Google OAuth support (optional)
- OData-style filtering and pagination
- Draggable/resizable notes, categories, pinning, dark mode
- Import/export notes as JSON

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Vanilla JS, HTML5, CSS, jQuery UI, IndexedDB, Axios |
| Backend | Node.js, Express 5, Passport, JWT |
| Database | PostgreSQL on Render (MySQL/Aiven also supported) |
| Hosting | Frontend on Vercel, API + database on Render |

## Deployment Architecture

```text
Browser (Vercel static frontend + IndexedDB)
        |
        |  /auth/* and /notes/* proxied by vercel.json
        v
Node.js + Express API (Render)
        |
        v
PostgreSQL (Render)
```

The Vercel rewrite proxy keeps API requests same-origin, which makes the
HttpOnly session cookie work reliably and avoids third-party-cookie issues.

### 1. Deploy the backend and database on Render

1. Push the repository to GitHub.
2. In Render, choose **New + → Blueprint** and select the repository.
   `render.yaml` creates:
   - a free PostgreSQL database (`sticky-notes-db`)
   - a Node web service (`sticky-notes-pro`) rooted at `backend/`
3. Set these environment variables on the web service:
   - `FRONTEND_URL` — your Vercel production URL, e.g. `https://sticky-pro.vercel.app`
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — optional, only for Google login
4. Deploy. The start command runs `npm run migrate` automatically, then starts the API.
5. Verify `https://<your-service>.onrender.com/health` returns `{ "status": "ok" }`.

The app also supports the existing Aiven MySQL database. To use it, remove the
`databases` section from `render.yaml` and replace `DATABASE_URL` with
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`.

### 2. Deploy the frontend on Vercel

1. Import the same repository in Vercel.
2. Use the repository root as the project root. `vercel.json` already sets
   `outputDirectory` to `frontend/views`.
3. Deploy. No build step is required.
4. If your Render service has a different hostname, update the two rewrite
   destinations in `vercel.json`:
   - `/auth/:path*` → `https://<your-service>.onrender.com/auth/:path*`
   - `/notes/:path*` → `https://<your-service>.onrender.com/notes/:path*`
5. Set the same Vercel URL as `FRONTEND_URL` on Render and redeploy the API.

### Google OAuth (optional)

Create an OAuth 2.0 Web Client in Google Cloud Console and add this authorized
redirect URI:

```text
https://<your-vercel-domain>/auth/google/callback
```

Then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on Render. By default the
app uses the Vercel domain as the callback URL (`FRONTEND_URL`), and the Vercel
rewrite forwards it to Render.

## Local Development

```bash
cd backend
cp .env.example .env
npm install
npm run migrate
npm start
```

Open `http://localhost:3001`. The Express server also serves `frontend/views`,
so the whole app works locally without Vercel.

### Local environment variables

Use either PostgreSQL:

```env
DATABASE_URL=postgres://user:password@localhost:5432/stickynotes
PGSSL=false
```

or MySQL:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=stickynotes
DB_USER=root
DB_PASSWORD=change-me
```

Then set:

```env
JWT_SECRET=replace-with-a-long-random-secret
NODE_ENV=development
```

## API Overview

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/auth/signup` | Create an account |
| POST | `/auth/login` | Log in |
| POST | `/auth/logout` | Clear the session cookie |
| GET | `/auth/me` | Get the current user |
| GET | `/auth/google` | Start Google OAuth |
| GET | `/notes/list` | List notes (pagination + OData filter) |
| POST | `/notes` | Create a note |
| PUT | `/notes/update/:id` | Update a note |
| POST | `/notes/batch-update` | Sync batched offline changes |
| DELETE | `/notes/delete/:id` | Delete a note |
| GET | `/health` | Health check |

## Security Notes

- JWT is stored in an HttpOnly, SameSite=None cookie in production.
- Passwords are hashed with bcrypt.
- API routes are protected by JWT middleware.
- CORS is allow-listed through `FRONTEND_URL` / `CORS_ORIGINS`.
- Never commit `.env` files. Use `.env.example` as a template.

## Author

Developed by **Ravi Pajiyar**.
