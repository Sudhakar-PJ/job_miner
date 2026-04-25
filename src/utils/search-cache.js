const { logger } = require("../config/logger");

const DEFAULT_TTL = 300000;

class SearchCache {
  constructor() {
    this.cache = new Map();
    this.ttl = DEFAULT_TTL;
  }

  set(key, value, customTtl) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (customTtl || this.ttl),
    });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  clear() {
    this.cache.clear();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
    setInterval(() => this.cleanup(), 60000);
  }
}

module.exports = new SearchCache();