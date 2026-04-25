const { chromium } = require("playwright-extra");
const PuppeteerStealth = require("puppeteer-extra-plugin-stealth");
const { logger } = require("../config/logger");

// Activate Stealth
chromium.use(PuppeteerStealth());

const POOL_SIZE = 4;
const LAUNCH_TIMEOUT = 30000;
const IDLE_TIMEOUT = 60000; // 1 minute

class BrowserPool {
  constructor() {
    this.pool = [];
    this.initPromise = null;
  }

  async init() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      logger.info(`[BROWSER_POOL] Launching ${POOL_SIZE} browsers...`);
      for (let i = 0; i < POOL_SIZE; i++) {
        await this.addInstanceToPool();
      }
      logger.info(`[BROWSER_POOL] ${POOL_SIZE} browsers ready`);
      
      // Start cleanup interval
      setInterval(() => this.cleanupIdle(), 30000);
    })();

    return this.initPromise;
  }

  async addInstanceToPool() {
    try {
      const browser = await chromium.launch({
        headless: true,
        timeout: LAUNCH_TIMEOUT
      });
      this.pool.push({ 
        browser, 
        inUse: false, 
        lastUsedAt: Date.now(),
        isClosing: false 
      });
    } catch (error) {
      logger.error("[BROWSER_POOL] Failed to launch browser", { error: error.message });
      throw error;
    }
  }

  async acquire() {
    await this.init();

    let instance = this.pool.find(b => !b.inUse && !b.isClosing);
    
    if (!instance && this.pool.length < POOL_SIZE * 2) {
      logger.debug("[BROWSER_POOL] No idle browsers, launching new instance...");
      try {
        await this.addInstanceToPool();
        instance = this.pool[this.pool.length - 1];
      } catch (e) {
        // Fallback to waiting if launch fails
      }
    }

    if (instance) {
      instance.inUse = true;
      return instance.browser;
    }

    // Wait and retry if pool is full
    logger.debug("[BROWSER_POOL] Pool full, waiting for available browser...");
    await new Promise(r => setTimeout(r, 1000));
    return this.acquire();
  }

  release(browser) {
    const instance = this.pool.find(b => b.browser === browser);
    if (instance) {
      instance.inUse = false;
      instance.lastUsedAt = Date.now();
    }
  }

  async cleanupIdle() {
    const now = Date.now();
    // Close if idle for longer than IDLE_TIMEOUT
    const toClose = this.pool.filter(b => 
      !b.inUse && 
      !b.isClosing && 
      (now - b.lastUsedAt) > IDLE_TIMEOUT
    );

    if (toClose.length === 0) return;

    for (const instance of toClose) {
      instance.isClosing = true; // Mark to prevent acquisition
      try {
        await instance.browser.close();
        this.pool = this.pool.filter(b => b !== instance);
        logger.info("[BROWSER_POOL] Closed idle browser instance");
      } catch (e) {
        logger.error("[BROWSER_POOL] Failed to close browser", { error: e.message });
        instance.isClosing = false; // Reset if failed
      }
    }
  }

  async closeAll() {
    await Promise.all(this.pool.map(b => b.browser.close().catch(() => {})));
    this.pool = [];
    this.initPromise = null;
  }
}

module.exports = new BrowserPool();