# InerTayo — Migration Plan: SQLite to MongoDB / Mongoose

## Overview
This document outlines the architectural plan for migrating the **InerTayo** public transportation backend from SQLite to MongoDB using Mongoose. The migration fulfills the MERN stack requirement for the school checkpoint while preserving identical API behavior, response shapes, authentication/authorization flows, and complete test suite compatibility (118 automated checks).

---

## 1. Document & Codebase Reconciliation (Step 0 Audit)

Before detailing the Mongoose schemas, the following discrepancies between project documentation (`README.md`, prompt references) and the actual source code were identified and resolved (with the real code taking precedence):

| Item | Documented in Docs / Prompt | Actual Code Implementation | Resolution |
| :--- | :--- | :--- | :--- |
| **Architecture File** | `architecture.html` at repo root | File does not exist in repo | Rely on actual source code in `server/`, `client/`, and `test/`. |
| **Table Count** | 15 SQLite tables | **16 tables** in `server/db/schema.sql` | All 16 tables will be mapped to dedicated Mongoose models in `server/models/`. |
| **REST Endpoints** | 63 REST endpoints | **67 endpoint handlers** in `server/routes/api.js` | All 67 endpoints will be converted to Mongoose with identical contracts. |
| **Automated Checks** | 82 automated checks | **118 assertions** across 11 test suites in `test/api.test.js` | The test runner will maintain all 118 checks using `mongodb-memory-server`. |
| **Seeded Routes** | 6 initial routes | **14 routes** (12 land transit routes + 2 river boat transit routes) in `seed.js` | Full set of 14 routes will be seeded in MongoDB. |
| **ID Typing in Client** | Standard web REST | `client/src/pages/Admin.jsx` uses `parseInt()` & `Number()` on `transport_mode_id`, `origin_river_stop_id`, etc. | Models will maintain an integer `id` field alongside MongoDB's native `_id: ObjectId`. API lookups will accept both `id` (numeric) and `_id` (ObjectId hex), ensuring zero frontend breaking changes. |

---

## 2. Model Mapping (SQLite Tables $\rightarrow$ Mongoose Schemas)

Each of the 16 SQLite tables will have its own dedicated Mongoose model file in `server/models/`.

### 2.1 Identification Strategy
- **`_id`**: Default MongoDB `mongoose.Schema.Types.ObjectId`.
- **`id`**: Numeric integer (`Number`), indexed and unique. Auto-assigned sequentially during creation/seeding.
- In JSON responses (`res.json()`), models will output `id` (as integer or string) and `_id`, ensuring full compatibility with existing frontend code and test assertions.

---

### 2.2 Table-by-Table Schema Definitions

#### 1. `User` (`server/models/User.js`)
*Mapped from `users` table*
- **Fields**:
  - `id`: `{ type: Number, unique: true, index: true }`
  - `username`: `{ type: String, required: true, unique: true, trim: true }`
  - `email`: `{ type: String, required: true, unique: true, trim: true, lowercase: true }`
  - `password_hash`: `{ type: String, required: true }`
  - `role`: `{ type: String, required: true, enum: ['COMMUTER', 'ADMIN'], default: 'COMMUTER' }`
  - `created_at`: `{ type: Date, default: Date.now }`
- **Indexes**: Unique index on `username`, unique index on `email`, unique index on `id`.

#### 2. `TransportMode` (`server/models/TransportMode.js`)
*Mapped from `transport_modes` table*
- **Fields**:
  - `id`: `{ type: Number, unique: true, index: true }`
  - `name`: `{ type: String, required: true, unique: true, trim: true }`
  - `description`: `{ type: String }`
  - `icon`: `{ type: String }`
  - `status`: `{ type: String, required: true, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' }`
  - `created_at`: `{ type: Date, default: Date.now }`
- **Indexes**: Unique index on `name`, unique index on `id`.

#### 3. `Route` (`server/models/Route.js`)
*Mapped from `routes` table*
- **Fields**:
  - `id`: `{ type: Number, unique: true, index: true }`
  - `route_name`: `{ type: String, required: true, trim: true }`
  - `transport_mode_id`: `{ type: Number, required: true }`
  - `transport_mode`: `{ type: mongoose.Schema.Types.ObjectId, ref: 'TransportMode' }`
  - `origin`: `{ type: String, required: true, trim: true }`
  - `destination`: `{ type: String, required: true, trim: true }`
  - `estimated_time`: `{ type: Number, required: true, min: 1 }`
  - `detour_time`: `{ type: Number, default: null }`
  - `minimum_fare`: `{ type: Number, required: true, min: 0 }`
  - `maximum_fare`: `{ type: Number, required: true, min: 0 }`
  - `status`: `{ type: String, required: true, enum: ['CLEAR', 'DETOUR_ACTIVE', 'UNAVAILABLE', 'ADVISORY'], default: 'CLEAR' }`
  - `description`: `{ type: String }`
  - `geometry`: `{ type: String }` *(GeoJSON LineString formatted string or object)*
  - `geometry_corrected`: `{ type: String }`
  - `use_corrected_geometry`: `{ type: Number, default: 1 }`
  - `created_at`: `{ type: Date, default: Date.now }`
  - `updated_at`: `{ type: Date, default: Date.now }`
- **Indexes**: Index on `transport_mode_id`, index on `status`, index on `route_name`.

#### 4. `Stop` (`server/models/Stop.js`)
*Mapped from `stops` table*
- **Fields**:
  - `id`: `{ type: Number, unique: true, index: true }`
  - `route_id`: `{ type: Number, required: true, index: true }`
  - `route`: `{ type: mongoose.Schema.Types.ObjectId, ref: 'Route' }`
  - `stop_name`: `{ type: String, required: true, trim: true }`
  - `stop_order`: `{ type: Number, required: true }`
  - `description`: `{ type: String }`
  - `is_transfer_point`: `{ type: Number, default: 0 }`
  - `latitude`: `{ type: Number }`
  - `longitude`: `{ type: Number }`
- **Indexes**: Compound index on `{ route_id: 1, stop_order: 1 }`.

#### 5. `RouteStep` (`server/models/RouteStep.js`)
*Mapped from `route_steps` table*
- **Fields**:
  - `id`: `{ type: Number, unique: true, index: true }`
  - `route_id`: `{ type: Number, required: true, index: true }`
  - `route`: `{ type: mongoose.Schema.Types.ObjectId, ref: 'Route' }`
  - `step_number`: `{ type: Number, required: true }`
  - `mode`: `{ type: String, required: true }`
  - `instruction`: `{ type: String, required: true }`
  - `location_info`: `{ type: String }`
- **Indexes**: Compound index on `{ route_id: 1, step_number: 1 }`.

#### 6. `Fare` (`server/models/Fare.js`)
*Mapped from `fares` table*
- **Fields**:
  - `id`: `{ type: Number, unique: true, index: true }`
  - `route_id`: `{ type: Number, required: true, index: true }`
  - `route`: `{ type: mongoose.Schema.Types.ObjectId, ref: 'Route' }`
  - `passenger_type`: `{ type: String, required: true, enum: ['REGULAR', 'STUDENT', 'SENIOR_CITIZEN', 'PWD'] }`
  - `base_fare`: `{ type: Number, required: true, min: 0 }`
  - `discount_percentage`: `{ type: Number, default: 0, min: 0, max: 100 }`
  - `final_fare`: `{ type: Number, required: true, min: 0 }`
  - `effective_date`: `{ type: String }`
  - `created_at`: `{ type: Date, default: Date.now }`
  - `updated_at`: `{ type: Date, default: Date.now }`
- **Indexes**: Compound index on `{ route_id: 1, passenger_type: 1 }`.

#### 7. `Advisory` (`server/models/Advisory.js`)
*Mapped from `advisories` table*
- **Fields**:
  - `id`: `{ type: Number, unique: true, index: true }`
  - `title`: `{ type: String, required: true, trim: true }`
  - `affected_road`: `{ type: String, required: true, trim: true }`
  - `condition`: `{ type: String, required: true, trim: true }`
  - `description`: `{ type: String, required: true }`
  - `status`: `{ type: String, required: true, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' }`
  - `created_at`: `{ type: Date, default: Date.now }`
  - `updated_at`: `{ type: Date, default: Date.now }`
- **Indexes**: Index on `status`, index on `id`.

#### 8. `AdvisoryRoute` (`server/models/AdvisoryRoute.js`)
*Mapped from `advisory_routes` table*
- **Fields**:
  - `id`: `{ type: Number, unique: true, index: true }`
  - `advisory_id`: `{ type: Number, required: true, index: true }`
  - `advisory`: `{ type: mongoose.Schema.Types.ObjectId, ref: 'Advisory' }`
  - `route_id`: `{ type: Number, required: true, index: true }`
  - `route`: `{ type: mongoose.Schema.Types.ObjectId, ref: 'Route' }`
- **Indexes**: Compound unique index on `{ advisory_id: 1, route_id: 1 }`.

#### 9. `Feedback` (`server/models/Feedback.js`)
*Mapped from `feedback` table*
- **Fields**:
  - `id`: `{ type: Number, unique: true, index: true }`
  - `user_id`: `{ type: Number, default: null, index: true }`
  - `user`: `{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }`
  - `name`: `{ type: String, required: true }`
  - `email`: `{ type: String, required: true }`
  - `message`: `{ type: String, required: true }`
  - `status`: `{ type: String, required: true, enum: ['NEW', 'REVIEWED'], default: 'NEW' }`
  - `created_at`: `{ type: Date, default: Date.now }`
- **Indexes**: Index on `status`, index on `user_id`.

#### 10. `SavedRoute` (`server/models/SavedRoute.js`)
*Mapped from `saved_routes` table*
- **Fields**:
  - `id`: `{ type: Number, unique: true, index: true }`
  - `user_id`: `{ type: Number, required: true, index: true }`
  - `user`: `{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }`
  - `route_id`: `{ type: Number, required: true, index: true }`
  - `route`: `{ type: mongoose.Schema.Types.ObjectId, ref: 'Route' }`
  - `created_at`: `{ type: Date, default: Date.now }`
- **Indexes**: Compound unique index on `{ user_id: 1, route_id: 1 }`.

#### 11. `Landmark` (`server/models/Landmark.js`)
*Mapped from `landmarks` table*
- **Fields**:
  - `id`: `{ type: Number, unique: true, index: true }`
  - `name`: `{ type: String, required: true, unique: true }`
  - `latitude`: `{ type: Number, required: true }`
  - `longitude`: `{ type: Number, required: true }`
  - `type`: `{ type: String, required: true }`
  - `created_at`: `{ type: Date, default: Date.now }`
- **Indexes**: Unique index on `name`, index on `type`.

#### 12. `Location` (`server/models/Location.js`)
*Mapped from `locations` table*
- **Fields**:
  - `id`: `{ type: Number, unique: true, index: true }`
  - `name`: `{ type: String, required: true }`
  - `type`: `{ type: String, required: true }`
  - `barangay`: `{ type: String }`
  - `address`: `{ type: String }`
  - `latitude`: `{ type: Number }`
  - `longitude`: `{ type: Number }`
  - `description`: `{ type: String }`
  - `search_keywords`: `{ type: String }`
  - `status`: `{ type: String, required: true, default: 'ACTIVE' }`
  - `created_at`: `{ type: Date, default: Date.now }`
  - `updated_at`: `{ type: Date, default: Date.now }`
- **Indexes**: Index on `type`, index on `name`, index on `barangay`.

#### 13. `BoatRouteDetail` (`server/models/BoatRouteDetail.js`)
*Mapped from `boat_route_details` table*
- **Fields**:
  - `id`: `{ type: Number, unique: true, index: true }`
  - `route_id`: `{ type: Number, required: true, unique: true, index: true }`
  - `route`: `{ type: mongoose.Schema.Types.ObjectId, ref: 'Route' }`
  - `waterway`: `{ type: String }`
  - `origin_river_stop_id`: `{ type: Number, default: null }`
  - `origin_river_stop`: `{ type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null }`
  - `destination_river_stop_id`: `{ type: Number, default: null }`
  - `destination_river_stop`: `{ type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null }`
  - `operating_status`: `{ type: String, required: true, default: 'ACTIVE' }`
  - `notes`: `{ type: String }`
  - `created_at`: `{ type: Date, default: Date.now }`
  - `updated_at`: `{ type: Date, default: Date.now }`
- **Indexes**: Unique index on `route_id`.

#### 14. `RouteSegment` (`server/models/RouteSegment.js`)
*Mapped from `route_segments` table*
- **Fields**:
  - `id`: `{ type: Number, unique: true, index: true }`
  - `route_id`: `{ type: Number, required: true, index: true }`
  - `route`: `{ type: mongoose.Schema.Types.ObjectId, ref: 'Route' }`
  - `segment_order`: `{ type: Number, required: true }`
  - `mode`: `{ type: String, required: true }`
  - `start_location_id`: `{ type: Number, default: null }`
  - `start_location`: `{ type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null }`
  - `end_location_id`: `{ type: Number, default: null }`
  - `end_location`: `{ type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null }`
  - `fare`: `{ type: Number, default: 0 }`
  - `estimated_time`: `{ type: Number, default: 0 }`
  - `notes`: `{ type: String }`
- **Indexes**: Compound index on `{ route_id: 1, segment_order: 1 }`.

#### 15. `School` (`server/models/School.js`)
*Mapped from `schools` table*
- **Fields**:
  - `id`: `{ type: Number, unique: true, index: true }`
  - `name`: `{ type: String, required: true, unique: true }`
  - `aliases`: `{ type: String }`
  - `type`: `{ type: String, required: true, default: 'UNIVERSITY' }`
  - `address`: `{ type: String }`
  - `barangay`: `{ type: String }`
  - `city`: `{ type: String, required: true, default: 'Dagupan City' }`
  - `latitude`: `{ type: Number, required: true }`
  - `longitude`: `{ type: Number, required: true }`
  - `entrance_latitude`: `{ type: Number }`
  - `entrance_longitude`: `{ type: Number }`
  - `nearby_stops`: `{ type: String }` *(JSON string of nearby stops)*
  - `verified`: `{ type: Number, default: 1 }`
  - `source`: `{ type: String }`
  - `active`: `{ type: Number, default: 1 }`
  - `created_at`: `{ type: Date, default: Date.now }`
  - `updated_at`: `{ type: Date, default: Date.now }`
- **Indexes**: Unique index on `name`, index on `type`, index on `aliases`.

#### 16. `PasswordReset` (`server/models/PasswordReset.js`)
*Mapped from `password_resets` table*
- **Fields**:
  - `id`: `{ type: Number, unique: true, index: true }`
  - `user_id`: `{ type: Number, required: true, index: true }`
  - `user`: `{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }`
  - `email`: `{ type: String, required: true, index: true }`
  - `reset_code`: `{ type: String, required: true }`
  - `expires_at`: `{ type: Date, required: true }`
  - `used`: `{ type: Number, default: 0 }`
  - `created_at`: `{ type: Date, default: Date.now }`
- **Indexes**: Compound index on `{ reset_code: 1, used: 1 }`, index on `email`.

---

## 3. Relational Mapping: Mongoose Refs vs. Embedded Documents

The rationale for how each SQLite foreign-key relationship is modeled in MongoDB:

| Entity Relationship | Target Model | Storage Strategy | One-Line Architectural Justification |
| :--- | :--- | :--- | :--- |
| `Route.transport_mode_id` | `TransportMode` | **Ref** (`ObjectId` + `populate`) | Shared master entity managed independently by admins and reused across multiple routes. |
| `Stop.route_id` | `Route` | **Ref** (`ObjectId`) | Stops require independent document IDs for individual admin CRUD operations (`/api/admin/stops/:id`). |
| `RouteStep.route_id` | `Route` | **Ref** (`ObjectId`) | Steps require independent document IDs for individual admin CRUD operations (`/api/admin/steps/:id`). |
| `Fare.route_id` | `Route` | **Ref** (`ObjectId`) | Fares are independently updated via dedicated admin endpoints (`/api/admin/fares/:id`). |
| `BoatRouteDetail.route_id` | `Route` | **Ref** (`ObjectId`) | Boat metadata is managed via its own REST endpoints (`/api/admin/boat-details/:id`). |
| `BoatRouteDetail` river stops | `Location` | **Ref** (`ObjectId`) | River docks reference authoritative shared coordinates in the central `Location` catalog. |
| `RouteSegment.route_id` | `Route` | **Ref** (`ObjectId`) | Multi-modal segments have independent lifecycle and dedicated admin endpoints (`/api/admin/segments/:id`). |
| `RouteSegment` locations | `Location` | **Ref** (`ObjectId`) | Start and end locations refer to reusable physical places in the `Location` catalog. |
| `AdvisoryRoute` links | `Advisory` & `Route` | **Ref** (`ObjectId`) | Many-to-many relationship supporting dynamic attachment/detachment of multiple routes per advisory. |
| `SavedRoute` links | `User` & `Route` | **Ref** (`ObjectId`) | Bookmark join collection supporting querying saved routes by commuter or deletion by route. |
| `Feedback.user_id` | `User` | **Ref** (`ObjectId`, optional) | Feedback is submitted by commuters or anonymous guests without mutating the `User` document. |
| `PasswordReset.user_id` | `User` | **Ref** (`ObjectId`) | Security tokens expire independently and must not bloat the core `User` model. |

---

## 4. Cascading Deletes & Relational Integrity in MongoDB

MongoDB lacks built-in foreign key constraints (`ON DELETE CASCADE` / `ON DELETE RESTRICT` / `ON DELETE SET NULL`). We will implement **defense-in-depth cleanup using both explicit application-level service routines AND Mongoose middleware hooks**:

### 4.1 Cascading Delete Matrix

| Action | Affected Collections | Implementation Mechanism | Rationale |
| :--- | :--- | :--- | :--- |
| **Delete Route** (`DELETE /api/admin/routes/:id`) | `Stop`, `RouteStep`, `Fare`, `RouteSegment`, `BoatRouteDetail`, `SavedRoute`, `AdvisoryRoute` | Explicit `deleteMany()` in service handler + Mongoose `pre('deleteOne')` hook on `Route` | Prevents orphan stops, steps, fares, segments, bookmarks, and advisory links across all deletion entrypoints. |
| **Delete Advisory** (`DELETE /api/admin/advisories/:id`) | `AdvisoryRoute` | Explicit `deleteMany({ advisory_id })` + Mongoose `pre('deleteOne')` hook on `Advisory` | Deletes join records when an advisory is removed. |
| **Delete User** | `SavedRoute`, `PasswordReset`, `Feedback` | Explicit cleanup + Mongoose hook: `SavedRoute.deleteMany({ user_id })`, `PasswordReset.deleteMany({ user_id })`, `Feedback.updateMany({ user_id }, { $set: { user_id: null, user: null } })` | Reproduces `ON DELETE CASCADE` for bookmarks/resets and `ON DELETE SET NULL` for feedback records. |
| **Delete Location** (`DELETE /api/admin/locations/:id`) | `BoatRouteDetail`, `RouteSegment` | `BoatRouteDetail.updateMany(...)` and `RouteSegment.updateMany(...)` setting location refs to `null` | Reproduces SQLite's `ON DELETE SET NULL` for dock/stop references. |
| **Delete Transport Mode** | `Route` | Checked prior to delete: if `Route.exists({ transport_mode_id })` $\rightarrow$ reject with 400 | Reproduces SQLite's `ON DELETE RESTRICT` behavior. |

---

## 5. Unique Constraints & Indexing Plan

All SQLite unique constraints will be mapped to Mongoose schema indexes (`unique: true`):

```javascript
// User
UserSchema.index({ username: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ id: 1 }, { unique: true });

// TransportMode
TransportModeSchema.index({ name: 1 }, { unique: true });
TransportModeSchema.index({ id: 1 }, { unique: true });

// Route
RouteSchema.index({ id: 1 }, { unique: true });
RouteSchema.index({ transport_mode_id: 1 });
RouteSchema.index({ status: 1 });

// SavedRoute
SavedRouteSchema.index({ user_id: 1, route_id: 1 }, { unique: true });

// AdvisoryRoute
AdvisoryRouteSchema.index({ advisory_id: 1, route_id: 1 }, { unique: true });

// BoatRouteDetail
BoatRouteDetailSchema.index({ route_id: 1 }, { unique: true });

// Landmark / School
LandmarkSchema.index({ name: 1 }, { unique: true });
SchoolSchema.index({ name: 1 }, { unique: true });

// PasswordReset
PasswordResetSchema.index({ reset_code: 1, used: 1 });
PasswordResetSchema.index({ email: 1 });
```

---

## 6. Implementation Architecture

### 6.1 Database Connection (`server/db/connection.js`)
- Exposes `connectDB(uri)` and `disconnectDB()`.
- Uses `process.env.MONGODB_URI` without hardcoded fallback strings.
- Sets connection options: `{ serverSelectionTimeoutMS: 5000 }`.
- Graceful shutdown handlers on `SIGINT` / `SIGTERM`.

### 6.2 Service Layer Updates
- **`server/services/journeyEngine.js`**:
  - Replace the 6 SQLite SQL queries (`query.get` / `query.all`) with Mongoose queries on `School`, `Location`, `Landmark`, `Route`, `Stop`, and `Advisory`.
  - Retain all Turf.js spatial calculation math unchanged.
- **`server/services/walkingRouter.js`**:
  - Replace the single `SELECT latitude, longitude FROM locations` bounding box query with `Location.find({ latitude: { $gte: minLat, $lte: maxLat }, longitude: { $gte: minLng, $lte: maxLng }, type: { $in: ['STREET', 'ROAD', 'INTERSECTION'] } }).select('latitude longitude').limit(6).lean()`.

### 6.3 Seed Script (`server/db/seed.js`)
- Connects via Mongoose.
- Clears all collections using `deleteMany({})`.
- Inserts seed data in proper order (Users, TransportModes, Routes, Stops, Steps, Fares, Advisories, AdvisoryRoutes, Feedback, Landmarks, Locations, BoatRouteDetails, RouteSegments, Schools).
- Preserves the exact default credentials (`admin@inertayo.ph / AdminPassword123!` and `commuter@inertayo.ph / Commuter123!`).

### 6.4 Test Suite Integration (`test/api.test.js`)
- Replace SQLite initialization with `mongodb-memory-server` (`MongoMemoryServer.create()`).
- In-memory MongoDB starts up dynamically before tests run and tears down on exit.
- Zero external MongoDB daemon needed to run automated unit/integration tests.
- Preserves 100% of the 118 assertions.

---

## 7. Migration Checklist & Safety Verification
1. [x] Step 0 complete: audit all files, reconcile documentation discrepancies.
2. [x] Step 1 complete: produce `MIGRATION_PLAN.md` covering schemas, relationships, cascading deletes, indexes.
3. [ ] **Wait for User Approval of `MIGRATION_PLAN.md` before executing Step 2.**
4. [ ] Step 2: Install `mongoose` and `mongodb-memory-server` (dev), remove `sqlite3`.
5. [ ] Step 2: Create connection layer and 16 Mongoose models.
6. [ ] Step 2: Refactor `api.js` endpoints to Mongoose.
7. [ ] Step 2: Update `journeyEngine.js` and `walkingRouter.js`.
8. [ ] Step 2: Update `seed.js`.
9. [ ] Step 2: Update `test/api.test.js` to run against in-memory MongoDB.
10. [ ] Step 3: Verify `npm run seed` and `npm test` (all 118 checks pass).
11. [ ] Step 3: Live endpoint smoke test.
