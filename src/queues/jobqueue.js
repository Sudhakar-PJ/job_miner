const { Queue } = require("bullmq");
const redisClient = require("../config/redis");
const { logger } = require("../config/logger");

const DEDUP_WINDOW = 60000;

class JobQueueManager {
  constructor() {
    this.queue = new Queue("scraper-tasks", {
      connection: redisClient,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: true,
      },
    });

    this.cleanupQueue = new Queue("cleanup-tasks", {
      connection: redisClient,
    });

    this.recentJobs = new Set();
  }

  async addScrapeTask(source, keyword) {
    try {
      const jobId = `${source}-${keyword.replace(/\s+/g, "-")}`;
      
      if (this.recentJobs.has(jobId)) {
        logger.info(`[QUEUE] Task ${jobId} already in progress, skipping`);
        return;
      }

      this.recentJobs.add(jobId);
      
      await this.queue.add(jobId, { source, keyword }, {
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 10 },
      });
      
      logger.info(`[QUEUE] Task added: ${source} (${keyword})`);
    } catch (error) {
      logger.error("[QUEUE] Failed to add task", { error: error.message });
    }
  }

  async scheduleCleanup() {
    try {
      // Repeat every 24 hours
      await this.cleanupQueue.add(
        "daily-cleanup",
        { days: 30 },
        {
          repeat: {
            pattern: "0 0 * * *", // Every day at midnight
          },
        }
      );
      logger.info("[QUEUE] Cleanup task scheduled (Daily)");
    } catch (error) {
      logger.error("[QUEUE] Failed to schedule cleanup", { error: error.message });
    }
  }

  /**
   * Schedules recurring scraping tasks based on config/keywords.js
   */
  async scheduleAutomatedScraping() {
    const config = require("../config/keywords");
    const { sources, keywords, interval } = config;

    try {
      for (const source of sources) {
        for (const keyword of keywords) {
          const jobId = `auto-${source}-${keyword.replace(/\s+/g, "-")}`;
          this.recentJobs.add(jobId);
          
          await this.queue.add(
            jobId,
            { source, keyword },
            {
              repeat: {
                pattern: interval,
              },
              removeOnComplete: { count: 10 },
              removeOnFail: { count: 10 },
            }
          );
        }
      }
      logger.info(
        `[QUEUE] Scheduled automated scraping for ${sources.length} sources and ${keywords.length} keywords (Interval: ${interval})`
      );
    } catch (error) {
      logger.error("[QUEUE] Failed to schedule automated scraping", {
        error: error.message,
      });
    }
  }
}

module.exports = new JobQueueManager();
