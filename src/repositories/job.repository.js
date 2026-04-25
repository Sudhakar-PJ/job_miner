const db = require("../config/db");
const { logger } = require("../config/logger");

class JobRepository {
  /**
   * Insert a new job and return it for the WebSocket broadcast
   */
  async create(jobData, embedding) {
    const { title, company, company_logo, location, salary, description, url, source } = jobData;
    const sql = `
      INSERT INTO jobs (title, company, company_logo, location, salary, description, url, source, embedding, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (url) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at
      RETURNING id, title, company, company_logo, location, salary, description, url, source, created_at, last_seen_at;
    `;

    try {
      const res = await db.query(sql, [
        title,
        company,
        company_logo,
        location,
        salary,
        description,
        url,
        source,
        embedding ? `[${embedding.join(",")}]` : null,
      ]);
      return res.rows[0];
    } catch (error) {
      logger.error("[REPO] Error inserting job", { 
        message: error.message, 
        detail: error.detail,
        data: { title, url } 
      });
      throw error;
    }
  }

  /**
   * Hybrid Search: Combines FTS, Trigram (Typo tolerance), and Vector (Semantic)
   */
  async hybridSearch(query, queryVector, limit = 20, offset = 0, source = null) {
    let whereClause = `(
        search_vector @@ websearch_to_tsquery('english', $1) -- Keyword Match
        OR title % $1                                      -- Typo Match
        OR (embedding <=> $2::vector) < 0.4                -- Semantic Match
      )`;
    const vectorParam = queryVector ? `[${queryVector.join(",")}]` : null;
    let params = [query, vectorParam, limit, offset];

    if (source && source !== 'all') {
      whereClause += ` AND source = $5`;
      params.push(source);
    }

    const sql = `
      SELECT id, title, company, company_logo, location, description, url, source, created_at,
        ts_rank(search_vector, websearch_to_tsquery('english', $1)) AS fts_score,
        similarity(title, $1) AS trigram_score,
        (1 - (embedding <=> $2::vector)) AS vector_score
      FROM jobs
      WHERE ${whereClause}
      ORDER BY (
        (ts_rank(search_vector, websearch_to_tsquery('english', $1)) * 0.5) +
        (similarity(title, $1) * 0.2) +
        ((1 - (embedding <=> $2::vector)) * 0.3)
      ) DESC
      LIMIT $3 OFFSET $4;
    `;

    try {
      const res = await db.query(sql, params);
      return res.rows;
    } catch (error) {
      logger.error("[REPO] Search failed", { error: error.message });
      throw error;
    }
  }

  async getAll(limit = 20, offset = 0, source = null) {
    let sql = `
      SELECT id, title, company, company_logo, location, description, url, source, created_at 
      FROM jobs 
    `;
    let params = [limit, offset];

    if (source && source !== 'all') {
      sql += ` WHERE source = $3 `;
      params.push(source);
    }

    sql += ` ORDER BY created_at DESC LIMIT $1 OFFSET $2 `;

    const res = await db.query(sql, params);
    return res.rows;
  }

  async filterNewJobs(jobs) {
    if (!jobs || jobs.length === 0) return [];
    
    const urls = jobs.map(j => j.url);
    const sql = `
      SELECT url FROM jobs WHERE url = ANY($1)
    `;
    
    try {
      const res = await db.query(sql, [urls]);
      const existingUrls = new Set(res.rows.map(r => r.url));
      return jobs.filter(j => !existingUrls.has(j.url));
    } catch (error) {
      logger.error("[REPO] Error filtering jobs", { error: error.message });
      return jobs;
    }
  }

  /**
   * Remove jobs older than X days
   */
  async deleteOldJobs(days = 30) {
    const sql = `DELETE FROM jobs WHERE created_at < NOW() - (INTERVAL '1 day' * $1)`;
    try {
      const res = await db.query(sql, [days]);
      logger.info(`[REPO] Cleanup: Deleted ${res.rowCount} old jobs.`);
      return res.rowCount;
    } catch (error) {
      logger.error("[REPO] Cleanup failed", { error: error.message });
      throw error;
    }
  }
}

module.exports = new JobRepository();
