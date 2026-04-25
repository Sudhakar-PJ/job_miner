const cheerio = require("cheerio");
const browserPool = require("../browser-pool");
const { logger } = require("../../config/logger");

async function naukriScraper(keyword) {
  let browser;
  let context;
  let page;
  
  try {
    browser = await browserPool.acquire();
    context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });
    page = await context.newPage();

    const location = "chennai";
    // Format: node-js-jobs-in-chennai
    const formattedKeyword = keyword.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const searchUrl = `https://www.naukri.com/${formattedKeyword}-jobs-in-${location}`;

    // Add random jitter (1-5 seconds)
    const jitter = Math.floor(Math.random() * 4000) + 1000;
    await new Promise(r => setTimeout(r, jitter));

    logger.info(`[SCRAPER] Naukri: Navigating to ${searchUrl}`);

    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    try {
      await page.waitForSelector(".cust-job-tuple", { timeout: 15000 });
      logger.info(`[SCRAPER] Naukri: Job cards loaded`);
    } catch (e) {
      logger.warn(`[SCRAPER] Naukri: Timeout waiting for job cards. May be no results or captcha.`);
    }

    // Scroll slightly to trigger lazy-loaded images
    await page.evaluate(() => window.scrollBy(0, 500));
    await new Promise(r => setTimeout(r, 2000));

    const html = await page.content();
    const $ = cheerio.load(html);
    const jobs = [];
    const rawCards = $(".cust-job-tuple");

    logger.info(`[SCRAPER] Naukri: Found ${rawCards.length} potential job cards`);

    rawCards.each((i, el) => {
      if (i >= 20) return false;

      const title = $(el).find("a.title").text().trim();
      const company = $(el).find("a.comp-name").text().trim();
      const company_logo = $(el).find(".comp-logo img").attr("src") || $(el).find("img").attr("src") || null;
      const jobLocation = $(el).find(".locWdth").text().trim();
      const salary = $(el).find(".sal").text().trim();
      
      let url = $(el).find("a.title").attr("href");

      if (!title || !company || !url) {
        return;
      }

      jobs.push({
        title,
        company,
        company_logo,
        location: jobLocation || "Chennai",
        salary: salary || "Not disclosed",
        description: `New ${keyword} role at ${company} in ${jobLocation || "Chennai"}.`,
        url: url.toLowerCase().split("?")[0].replace(/\/$/, ""),
        source: "naukri",
      });
    });

    logger.info(`[SCRAPER] Naukri: Successfully extracted ${jobs.length} jobs`);
    return jobs;
  } catch (err) {
    logger.error(`[SCRAPER] Naukri failed: ${err.message}`, { stack: err.stack });
    return [];
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) browserPool.release(browser);
  }
}

module.exports = naukriScraper;
