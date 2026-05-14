# StickyPro: Enterprise-Grade Offline-First Note System

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge\&logo=nodedotjs\&logoColor=white)](https://nodejs.org/)
[![MSSQL](https://img.shields.io/badge/MSSQL-CC2927?style=for-the-badge\&logo=microsoftsqlserver\&logoColor=white)]()
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge\&logo=docker\&logoColor=white)]()
[![JavaScript](https://img.shields.io/badge/Vanilla_JS-F7DF1E?style=for-the-badge\&logo=javascript\&logoColor=black)]()

StickyPro is a full-stack offline-first note management system designed to demonstrate modern backend engineering concepts, secure authentication flows, and resilient client-side data synchronization. The project focuses heavily on reliability, scalability, and developer-friendly infrastructure.

# ✨ Features
* 📝 Create, edit, delete, and organize sticky notes.
* 🔄 Offline-first architecture powered by IndexedDB.
* ☁️ Automatic synchronization when internet connectivity is restored.
* 🔐 JWT authentication with HTTP-only cookie security.
* 🌐 Google OAuth 2.0 login integration.
* 📦 Dockerized MSSQL setup for easy local development.
* ⚡ Advanced OData-style query filtering system.
* 🎯 Draggable sticky-note UI using jQuery UI.
* 🔑 Secure password hashing using bcrypt.

# 🚀 Key Engineering Highlights

## Offline-First Persistence

Implemented IndexedDB on the client side to allow users to continue working seamlessly even without an internet connection. All note operations are stored locally and synchronized automatically with the backend database once connectivity returns.

## Advanced Backend Query Engine

Built a custom OData-style query parser capable of converting `$filter` expressions into SQL queries dynamically. This enables flexible and scalable data retrieval on the server side.

### Example Query

```http
GET /notes?$filter=title eq 'Work'
```

## Secure Authentication System

Designed a multi-layer authentication system using:

* JWT (JSON Web Tokens)
* HTTP-only cookies
* Google OAuth 2.0
* Bcrypt password hashing

This setup improves protection against common attacks such as XSS and credential theft.

## Containerized Database Infrastructure

Configured Microsoft SQL Server using Docker Compose to ensure:

* Consistent local development
* Easy environment setup
* Reproducible deployments

## Scalable Backend Architecture

Backend follows a modular CommonJS structure for better maintainability, scalability, and clean separation of concerns.

# 🛠️ Tech Stack

## Frontend

* Vanilla JavaScript
* HTML5
* CSS3
* jQuery UI
* IndexedDB
* Axios

## Backend

* Node.js
* Express.js
* Passport.js

## Database

* Microsoft SQL Server (MSSQL)

## DevOps & Infrastructure

* Docker
* Docker Compose

# 📂 Project Structure

```bash
StickyPro/
│
├── client/                 # Frontend application
├── server/                 # Backend API
├── docker/                 # Docker configuration files
├── database/               # SQL scripts and schemas
├── .env
├── docker-compose.yml
└── README.md
```

# ⚙️ Local Development Setup

## 1. Prerequisites

Make sure the following tools are installed:

* Docker Desktop
* Node.js (LTS version)
* Git

## 2. Clone the Repository

```bash
git clone https://github.com/your-username/stickypro.git

cd stickypro
```

## 3. Database Setup (Docker)

Ensure Docker is running, then execute:

```bash
docker-compose up -d
```

This will:

* Pull the MSSQL Docker image
* Start the SQL Server container
* Initialize the required services

To verify containers:

```bash
docker ps
```

## 4. Backend Setup

Navigate to the server directory:

```bash
cd server
```

Install dependencies:

```bash
npm install
```

Create a `.env` file:

```env
PORT=5000

DB_SERVER=localhost
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=yourStrongPassword
DB_NAME=StickyPro

JWT_SECRET=yourSecretKey

GOOGLE_CLIENT_ID=yourGoogleClientId
GOOGLE_CLIENT_SECRET=yourGoogleClientSecret
```

Start the backend server:

```bash
npm run dev
```

## 5. Frontend Setup

Navigate to the client directory:

```bash
cd client
```

Install dependencies:

```bash
npm install
```

Run the frontend:

```bash
npm start
```

# 🔐 Authentication Flow

```text
User Login
    ↓
Server Validates Credentials
    ↓
JWT Generated
    ↓
Stored in HTTP-only Cookie
    ↓
Authenticated API Requests
```

# 🔄 Offline Synchronization Workflow

```text
User Creates/Edits Notes
          ↓
Stored Locally in IndexedDB
          ↓
Internet Restored
          ↓
Background Sync Triggered
          ↓
Data Synced to MSSQL Server
```

# 📸 Screenshots

> Add screenshots or GIF demonstrations here.

Example:

* Dashboard UI
* Offline mode
* Sync process
* Authentication flow

# 🧪 Future Improvements

* Real-time collaboration
* WebSocket-based live sync
* Conflict resolution strategies
* End-to-end encryption
* Progressive Web App (PWA) support
* Unit and integration testing

# 🤝 Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Commit changes
4. Push your branch
5. Open a Pull Request

# 📄 License

This project is licensed under the MIT License.

# 👨‍💻 Author

Developed by **Ravi Pajiyar** as a demonstration of enterprise-grade full-stack engineering concepts involving offline-first systems, secure authentication, containerized infrastructure, and scalable backend architecture.
