const express = require("express");
const router = express.Router();
const jobController = require("../controllers/job.controller");

// Search and Initial Load
router.get("/search", jobController.searchJobs);

// Manually trigger a scrape (useful for testing)
router.post("/scrape", jobController.triggerScrape);

module.exports = router;
