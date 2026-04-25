const cheerio = require("cheerio");
const browserPool = require("../browser-pool");
const { logger } = require("../../config/logger");

async function linkedinScraper(keyword) {
  const browser = await browserPool.acquire();
  const page = await browser.newPage();

  try {
    const location = "Chennai, Tamil Nadu, India";
    const searchUrl = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}`;

    logger.info(`[SCRAPER] LinkedIn: Starting "${keyword}"`);

    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2500);

    const html = await page.content();
    const $ = cheerio.load(html);
    const jobs = [];

    $(".base-card").each((i, el) => {
      if (i >= 15) return false;

      const title = $(el).find(".base-search-card__title").text().trim();
      const company = $(el).find(".base-search-card__subtitle").text().trim();
      
      // Improved logo selector from reference code (handles lazy loading)
      const company_logo =
        $(el).find("img.artdeco-entity-image").attr("data-delayed-url") ||
        $(el).find("img.artdeco-entity-image").attr("src") ||
        $(el).find("img.base-search-card__img").attr("data-delayed-url") ||
        $(el).find("img.base-search-card__img").attr("src") ||
        null;

      const location = $(el)
        .find(".job-search-card__location")
        .text()
        .trim();

      const url = $(el).find(".base-card__full-link").attr("href");

      if (!title || !company || !url) return;

      jobs.push({
        title,
        company,
        company_logo,
        location: location || "Remote",
        salary: "Not disclosed",
        description: `New ${keyword} opening at ${company} in ${location}`.substring(0, 500),
        url: url.toLowerCase().split("?")[0].replace(/\/$/, ""), // Clean URL for uniqueness
        source: "linkedin",
      });
    });

    return jobs;
  } catch (err) {
    logger.error(`[SCRAPER] LinkedIn failed`, { error: err.message });
    return [];
  } finally {
    await page.close();
    browserPool.release(browser);
  }
}

module.exports = linkedinScraper;
