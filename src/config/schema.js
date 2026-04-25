const db = require("./db");
const { logger } = require("./logger");

class SchemaInit {
  static async init() {
    try {
      // Extensions
      await db.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
      await db.query(`CREATE EXTENSION IF NOT EXISTS vector`);
      await db.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

      // Table
      await db.query(`
        CREATE TABLE IF NOT EXISTS jobs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          title TEXT NOT NULL,
          company TEXT,
          company_logo TEXT,
          location TEXT,
          salary TEXT,
          description TEXT,
          url TEXT UNIQUE,
          source TEXT,

          -- Full-text search
          search_vector tsvector GENERATED ALWAYS AS (
            setweight(to_tsvector('english', title), 'A') ||
            setweight(to_tsvector('english', coalesce(description, '')), 'B')
          ) STORED,

          -- Embedding (Gemini = 768 dims)
          embedding vector(768),

          created_at TIMESTAMP DEFAULT NOW(),
          last_seen_at TIMESTAMP DEFAULT NOW()
        );
      `);

      // Indexes
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_jobs_fts
        ON jobs USING GIN(search_vector);
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_jobs_trgm
        ON jobs USING GIN(title gin_trgm_ops);
      `);

      // Vector index
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_jobs_embedding
        ON jobs
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);
      `);

      // Additional indexes
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_jobs_source
        ON jobs (source);
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_jobs_created_at
        ON jobs (created_at DESC);
      `);

      // Optimize query planner
      await db.query(`ANALYZE jobs`);

      logger.info("✅ Database Schema Initialized");
    } catch (err) {
      logger.error("❌ Schema Init Error", { error: err.message });
      throw err;
    }
  }
}

module.exports = SchemaInit;
