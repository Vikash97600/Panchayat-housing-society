<!-- ## 📄 Documentation

[View Full Documentation](panchayat_documentation.html) -->
[![License](https://img.shields.io/github/license/Vikash97600/Panchayat-society-app)](LICENSE)

# 🏘️ Panchayat — Housing Society Management System

> A comprehensive web-based Housing Society Management System built for Indian residential societies. Replaces WhatsApp groups, paper registers, and manual processes with an AI-powered platform.

![Django](https://img.shields.io/badge/Django-4.2-092E20?style=flat&logo=django&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat&logo=python&logoColor=white)
![Bootstrap](https://img.shields.io/badge/Bootstrap-5-7952B3?style=flat&logo=bootstrap&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=flat&logo=mysql&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-1.5_Flash-4285F4?style=flat&logo=google&logoColor=white)

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [User Roles & Permissions](#-user-roles--permissions)
- [Installation](#-installation)
- [Quick Start Credentials](#-quick-start-credentials)
- [API Reference](#-api-reference)
- [Database Schema](#-database-schema)
- [Project Structure](#-project-structure)
- [Troubleshooting](#-troubleshooting)

---

## 🏠 Overview

**Panchayat** solves the real everyday problems faced by housing societies:

| Problem | Solution |
|---|---|
| 420 unread WhatsApp messages | Centralized complaint ticketing with voice support |
| Leaky tap voice notes going untracked | AI reads complaints and gives a 3-point summary |
| No idea where maintenance money goes | Transparent maintenance ledger with plain-language AI explanation |
| Parking disputes at 11 PM | Structured complaint system with priority flags |
| Dusty rule books nobody reads | Bylaw bot — ask "Can I renovate on Sunday?" and get an instant answer |
| Domestic staff entering unverified | Role-based access with resident-only submission |

**Target Audience:** Societies with 50 to 500+ flats managed by housing society committees in India.

---

## ✨ Features

### 🎫 Complaint Management
- Submit text or **voice complaints** (Hindi, Marathi, English, Tamil supported)
- AI-powered **Inbox Summary** using Google Gemini — groups similar complaints, flags urgent ones
- Status timeline: `Open → In Progress → Resolved → Closed`
- Committee can assign, update status, and add internal notes

### 🤖 Bylaw Bot (AI)
- Upload society bylaw PDF → text auto-extracted
- Chat-style interface to ask any bylaw question
- Gemini answers with exact Rule numbers cited
- Quick-question chips: *"Gym hours?", "Can I renovate on Sunday?", "Visitor parking rule?"*

### 🔧 Service Booking
- Book Plumber, Electrician, Laundry, Carpenter
- Date picker + available time slots as radio buttons
- Cancel up to 2 hours before the slot

### 💰 Maintenance & Finance
- Monthly expense ledger (salaries, AMC, fuel, water, sinking fund, etc.)
- Per-flat dues auto-calculated: `per_flat = total_maintenance / total_flats`
- AI generates plain-language explanation of the monthly breakdown
- Committee marks dues as paid with payment reference

### 📢 Notice Board
- Pin important notices (always shown at top)
- Expiry date support
- Visible to all roles

### 🛡️ Admin Panel
- Society and user management
- Approve/reject registrations
- Bylaw PDF version history
- Vendor and slot management
- **Immutable audit logs** — every action logged (who, what, when)

### 💬 Real-Time Chat
- Direct messaging between **Committee members** and **Residents**
- Seamless communication for quick queries, updates, and issue resolution
- Chat history preserved for future reference
- Accessible from the **Chat** tab in both Committee and Resident dashboards
- Real-time message updates with visual indicators

### 🏢 Society Setup Workflow (New)
- Society created with `is_active: False` initially
- Admin assigns Secretary & Treasurer → Society auto-activates
- Only Secretary can add residents (no public registration)
- Controlled onboarding ensures proper governance

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | HTML5, CSS3, JavaScript, Bootstrap 5 | Responsive UI with purple brand theme |
| Backend | Python 3.11, Django 4.2 | Robust web framework |
| REST API | Django REST Framework + JWT Auth | Token-based API authentication |
| Database | MySQL 8 | Relational data storage |
| AI — Text | Google Gemini 1.5 Flash | Bylaw Q&A and complaint summaries |
| AI — Voice | Groq Whisper Large V3 | Voice complaint transcription |
| Real-Time Chat | JavaScript Polling | Committee-Resident messaging |
| File Storage | Django FileField | Local storage (S3-ready) |

---

## 👥 User Roles & Permissions

Three roles: **Admin**, **Committee**, **Resident**

| Feature | Admin | Committee | Resident |
|---|:---:|:---:|:---:|
| Login to system | ✅ | ✅ | ✅ |
| View all complaints | ✅ | ✅ | Own only |
| Submit complaint | ❌ | ❌ | ✅ |
| Edit complaint | ❌ | ✅ | Own (Open/In Progress) |
| Delete complaint | ❌ | ✅ | Own (Open only) |
| Resolve complaint | ❌ | ✅ | ❌ |
| Upload bylaw PDF | ✅ | ❌ | ❌ |
| Ask bylaw bot | ✅ | ✅ | ✅ |
| Book services | ❌ | ❌ | ✅ |
| Manage services | ✅ | ❌ | ❌ |
| Enter maintenance | ❌ | ✅ | ❌ |
| View dues | ✅ | ✅ | Own only |
| Mark dues paid | ❌ | ✅ | ❌ |
| Post notices | ✅ | ✅ | ❌ |
| View AI summary | ✅ | ✅ | ❌ |
| Approve users | ✅ | ✅ | ❌ |
| View audit logs | ✅ | ❌ | ❌ |
| Chat with residents | ❌ | ✅ | ✅ |
| Chat with committee | ❌ | ✅ | ✅ |
| Assign committee | ✅ | ❌ | ❌ |
| Add residents | ❌ | ✅ (Secretary only) | ❌ |

**Access URLs:**
- Admin → `/admin-panel/`
- Committee → `/committee/`
- Resident → `/resident/`

---

## ⚙️ Installation

### Prerequisites

- [Python 3.11+](https://www.python.org/downloads)
- [MySQL 8.0+](https://dev.mysql.com/downloads/mysql)
- [Git](https://git-scm.com) (optional)

### Step 1 — Clone the Repository

```bash
git clone https://github.com/Vikash97600/Panchayat-society-app.git
cd Panchayat-society-app
```

### Step 2 — Create Virtual Environment

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate
```

### Step 3 — Install Dependencies

```bash
pip install -r requirements.txt
```

### Step 4 — Create MySQL Database

```sql
CREATE DATABASE panchayat_db 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;
```

### Step 5 — Create `.env` File

Create a `.env` file in the project root:

```env
SECRET_KEY=your-django-secret-key
DEBUG=True
DB_NAME=panchayat_db
DB_USER=root
DB_PASSWORD=root
DB_HOST=localhost
DB_PORT=3306
GEMINI_API_KEY=your-gemini-api-key
GROQ_API_KEY=your-groq-api-key
```

> **Getting API Keys:**
> - **Gemini:** [aistudio.google.com](https://aistudio.google.com) → Sign in → Get API Key (free tier)
> - **Groq:** [console.groq.com](https://console.groq.com) → Sign up → API Keys (free tier)

### Step 6 — Run Migrations

```bash
python manage.py migrate
```

### Step 7 — Seed Sample Data

```bash
python manage.py seed_panchayat
```

### Step 8 — Start the Server

```bash
python manage.py runserver
```

Open your browser at: **http://127.0.0.1:8000**

---

## 🚀 Quick Start Credentials

After seeding, use these credentials to log in:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@panchayat.com` | `Admin@123` |
| Committee | `secretary@splendour.com` | `Committee@123` |
| Committee | `treasurer@splendour.com` | `Committee@123` |
| Resident | `resident1@panchayat.com` | `Resident@123` |
| Resident | `resident2@panchayat.com` | `Resident@123` |

### Page URLs

| Page | URL |
|---|---|
| Login | `/login/` |
| Register | `/register/` |
| Admin Panel | `/admin-panel/` |
| Committee | `/committee/` |
| Resident | `/resident/` |

> **Note:** New registrations require admin approval before the user can log in. Until approved, login returns *"Account not approved yet"*.

> **New Workflow:** After seeding, the society is inactive. Admin must go to Admin Panel → Societies → Assign Committee to add Secretary & Treasurer. Once assigned, the society becomes active and the Secretary can add residents.

---

## 📡 API Reference

All APIs use JWT authentication. Token is stored in `localStorage` after login.

### Authentication

| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/register/` | `POST` | Register new resident |
| `/api/auth/login/` | `POST` | Login and get JWT tokens |
| `/api/auth/logout/` | `POST` | Logout (blacklist token) |
| `/api/auth/me/` | `GET` | Get current user profile |
| `/api/auth/users/` | `GET` | List all users (Admin/Committee) |
| `/api/auth/users/<id>/approve/` | `PUT` | Approve user registration |
| `/api/auth/assign-committee/` | `POST` | Assign Secretary & Treasurer (Admin) |
| `/api/auth/add-resident/` | `POST` | Add resident (Secretary only) |

### Complaints

| Endpoint | Method | Description |
|---|---|---|
| `/api/complaints/` | `GET` | List complaints |
| `/api/complaints/` | `POST` | Create complaint |
| `/api/complaints/<id>/` | `GET` | Get complaint detail |
| `/api/complaints/<id>/` | `PUT` | Update complaint |
| `/api/complaints/<id>/` | `DELETE` | Delete complaint |
| `/api/complaints/<id>/notes/` | `POST` | Add note to complaint |
| `/api/complaints/voice/transcribe/` | `POST` | Transcribe voice complaint |

### Bylaws

| Endpoint | Method | Description |
|---|---|---|
| `/api/bylaws/` | `GET` | List bylaws |
| `/api/bylaws/upload/` | `POST` | Upload bylaw PDF |
| `/api/bylaw/ask/` | `POST` | Ask bylaw question |

### Services & Bookings

| Endpoint | Method | Description |
|---|---|---|
| `/api/services/` | `GET` | List services |
| `/api/services/<id>/slots/` | `GET` | Get available slots |
| `/api/bookings/` | `GET` | List bookings |
| `/api/bookings/` | `POST` | Create booking |
| `/api/bookings/<id>/cancel/` | `PUT` | Cancel booking |

### Finance

| Endpoint | Method | Description |
|---|---|---|
| `/api/finance/maintenance/` | `GET` | List maintenance entries |
| `/api/finance/maintenance/<month>/` | `GET` | Get month summary |
| `/api/finance/dues/` | `GET` | List all dues (Admin/Committee) |
| `/api/finance/dues/me/` | `GET` | Get my dues |
| `/api/finance/dues/<id>/mark-paid/` | `PUT` | Mark dues as paid |

### Notices

| Endpoint | Method | Description |
|---|---|---|
| `/api/notices/` | `GET` | List notices |
| `/api/notices/` | `POST` | Create notice |
| `/api/notices/<id>/` | `DELETE` | Delete notice |

### AI

| Endpoint | Method | Description |
|---|---|---|
| `/api/ai/summary/` | `GET` | Get AI complaint summary |

### Chat

| Endpoint | Method | Description |
|---|---|---|
| `/api/chat/rooms/` | `GET` | List chat rooms |
| `/api/chat/rooms/` | `POST` | Create chat room |
| `/api/chat/rooms/<id>/messages/` | `GET` | Get messages in a room |
| `/api/chat/rooms/<id>/messages/` | `POST` | Send message to a room |

---

## 🗄️ Database Schema

### Key Tables

**`societies`** — `id`, `name`, `address`, `city`, `state`, `wing_count`, `total_flats`, `plan_type`, `is_active`, `created_at`

**`users` (CustomUser)** — `id`, `username`, `email`, `password`, `role` (admin/secretary/treasurer/committee/resident), `flat_no`, `wing`, `phone`, `society_id`, `is_approved`, `is_active`, `created_at`

**`committee_members`** — `id`, `user_id`, `society_id`, `role` (secretary/treasurer), `created_at`

**`residents`** — `id`, `user_id` (OneToOne), `society_id`, `flat_no`, `wing_no`, `mobile_no`, `created_at`

**`complaints`** — `id`, `society_id`, `submitted_by_id`, `title`, `description`, `audio_file_path`, `ai_transcript`, `language`, `category`, `priority` (low/medium/urgent), `status` (open/in_progress/resolved/closed), `assigned_to_id`, `created_at`, `updated_at`

Other tables: `bylaws`, `services`, `service_slots`, `bookings`, `maintenance_categories`, `maintenance_ledger`, `dues`, `notices`, `audit_logs`, `complaint_notes`, `chat_rooms`, `chat_messages`

---

## 📁 Project Structure

```
Panchayat-society-app/
├── .env                          ← Secret keys (never commit)
├── manage.py
├── requirements.txt
├── panchayat/
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── apps/
│   ├── accounts/                 ← Auth, users, societies
│   ├── complaints/               ← Complaint management + voice
│   ├── bylaws/                   ← PDF upload + AI Q&A
│   ├── services/                 ← Service booking
│   ├── finance/                  ← Maintenance + dues
│   ├── notices/                  ← Notice board
│   ├── chat/                     ← Real-time messaging
│   └── ai_engine/                ← Gemini + Groq integrations
│       ├── gemini_client.py
│       ├── groq_client.py
│       └── views.py
├── templates/
│   ├── base.html
│   ├── login.html
│   ├── register.html
│   ├── admin/dashboard.html
│   ├── committee/dashboard.html
│   └── resident/dashboard.html
├── static/
│   ├── css/panchayat.css
│   └── js/
│       ├── api.js                ← Fetch with JWT
│       ├── voice-recorder.js
│       ├── bylaw-chat.js
│       ├── chat.js                ← Chat functionality
│       ├── admin.js
│       ├── committee.js
│       └── resident.js
└── media/
    ├── bylaws/                   ← Uploaded PDFs
    └── audio/                    ← Voice recordings
```

---

## 🔧 Troubleshooting

### `mysqlclient` not found
```bash
# Windows
pip install mysqlclient

# Mac
brew install mysql-client && pip install mysqlclient

# Ubuntu
sudo apt install python3-dev default-libmysqlclient-dev && pip install mysqlclient
```

### `Unknown database 'panchayat_db'`
Create the database in MySQL first (see Step 4 in Installation).

### Invalid credentials on login
Re-run the seed command:
```bash
python manage.py seed_panchayat
```

### Redirected to login on every page
Token expired. Log in again. Check via DevTools → `F12` → Application → Local Storage.

### Microphone permission denied
Click the lock icon in the browser URL bar → Allow Microphone.
> Voice recording only works on `localhost` or `HTTPS`.

### Bylaw Bot says "Bylaws not found"
Admin must upload a bylaw PDF first: `/admin-panel/` → Bylaws → Upload PDF.

### Edit / Delete button not showing on complaint

| Button | Visible when status is |
|---|---|
| Edit | Open, In Progress |
| Delete | Open only |

Check via DevTools → Network → `/api/complaints/` → look for `can_edit` / `can_delete` in the response.

---

## 📄 License

This project is for educational/demo purposes. Built for Mahindra Splendour CHS.

---

*Built with Django 4.2 · Bootstrap 5 · Google Gemini · Groq Whisper*
