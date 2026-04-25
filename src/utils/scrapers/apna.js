const cheerio = require("cheerio");
const browserPool = require("../browser-pool");
const { logger } = require("../../config/logger");

async function apnaScraper(keyword) {
  const browser = await browserPool.acquire();
  const page = await browser.newPage();

  try {
    // Apna uses a search URL structure like this:
    const searchUrl = `https://www.apna.co/jobs?q=${encodeURIComponent(keyword)}&location=chennai`;

    logger.info(`[SCRAPER] Apna: Navigating to ${searchUrl}`);

    await page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });

    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Wait for the job cards to appear
    await page.waitForTimeout(3000);

    const html = await page.content();
    const $ = cheerio.load(html);
    const jobs = [];
    const rawCards = $('a[href^="/job/"]');

    logger.info(`[SCRAPER] Apna: Found ${rawCards.length} potential job cards`);

    rawCards.each((i, el) => {
      if (i >= 15) return false;

      const title = $(el).find("h2").text().trim();
      const company = $(el).find("h2 + div").text().trim();
      const logo = $(el).find("img").first().attr("src");
      
      const location = $(el).find("p").first().text().trim();
      const salary = $(el).find("p:nth-of-type(2)").text().trim();

      let url = $(el).attr("href");
      if (url && !url.startsWith("http")) {
        url = "https://www.apna.co" + url;
      }

      if (!title || !company || !url) {
        logger.debug(`[SCRAPER] Apna: Skipping job card due to missing data: ${JSON.stringify({ title, company, url })}`);
        return;
      }

      jobs.push({
        title,
        company,
        company_logo: logo,
        location: location || "Remote",
        salary: salary || "Not disclosed",
        description: `New ${keyword} opening at ${company} in ${location}. Salary: ${salary}`,
        url: url.toLowerCase().split("?")[0].replace(/\/$/, ""), 
        source: "apna",
      });
    });

    return jobs;
  } catch (err) {
    logger.error(`[SCRAPER] Apna failed`, { error: err.message });
    return [];
  } finally {
    await page.close();
    browserPool.release(browser);
  }
}

module.exports = apnaScraper;
