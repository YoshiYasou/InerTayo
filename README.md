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
```

> **Tip:** If you are using MongoDB Atlas, remember to replace `<username>` and `<password>` with your database user credentials, add your current IP address (or `0.0.0.0/0`) in Atlas **Network Access**, and specify the database name `/inertayo` in the connection path.

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
