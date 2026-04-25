const express = require("express");
const path = require("path");
const http = require("http");
const dotenv = require("dotenv");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { httpLogger, logger } = require("./config/logger");
const schemaInit = require("./config/schema");
const { initWebSocket } = require("./config/websocket");
const jobRoutes = require("./routes/job.routes");

// Initialize Environment
dotenv.config();

const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "REDIS_URL",
  "GEMINI_API_KEY"
];

const validateEnv = () => {
  const missing = REQUIRED_ENV_VARS.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
  return true;
};

const app = express();
const server = http.createServer(app);

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Middlewares
const corsOptions = {
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json({ limit: "10kb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later" }
});
app.use("/api", apiLimiter);

app.use(httpLogger);

// Initialize Socket.io
initWebSocket(server);

// Routes
app.use("/api/jobs", jobRoutes);

// Serve Static Frontend
const publicPath = path.join(__dirname, "../public");
app.use(express.static(publicPath));

// Catch-all route for React SPA
app.get("(.*)", (req, res) => {
  if (req.path.startsWith("/api")) return res.status(404).json({ error: "API route not found" });
  res.sendFile(path.join(publicPath, "index.html"));
});

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error("Unhandled Error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal Server Error" });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    validateEnv();

    // 1. Initialize DB Schema (Raw SQL)
    await schemaInit.init();

    // 2. Warmup Browser Pool (skip if playwright not available)
    try {
      const browserPool = require("./utils/browser-pool");
      await browserPool.init();
      logger.info("[APP] Browser pool warmed up");
    } catch (e) {
      logger.warn("[APP] Browser pool skipped:", e.message);
    }

    // 3. Try to start BullMQ Workers (optional - requires Redis)
    try {
      require("./workers/job.worker");
      require("./workers/cleanup.worker");
      
      const jobQueue = require("./queues/jobqueue");
      await jobQueue.scheduleCleanup();
      await jobQueue.scheduleAutomatedScraping();
    } catch (e) {
      logger.warn("[APP] BullMQ skipped (Redis required):", e.message);
    }

    server.listen(PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start server", error);
    process.exit(1);
  }
};

startServer();

const gracefulShutdown = (signal) => {
  logger.info(`${signal} received, shutting down gracefully...`);
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
