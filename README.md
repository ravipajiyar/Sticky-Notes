# StickyPro: Enterprise-Grade Offline-First Note System

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white)]()
[![Aiven](https://img.shields.io/badge/Aiven-Cloud_DB-FF4C00?style=for-the-badge&logo=aiven&logoColor=white)]()
[![Render](https://img.shields.io/badge/Render-Deployed-46E3B7?style=for-the-badge&logo=render&logoColor=white)]()

StickyPro is a full-stack engineering demonstration of **offline-first architecture**, **cloud database migration**, and **resilient synchronization**. Originally built on MSSQL, this version has been professionally migrated to **Aiven Cloud MySQL** and deployed on **Render**.

---

## ✨ Features

- 📝 **Dynamic CRUD** — Full management of sticky notes with real-time UI updates.
- 🔄 **Offline-First Logic** — Powered by IndexedDB for seamless offline functionality.
- ☁️ **Cloud Sync** — Automated background batch synchronization with MySQL.
- 🔐 **Enterprise Authentication** — JWT-secured authentication using HttpOnly cookies for enhanced XSS protection.
- ⚡ **Advanced Filtering** — Custom OData-style query engine for complex server-side searching.
- 🎨 **Interactive UI** — Draggable sticky notes using jQuery UI with dark mode and categorization support.

---

## 🚀 Key Engineering Highlights

### Database Migration (MSSQL → MySQL)

Successfully refactored the complete data layer from Microsoft SQL Server to MySQL. This included:

- Translating T-SQL syntax (`TOP`, `OFFSET`) into MySQL-compatible queries (`LIMIT`, `OFFSET`)
- Updating parameter handling from named parameters to positional parameters
- Creating transactional migration scripts for reliable data operations

### High-Performance Sync Engine

Implemented a custom `BatchManager` to manage dirty-state tracking in IndexedDB. The synchronization engine:

- Batches multiple user operations into a single API request
- Minimizes unnecessary network traffic
- Ensures transactional consistency and data integrity

### Secure Infrastructure

- **Database Hosting:** Aiven Cloud (Bangalore region) for low-latency performance
- **Application Hosting:** Render with automated CI/CD deployment pipelines
- **Security:** Configured secure CORS policies, protected session handling, and JWT authentication

---

## 🛠️ Tech Stack

### Frontend
- Vanilla JavaScript
- HTML5
- Tailwind-style CSS
- jQuery UI
- IndexedDB
- Axios

### Backend
- Node.js
- Express.js v5
- Passport.js
- JWT Authentication

### Database
- MySQL (Aiven Cloud)

### DevOps & Deployment
- Docker
- GitHub Actions
- Render

---

## ⚙️ Local Development Setup

### 1. Clone Repository

```bash
git clone https://github.com/ravipajiyar/Sticky-Notes.git
cd Sticky-Notes/backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file inside the `backend/` directory:

```env
DB_HOST=your_aiven_host
DB_PORT=24327
DB_USER=avnadmin
DB_PASSWORD=your_password
DB_NAME=defaultdb

JWT_SECRET=your_secret
NODE_ENV=development
```

### 4. Start Development Server

```bash
npm start
```

---

## 🔒 Security Features

- JWT-based authentication
- HttpOnly cookie storage
- Protected API routes
- Secure CORS configuration
- Offline-safe synchronization handling

---

## 📦 Deployment Architecture

```text
Frontend (Browser + IndexedDB)
        ↓
Node.js + Express API
        ↓
Aiven Cloud MySQL
        ↓
Hosted on Render
```

---

## 👨‍💻 Author

Developed by **Ravi Pajiyar** as a demonstration of enterprise-grade full-stack engineering concepts involving:

- Offline-first systems
- Secure authentication flows
- Cloud database migration
- Containerized infrastructure
- Scalable backend architecture
- Synchronization systems
- Production-ready deployment pipelines