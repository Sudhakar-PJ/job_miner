const jobRepository = require("../repositories/job.repository");
const aiService = require("./ai.service");
const { getIO } = require("../config/websocket");
const { logger } = require("../config/logger");
const searchCache = require("../utils/search-cache");

class JobService {
  /**
   * Process multiple jobs - filters duplicates first
   */
  async processScrapedJobs(jobs) {
    if (!jobs || jobs.length === 0) return { processed: 0, new: 0 };

    const uniqueJobs = new Map();
    const seenCompositeKeys = new Set();

    jobs.forEach(job => {
      if (!job.url) return;
      // 1. Normalize the URL: lowercase and remove trailing slashes/queries
      // (Already mostly done in scrapers, but good to ensure consistency)
      const cleanUrl = job.url.toLowerCase().split('?')[0].replace(/\/$/, "");
      
      // 2. Composite key: title + company
      const compositeKey = `${job.title}-${job.company}`.toLowerCase().replace(/\s+/g, '');

      // Only add if we haven't seen this URL OR this composite key in THIS batch
      if (!uniqueJobs.has(cleanUrl) && !seenCompositeKeys.has(compositeKey)) {
        uniqueJobs.set(cleanUrl, job);
        seenCompositeKeys.add(compositeKey);
      }
    });

    const uniqueJobList = Array.from(uniqueJobs.values());
    const newJobs = await jobRepository.filterNewJobs(uniqueJobList);
    const duplicates = jobs.length - newJobs.length;

    logger.info(`[SERVICE] Filtered ${duplicates} duplicates, ${newJobs.length} new jobs`);

    let newCount = 0;
    for (const jobData of newJobs) {
      await this.processScrapedJob(jobData);
      newCount++;
    }

    return { processed: jobs.length, new: newCount };
  }

  /**
   * Main entry point for the scraper worker to save results
   */
  async processScrapedJob(jobData) {
    try {
      const embeddingText = `${jobData.title} ${jobData.description}`;
      const embedding = await aiService.generateEmbedding(embeddingText);

      const newJob = await jobRepository.create(jobData, embedding);

      if (newJob) {
        logger.info(`[SERVICE] New job saved: ${newJob.title}`);
        getIO().emit("NEW_JOB", newJob);
        searchCache.clear();
        return newJob;
      }
    } catch (error) {
      logger.error("[SERVICE] Failed to process scraped job", {
        error: error.message,
      });
    }
  }

  /**
   * Search jobs using the hybrid model
   */
  async search(query, limit = 20, offset = 0, source = null) {
    const queryVector = await aiService.generateEmbedding(query);
    const results = await jobRepository.hybridSearch(query, queryVector, limit, offset, source);
    return results;
  }

  async fetchRecent(limit = 20, offset = 0, source = null) {
    return await jobRepository.getAll(limit, offset, source);
  }

  async performCleanup(days = 30) {
    return await jobRepository.deleteOldJobs(days);
  }
}

module.exports = new JobService();
