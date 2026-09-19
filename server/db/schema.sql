-- InerTayo Relational Schema (SQLite)
-- Public Transportation Route Information System for Dagupan City, Pangasinan

PRAGMA foreign_keys = ON;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('COMMUTER', 'ADMIN')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Transport modes table (Jeepney, Bus, Tricycle, Boat)
-- status: ACTIVE | INACTIVE — admin-controlled
CREATE TABLE IF NOT EXISTS transport_modes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    icon TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Routes table
CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_name TEXT NOT NULL,
    transport_mode_id INTEGER NOT NULL,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    estimated_time INTEGER NOT NULL, -- normal estimated travel time in minutes
    detour_time INTEGER,            -- travel time in minutes when detour/advisory is active
    minimum_fare REAL NOT NULL,
    maximum_fare REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'CLEAR' CHECK (status IN ('CLEAR', 'DETOUR_ACTIVE', 'UNAVAILABLE', 'ADVISORY')),
    description TEXT,
    geometry TEXT,                  -- GeoJSON LineString geometry string (original)
    geometry_corrected TEXT,        -- Corrected GeoJSON LineString geometry string
    use_corrected_geometry INTEGER DEFAULT 1, -- 1 = use corrected, 0 = use original
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transport_mode_id) REFERENCES transport_modes(id) ON DELETE RESTRICT
);

-- Stops table
CREATE TABLE IF NOT EXISTS stops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id INTEGER NOT NULL,
    stop_name TEXT NOT NULL,
    stop_order INTEGER NOT NULL,
    description TEXT,
    is_transfer_point INTEGER DEFAULT 0,
    latitude REAL,
    longitude REAL,
    FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
);

-- Route Steps (Step-by-step turn/commute instructions)
CREATE TABLE IF NOT EXISTS route_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id INTEGER NOT NULL,
    step_number INTEGER NOT NULL,
    mode TEXT NOT NULL, -- 'Walk', 'Jeepney', 'Tricycle', 'Bus', 'Boat'
    instruction TEXT NOT NULL,
    location_info TEXT,
    FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
);

-- Fares table (Configurable passenger discounts)
CREATE TABLE IF NOT EXISTS fares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id INTEGER NOT NULL,
    passenger_type TEXT NOT NULL CHECK (passenger_type IN ('REGULAR', 'STUDENT', 'SENIOR_CITIZEN', 'PWD')),
    base_fare REAL NOT NULL,
    discount_percentage REAL NOT NULL DEFAULT 0,
    final_fare REAL NOT NULL,
    effective_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
);

-- Road / River Advisories
-- condition is validated at application level to support extended values:
--   FLOODED | HIGH_TIDE | ROAD_CLOSURE | DETOUR | ROUTE_UNAVAILABLE | CLEAR
--   | RIVER_TRANSPORT_SUSPENDED | RIVER_ADVISORY | ROUTE_CLEAR
-- The CHECK constraint is intentionally removed from condition so it can be
-- extended without an incompatible SQLite schema migration.
CREATE TABLE IF NOT EXISTS advisories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    affected_road TEXT NOT NULL,
    condition TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Advisory Routes link (Many-to-many relationship)
CREATE TABLE IF NOT EXISTS advisory_routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advisory_id INTEGER NOT NULL,
    route_id INTEGER NOT NULL,
    FOREIGN KEY (advisory_id) REFERENCES advisories(id) ON DELETE CASCADE,
    FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
    UNIQUE (advisory_id, route_id)
);

-- Commuter Feedback / Route update reports
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'REVIEWED')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Saved Routes for authenticated commuters
CREATE TABLE IF NOT EXISTS saved_routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    route_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
    UNIQUE (user_id, route_id)
);

-- Landmarks table for Dagupan reference points and autocomplete (legacy — kept for backward compat)
CREATE TABLE IF NOT EXISTS landmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    type TEXT NOT NULL, -- 'MALL', 'TERMINAL', 'HOSPITAL', 'SCHOOL', 'PLAZA', 'BEACH'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Unified Locations table
-- Authoritative place catalog for streets, landmarks, river stops, etc.
-- type: STREET | ROAD | LANDMARK | ESTABLISHMENT | TERMINAL | STOP
--       | INTERSECTION | BARANGAY | RIVER_STOP | DESTINATION
-- Coordinates are canonical here — never hard-coded in frontend.
-- ============================================================
CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    barangay TEXT,
    address TEXT,
    latitude REAL,
    longitude REAL,
    description TEXT,
    search_keywords TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Boat Route Details
-- River-specific metadata for routes whose transport_mode is BOAT.
-- operating_status is always admin-entered — never inferred or hard-coded.
-- ============================================================
CREATE TABLE IF NOT EXISTS boat_route_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id INTEGER NOT NULL UNIQUE,
    waterway TEXT,
    origin_river_stop_id INTEGER,
    destination_river_stop_id INTEGER,
    operating_status TEXT NOT NULL DEFAULT 'ACTIVE',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
    FOREIGN KEY (origin_river_stop_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (destination_river_stop_id) REFERENCES locations(id) ON DELETE SET NULL
);

-- ============================================================
-- Route Segments
-- Structured multi-modal chain for a route (walk→jeepney→boat etc.).
-- Separate from route_steps (free-text instructions) — not a replacement.
-- mode: Walk | Jeepney | Bus | Tricycle | Boat
-- ============================================================
CREATE TABLE IF NOT EXISTS route_segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id INTEGER NOT NULL,
    segment_order INTEGER NOT NULL,
    mode TEXT NOT NULL,
    start_location_id INTEGER,
    end_location_id INTEGER,
    fare REAL NOT NULL DEFAULT 0,
    estimated_time INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
    FOREIGN KEY (start_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (end_location_id) REFERENCES locations(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_routes_mode ON routes(transport_mode_id);
CREATE INDEX IF NOT EXISTS idx_routes_status ON routes(status);
CREATE INDEX IF NOT EXISTS idx_stops_route ON stops(route_id, stop_order);
CREATE INDEX IF NOT EXISTS idx_steps_route ON route_steps(route_id, step_number);
CREATE INDEX IF NOT EXISTS idx_fares_route ON fares(route_id, passenger_type);
CREATE INDEX IF NOT EXISTS idx_advisories_status ON advisories(status);
CREATE INDEX IF NOT EXISTS idx_saved_routes_user ON saved_routes(user_id);
CREATE INDEX IF NOT EXISTS idx_landmarks_type ON landmarks(type);
CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(type);
CREATE INDEX IF NOT EXISTS idx_locations_name ON locations(name);
CREATE INDEX IF NOT EXISTS idx_locations_barangay ON locations(barangay);
CREATE INDEX IF NOT EXISTS idx_locations_keywords ON locations(search_keywords);
CREATE INDEX IF NOT EXISTS idx_route_segments_route ON route_segments(route_id, segment_order);
CREATE INDEX IF NOT EXISTS idx_boat_details_route ON boat_route_details(route_id);


