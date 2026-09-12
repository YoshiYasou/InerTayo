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

-- Transport modes table (Jeepney, Bus, Tricycle)
CREATE TABLE IF NOT EXISTS transport_modes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    icon TEXT,
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
    mode TEXT NOT NULL, -- 'Walk', 'Jeepney', 'Tricycle', 'Bus'
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

-- Flood / Road Advisories
CREATE TABLE IF NOT EXISTS advisories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    affected_road TEXT NOT NULL,
    condition TEXT NOT NULL CHECK (condition IN ('FLOODED', 'HIGH_TIDE', 'ROAD_CLOSURE', 'DETOUR', 'ROUTE_UNAVAILABLE', 'CLEAR')),
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Advisory Routes link (Many-to-many relationship per §4)
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

-- Saved Routes for authenticated commuters per §0.8
CREATE TABLE IF NOT EXISTS saved_routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    route_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
    UNIQUE (user_id, route_id)
);

-- Landmarks table for Dagupan reference points and autocomplete
CREATE TABLE IF NOT EXISTS landmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    type TEXT NOT NULL, -- 'MALL', 'TERMINAL', 'HOSPITAL', 'SCHOOL', 'PLAZA', 'BEACH'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

