/**
 * Automated scraping configuration.
 * The system will loop through all sources and keywords to create jobs.
 */
module.exports = {
  sources: ["linkedin", "apna", "naukri"],
  keywords: ["Javascript", "React", "Node.js", "Full Stack"],
  interval: "0 */6 * * *", // Every 6 hours
};
