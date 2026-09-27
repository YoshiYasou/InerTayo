'use strict';
// In-memory cache for GeoJSON map layer responses.
// Invalidated on any admin route/stop/advisory CRUD write.
const _cache = new Map();
const TTL_MS = 90_000;

function getCache(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  _cache.set(key, { data, ts: Date.now() });
}

function invalidateMapCache() {
  _cache.clear();
}

module.exports = { getCache, setCache, invalidateMapCache };
