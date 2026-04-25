const { Worker } = require("bullmq");
const redisClient = require("../config/redis");
const jobService = require("../services/job.service");
const jobQueue = require("../queues/jobqueue");
const { logger } = require("../config/logger");

const MAX_RETRIES = 3;

// Import your site-specific scrapers
const linkedinScraper = require("../utils/scrapers/linkedin");
const apnaScraper = require("../utils/scrapers/apna");
const naukriScraper = require("../utils/scrapers/naukri");

class JobWorker {
  constructor() {
    this.worker = new Worker(
      "scraper-tasks",
      async (job) => {
        const { source, keyword } = job.data;
        logger.info(
          `[WORKER] Starting scrape: ${source} for keyword: ${keyword}`,
        );

        try {
          let scrapedJobs = [];

          // Choose scraper based on source
          if (source === "all") {
            const scrapers = [
              { name: "linkedin", fn: linkedinScraper },
              { name: "apna", fn: apnaScraper },
              { name: "naukri", fn: naukriScraper },
            ];

            const results = await Promise.allSettled(
              scrapers.map(s => s.fn(keyword))
            );

            results.forEach((result, idx) => {
              if (result.status === "fulfilled") {
                scrapedJobs.push(...result.value);
              } else {
                logger.error(`[WORKER] ${scrapers[idx].name} failed:`, result.reason);
              }
            });
          } else if (source === "linkedin") {
            scrapedJobs = await linkedinScraper(keyword);
          } else if (source === "apna") {
            scrapedJobs = await apnaScraper(keyword);
          } else if (source === "naukri") {
            scrapedJobs = await naukriScraper(keyword);
          }

          logger.info(`[WORKER] Scrapers found ${scrapedJobs.length} total jobs`);

          const result = await jobService.processScrapedJobs(scrapedJobs);
          logger.info(`[WORKER] Processed ${result.processed} jobs, ${result.new} new`);
        } catch (error) {
          logger.error(`[WORKER] Job failed (attempt ${job.attemptsMade + 1}/${MAX_RETRIES})`, {
            id: job.id,
            error: error.message,
            stack: error.stack,
          });
          throw error;
        }
      },
      {
        connection: redisClient,
        concurrency: 2,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
        limiter: {
          max: 10,
          duration: 60000,
        },
      },
    );

    this.worker.on("failed", (job, err) => {
      if (job.attemptsMade < MAX_RETRIES) {
        logger.info(`[WORKER] Retrying job ${job.id} (attempt ${job.attemptsMade + 1}/${MAX_RETRIES})`);
      } else {
        logger.error(`[WORKER] Job ${job.id} failed permanently after ${MAX_RETRIES} attempts`);
      }
    });

    this.worker.on("completed", (job) => {
      const jobId = `${job.data.source}-${job.data.keyword.replace(/\s+/g, "-")}`;
      jobQueue.recentJobs.delete(jobId);
    });
  }
}

module.exports = new JobWorker();
