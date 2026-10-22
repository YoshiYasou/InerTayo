# InerTayo — Public Transportation Route Information System
**Target Location:** Dagupan City, Pangasinan, Philippines  
**Primary Users:** Commuters, Administrators  
**Architecture:** MERN Stack (MongoDB, Express.js, React, Node.js)

InerTayo is a dedicated public transportation route information system built specifically for commuters in Dagupan City, Pangasinan. Inspired by route-finding services like Sakay.ph, it organizes traditional Jeepneys, Tricycles, River Boats, and Buses into an accessible, searchable, and flood-resilient transit network.

---

## Tech Stack (MERN)

- **Frontend:** React 18, Vite, Tailwind CSS, Lucide Icons, Leaflet
- **Backend:** Node.js, Express.js (REST API, 67 endpoints)
- **Database:** MongoDB with Mongoose ODM (16 models, auto-increment integer IDs for seamless client compatibility)
- **Authentication & Security:** JWT tokens with bcrypt password hashing (cost factor 12), rate limiting, and role-based access control (`COMMUTER`, `ADMIN`)
- **Testing:** Comprehensive test suite with `mongodb-memory-server` (118 automated assertions, 0 external database dependencies required to run tests)

---

## Default Accounts

These seeded accounts are for development only. Change their passwords before
making a deployed instance publicly accessible. The seed script replaces all
existing application data, so do not run it against a database containing live
data.

| Role | Username | Email | Password | Access Level |
|---|---|---|---|---|
| **Administrator** | `admin` | `admin@inertayo.ph` | `AdminPassword123!` | Full Admin Portal (`/admin`), Route/Advisory/Fare CRUD |
| **Commuter** | `commuter` | `commuter@inertayo.ph` | `Commuter123!` | Public Commuter Search, Bookmarking (`saved_routes`), Feedback |

---

## Prerequisites

Before running the application, ensure you have:
1. **Node.js** (v18 or higher recommended)
2. **npm** (comes with Node.js)
3. **MongoDB Connection** (either a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cloud cluster or a local MongoDB service)

---

## Getting Started

### 1. Clone & Install Dependencies

```bash
# Clone the repository (if not already done)
git clone https://github.com/YoshiYasou/InerTayo.git
cd InerTayo

# Install root & backend dependencies
npm install

# Install frontend client dependencies
npm --prefix client install
```

On Windows PowerShell, if `npm` is blocked by the script execution policy, use `npm.cmd` in place of `npm` for these commands.

---

### 2. Configure Environment Variables (`.env`)

Create a `.env` file in the project root (or copy from `.env.example`):

```bash
cp .env.example .env
```

Open `.env` and configure your credentials:

```env
# REQUIRED — Secret key for signing JWT tokens (min 32 characters)
JWT_SECRET=your_super_secret_jwt_key_here

# REQUIRED — MongoDB Connection URI (Local or MongoDB Atlas)
# Example MongoDB Atlas URI:
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/inertayo?retryWrites=true&w=majority

# Optional — Server Port (defaults to 5000)
PORT=5000

# Optional — CORS frontend origins (defaults to http://localhost:3000,http://localhost:5173)
# The local server origin (PORT, default 5000) is also allowed.
ORIGIN=http://localhost:3000

# Generic SMTP settings (used for account verification, admin sign-in, and password reset email)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
SMTP_FROM=InerTayo <no-reply@example.com>
```

The API and email sender run in Vercel Functions. Configure `MONGODB_URI` and
`JWT_SECRET` in the Vercel project environment, along with either the generic
`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and
`SMTP_FROM` settings or the Gmail fallback `GMAIL_USER` and
`GMAIL_APP_PASSWORD`. Use the credentials supplied by your email provider.
Port 465 uses TLS by default; for port 587, set `SMTP_SECURE=false` to use
STARTTLS. For local development, set these variables in the local environment.

New commuter signups receive a six-digit verification code by email. Codes
expire after 10 minutes, are rate-limited, and are stored as hashes. The
account cannot sign in until the code is verified. Administrator sign-in and
password recovery also use the configured email sender.

> **Atlas network access:** Vercel's free tier uses changing outbound IP addresses. To connect the Vercel Function to the existing Atlas cluster without paid static egress, Atlas Network Access must allow `0.0.0.0/0`. This lets any internet host attempt a database connection, so use a unique, strong database password, keep TLS enabled, and grant the database user only the permissions the app needs. Never expose `MONGODB_URI` in client-side code. Replace `<username>` and `<password>` with the database user's credentials and use `/inertayo` in the connection path.

### Deploy to Vercel

The Vercel configuration builds the Vite client as static files and routes
`/api/*` requests to a Vercel Function that runs the Express API and connects
directly to the existing MongoDB Atlas database. The frontend and API share one
origin; no separate API URL or Render service is used.

1. Import this repository into Vercel and keep the repository root as the
   project root. The included `vercel.json` supplies the build command and
   static output directory.
2. Select Vercel's Hobby plan and add `MONGODB_URI`, `JWT_SECRET`, and either
   the SMTP variables or Gmail fallback listed above to the Production
   environment. Add them to Preview too if preview deployments should use the
   live database and email provider.
3. In MongoDB Atlas, allow `0.0.0.0/0` in Network Access for this free setup.
   Review the security warning above; the alternative is paid static egress or
   a database provider that supports Vercel's dynamic addresses.
4. Deploy and verify the frontend, database-backed API, registration
   verification, and email delivery before directing production traffic. Do not
   run `npm run seed` against the existing production database; it replaces
   application data.

Vercel Functions can scale independently and may go idle between requests.
MongoDB connections are reused within a warm function instance. Email delivery
also depends on the SMTP provider permitting outbound connections from Vercel
and on staying within the provider's free-tier limits.

---

### 3. Seed the MongoDB Database

Populate your MongoDB database with authoritative Dagupan City transit routes, stops, turn-by-turn directions, fares, flood advisories, unified locations, and verified schools:

```bash
npm run seed
```

Output:
```text
MongoDB connected: ...
Seeding InerTayo MongoDB database with Dagupan City transit data...
MongoDB transit data seeded successfully!
```

---

### 4. Build Client Production Bundle

```bash
npm run build
```

This compiles the React + Vite frontend into optimized static assets inside `client/dist`.

---

### 5. Running the Application

#### Option A: Production Full-Stack Mode (Single Server)
Once built (`npm run build`), the Express server serves both the REST API and the React frontend on a single port:

```bash
npm start
```
Visit **`http://localhost:5000`** in your browser.

---

#### Option B: Development Mode (Hot Reloading)
From the project root, start both the backend API and frontend with one command:

```bash
npm run dev
```
This starts Express on `http://localhost:5000` and Vite on `http://localhost:3000`; Vite proxies `/api` requests to Express. MongoDB must be available and configured in `.env`. Press `Ctrl+C` to stop both servers.

---

### Repairing straight-line map routes

Legacy road routes with sparse straight-line geometry can be rebuilt from their ordered stops using the OSRM road router. Boat geometry and existing corrected geometries are left unchanged; inactive boat services and routes with unverified geometry are hidden from commuter map previews. Stops more than 300m from a routable road are skipped for manual review. The original geometry remains intact.

Preview eligible route corrections first:

```bash
npm run map:repair-roads
```

Apply the road geometries to the configured MongoDB database:

```bash
npm run map:repair-roads -- --apply
```

After applying corrections, restart the API server or wait for its 90-second map-layer cache to expire.

### Auditing route geometry against ordered stops

Preview road-snapped geometry for configured route stops. The dry run is the default; it uses the OSRM public driving router, skips boat and test/sample routes, and reports stop-distance, detour, and Dagupan-boundary warnings:

```bash
npm run map:fix-routes
```

Apply eligible results only after reviewing the report:

```bash
npm run map:fix-routes -- --apply
```

Applying writes a timestamped backup of current route geometry under `server/data` first. This command does not create or reorder stops; routes without at least two valid ordered stops are reported and left unchanged.

---

### 6. Run Automated Test Suite

InerTayo includes a comprehensive automated test suite covering all 67 API endpoints, security controls, and journey calculations. Tests automatically spin up an isolated in-memory MongoDB server (`mongodb-memory-server`) so they run completely independently of your live database:

```bash
npm test
```

Expected output:
```text
====================================================
   Tests Completed: 119 Passed, 0 Failed
====================================================
```

---

## Key Features & Design Specifications (§0 Corrections Integrated)

1. **Header Navigation & Single Combined Button (§0.1):**
   - Brand Logo (`InerTayo`) | `Routes` | `Fare Calculator` | `About` | `[Launch Web Map]` button.
   - Clean, unified navigation with zero redundant "Launch" links.

2. **Neutral Fare Framing & Real Disclaimers (§0.2):**
   - Labeled strictly as **"Fare Calculator"** (removing unauthorized statutory citations).
   - Real disclaimer: *"Estimates based on project/sample data. Actual rates may vary; not officially verified."*

3. **Advisory Wording (§0.3):**
   - Transparently labeled as admin-managed advisories: *"Routes reflect current advisories"*.

4. **Project Team (§0.4):**
   - Project Manager: **Dizon, Dean Vincent**
   - Members: **Asuncion, Krystabel**, **Casilang, Zet Edades**, **De Guzman, Jian Clarence**, **Dizon, Joshua**, and **Ibasan, Kim Cyrus**.

5. **Server-Side Advisory Travel-Time Recalculation (§0.5):**
   - Routes affected by active advisories dynamically reflect detour travel times computed on the server.

6. **Standardized Web Map Naming (§0.6):**
   - Uniformly named "Web Map" across navigation header, footer links, and page titles.

7. **Standardized Fare-Range Formatting (§0.7):**
   - Always rendered as `₱X – ₱Y` (with spaces around an en dash and the ₱ symbol on both values).

8. **Authenticated Commuter Save Route Feature (§0.8):**
   - Bookmark icon on Route Details enables authenticated commuters to save routes.

9. **Unified Design System for All Screens (§0.9):**
   - Complete screens for Login/Register, Admin Management Portal, Web Map, and Home FROM→TO redirect to pre-filtered Route Directory.

10. **Non-Quantified Brand Statements (§0.10):**
    - "Fully Localized Routes" and "Built for Dagupan".

11. **Informational Transit Web Map (§15):**
---

## Data Configuration & System Architecture

### 1. MongoDB Atlas Collections & Counts
The authoritative Dagupan City transit dataset contains verified collections:
- `routes`: 23 transit routes (traditional jeepneys, modern PUVs, buses, river ferry)
- `stops`: 100 georeferenced transit stops with verified coordinates
- `locations`: 82 unified landmarks, barangays, and transit hubs
- `schools`: 5 verified higher-education institutions (PHINMA UPang, UL, DDC, Lyceum, PIMSAT)
- `tricyclefares`: 31 barangay-level tricycle fare matrices across 4 zones
- `routefares`: 26 PUV/jeepney/bus route fare matrices with distance & 20% discount rates
- `boatfares`: 4 river boat services with dock locations and charter/passenger rates
- `advisories`: Flood hazard and road closure advisories

### 2. Dagupan City Geographic Bounding Envelope
All coordinates undergo strict sanity validation against the Dagupan City bounding box:
- Latitude: `[15.98, 16.12]` North
- Longitude: `[120.28, 120.40]` East
- Centroid: `[16.0433, 120.3333]`

### 3. Key Backend Endpoints & Data Contracts
- `GET /api/routes`: Returns list of transit routes with GeoJSON geometries, stops, and fare ranges.
- `GET /api/routes/:id`: Returns single detailed route with stops, waypoints, and directions.
- `GET /api/search/suggestions?q=`: Unified search across routes, stops, locations, and schools.
- `POST /api/journey/plan`: Multimodal flood-aware journey planner (`origin`, `destination`, `options`).
- `GET /api/fares/tricycles`: 31 barangay tricycle fare matrices with zone and passenger tier rates.
- `GET /api/fares/routes?mode=`: 26 jeepney/modern PUV/bus route fare matrices.
- `GET /api/fares/boats`: 4 river boat service fare matrices.
- `GET /api/advisories`: Active transit advisories and high-tide flood zones.

---

## Authentication & Security Notes

- **Password Policy:** Minimum 8 characters, at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.
- **Rate Limiting:** Authentication writes are restricted to 5 POST requests per 60 seconds per IP to defend against brute force attempts.
- **Authorization:** Admin endpoints strictly require the `ADMIN` role embedded in the verified JWT signature.
- **BOLA / IDOR Defense:** User bookmarks and profiles validate that the requested resource belongs to the authenticated user ID.

---

## License & Attribution

&copy; 2026 InerTayo. Built with care for the Filipino Commuter.  
All sample routes and rates are project estimates for Dagupan City, Pangasinan.
