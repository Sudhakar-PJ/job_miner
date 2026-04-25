const jobService = require("../services/job.service");
const jobQueue = require("../queues/jobqueue");
const { logger } = require("../config/logger");

const ALLOWED_SOURCES = ["linkedin", "apna", "naukri", "all"];
const MAX_KEYWORD_LENGTH = 100;
const MAX_QUERY_LENGTH = 200;

const sanitizeString = (str, maxLen) => {
  if (typeof str !== "string") return null;
  return str.trim().slice(0, maxLen);
};

const validateSource = (source) => {
  return ALLOWED_SOURCES.includes(source?.toLowerCase());
};

class JobController {
  /**
   * GET /api/jobs/search?q=javascript
   */
  async searchJobs(req, res) {
    try {
      const { q, page = 1, limit = 20, source = "all" } = req.query;
      const parsedPage = Math.max(1, parseInt(page));
      const parsedLimit = Math.min(100, Math.max(1, parseInt(limit)));
      const offset = (parsedPage - 1) * parsedLimit;

      if (!q) {
        const jobs = await jobService.fetchRecent(parsedLimit, offset, source);
        return res.json(jobs);
      }

      const results = await jobService.search(q, parsedLimit, offset, source);
      res.json(results);
    } catch (error) {
      logger.error("[CONTROLLER] Search Error", { error: error.message });
      res.status(500).json({ error: "Search failed" });
    }
  }

  /**
   * POST /api/jobs/scrape
   * Body: { source: 'indeed', keyword: 'javascript' }
   */
  async triggerScrape(req, res) {
    try {
      const { source, keyword } = req.body || {};

      const safeKeyword = sanitizeString(keyword, MAX_KEYWORD_LENGTH);
      const safeSource = sanitizeString(source, 20);

      if (!safeSource || !safeKeyword) {
        return res.status(400).json({ error: "Source and keyword are required" });
      }

      if (!validateSource(safeSource)) {
        return res.status(400).json({ error: "Invalid source" });
      }

      await jobQueue.addScrapeTask(safeSource.toLowerCase(), safeKeyword);
      res.json({ message: `Scrape task for ${safeSource} (${safeKeyword}) queued successfully` });
    } catch (error) {
      logger.error("[CONTROLLER] Trigger Scrape Error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to queue task" });
    }
  }
}

module.exports = new JobController();
