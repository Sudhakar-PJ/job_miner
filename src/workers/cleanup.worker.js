const { Worker } = require("bullmq");
const redisClient = require("../config/redis");
const jobService = require("../services/job.service");
const { logger } = require("../config/logger");

class CleanupWorker {
  constructor() {
    this.worker = new Worker(
      "cleanup-tasks",
      async (job) => {
        const { days } = job.data;
        logger.info(`[CLEANUP WORKER] Starting database cleanup (Older than ${days} days)`);

        try {
          const deletedCount = await jobService.performCleanup(days);
          logger.info(`[CLEANUP WORKER] Successfully deleted ${deletedCount} old jobs.`);
        } catch (error) {
          logger.error(`[CLEANUP WORKER] Cleanup failed`, {
            id: job.id,
            error: error.message,
          });
          throw error;
        }
      },
      {
        connection: redisClient,
      }
    );
  }
}

module.exports = new CleanupWorker();
