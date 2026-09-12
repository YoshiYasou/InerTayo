# InerTayo — Public Transportation Route Information System
**Target Location:** Dagupan City, Pangasinan, Philippines  
**Primary Users:** Commuters, Administrators

InerTayo is a dedicated public transportation route information system built specifically for commuters in Dagupan City, Pangasinan. Inspired by route-finding services like Sakay.ph, it organizes traditional Jeepneys, Tricycles, and Buses into an accessible, searchable, and flood-resilient transit network.

---

## Key Features & Design Specifications (§0 Corrections Integrated)

1. **Header Navigation & Single Combined Button (§0.1):**
   - Brand Logo (`InerTayo`) | `Routes` | `Fare Calculator` | `About` | `[Launch Web Map]` button.
   - Clean, unified navigation with zero redundant "Launch" links.

2. **Neutral Fare Framing & Real Disclaimers (§0.2):**
   - Labeled strictly as **"Fare Calculator"** (removing all unauthorized "Official Municipal" claims and false statutory citations like RA 10687).
   - Real disclaimer: *"Estimates based on project/sample data. Actual rates may vary; not officially verified."*

3. **Advisory Wording (§0.3):**
   - Transparently labeled as admin-managed advisories: *"Routes reflect current advisories"* (avoiding false live "auto-reroute" claims).

4. **Generic Team Personas (§0.4):**
   - Generic roles: *Transit Network Specialist*, *Full-Stack Systems Engineer*, *GIS & Local Research Mapper* (zero celebrity or identifiable real persona placeholders).

5. **Server-Side Advisory Travel-Time Recalculation (§0.5):**
   - Routes affected by active advisories dynamically reflect detour travel times computed on the server (e.g. Dagupan–Calasiao Detour Active reflects 30 mins vs 15 mins base).

6. **Standardized Web Map Naming (§0.6):**
   - Uniformly named "Web Map" across the navigation header, footer links, and page titles.

7. **Standardized Fare-Range Formatting (§0.7):**
   - Always rendered as `₱X – ₱Y` (with spaces around an en dash and the ₱ symbol on both values).

8. **Authenticated Commuter Save Route Feature (§0.8):**
   - Bookmark icon on Route Details enables authenticated commuters to bookmark routes stored in `saved_routes` (`user_id`, `route_id`).

9. **Unified Design System for All Screens (§0.9):**
   - Complete screens for Login/Register, Admin Management Portal, Web Map, and Home FROM→TO redirect to pre-filtered Route Directory.

10. **Non-Quantified Brand Statements (§0.10):**
    - "Fully Localized Routes" and "Built for Dagupan".

11. **Informational Transit Web Map (§15):**
    - Leaflet.js interactive map centered on Dagupan City showing route corridors, stop markers, transfer points, and high tide flood hazard zones. Zero fake GPS or vehicle tracking.

---

## Default Accounts

| Role | Username | Email | Password | Access Level |
|---|---|---|---|---|
| **Administrator** | `admin` | `admin@inertayo.ph` | `AdminPassword123!` | Full Admin Portal (`/admin`), Route/Advisory/Fare CRUD |
| **Commuter** | `commuter` | `commuter@inertayo.ph` | `Commuter123!` | Public Commuter Search, Bookmarking (`saved_routes`), Feedback |

---

## Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS, Lucide Icons, Leaflet
- **Backend:** Node.js, Express.js (REST API)
- **Database:** SQLite with foreign keys (`PRAGMA foreign_keys = ON`), parameterized statements, and relational integrity
- **Authentication & Security:** JWT tokens with bcrypt password hashing and server-side role authorization (`ADMIN`)

---

## Getting Started

### 1. Install Dependencies
```powershell
# Install server dependencies
npm install

# Install client dependencies
npm --prefix client install
```

### 2. Seed the Database
```powershell
# Seeds default users, 6 routes, stops, turn steps, fares, and active advisories
npm run seed
```

### 3. Build Client Bundle
```powershell
# Builds production SPA to client/dist
npm run build
```

### 4. Run the Full Application
```powershell
# Starts the full-stack server on http://localhost:5000
npm start
```
Visit **`http://localhost:5000`** in your browser.

### 5. Run Automated Test Suite
```powershell
# Executes comprehensive automated test suite (31 automated tests)
npm test
```

---

## License & Attribution

&copy; 2026 InerTayo. Built with care for the Filipino Commuter.  
All sample routes and rates are project estimates for Dagupan City, Pangasinan.
# InerTayo
