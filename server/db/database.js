const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../../database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Failed to connect to SQLite database:', err.message);
    } else {
        db.run('PRAGMA foreign_keys = ON');
    }
});

// Promisified database interface for async/await
const query = {
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    },

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    },

    exec(sql) {
        return new Promise((resolve, reject) => {
            db.exec(sql, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
};

async function initSchema() {
    // Safe column migrations first — ensure existing tables get new columns before schema/indexes run
    try { await query.run(`ALTER TABLE routes ADD COLUMN geometry TEXT`); } catch (e) {}
    try { await query.run(`ALTER TABLE transport_modes ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'`); } catch (e) {}
    try { await query.run(`ALTER TABLE locations ADD COLUMN barangay TEXT`); } catch (e) {}
    try { await query.run(`ALTER TABLE locations ADD COLUMN search_keywords TEXT`); } catch (e) {}

    const schemaPath = path.resolve(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await query.exec(schemaSql);

    // Safe column migrations after schema execution (for fresh tables or additional properties)
    try { await query.run(`ALTER TABLE routes ADD COLUMN geometry TEXT`); } catch (e) {}
    try { await query.run(`ALTER TABLE transport_modes ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'`); } catch (e) {}
    try { await query.run(`ALTER TABLE locations ADD COLUMN barangay TEXT`); } catch (e) {}
    try { await query.run(`ALTER TABLE locations ADD COLUMN search_keywords TEXT`); } catch (e) {}

    // Migrate advisories table if it still has the legacy CHECK constraint on condition
    try {
        const advTable = await query.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='advisories'`);
        if (advTable && advTable.sql && advTable.sql.includes('condition IN')) {
            await query.exec(`
                PRAGMA foreign_keys = OFF;
                CREATE TABLE advisories_migration (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    affected_road TEXT NOT NULL,
                    condition TEXT NOT NULL,
                    description TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                INSERT INTO advisories_migration SELECT id, title, affected_road, condition, description, status, created_at, updated_at FROM advisories;
                DROP TABLE advisories;
                ALTER TABLE advisories_migration RENAME TO advisories;
                PRAGMA foreign_keys = ON;
            `);
        }
    } catch (e) {
        console.error('Advisories migration note:', e.message);
    }
}

module.exports = {
    db,
    query,
    initSchema
};
