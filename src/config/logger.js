const winston = require("winston");
const morgan = require("morgan");
require("dotenv").config();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, stack }) => {
          return `[${timestamp}] ${level}: ${message}${stack ? "\n" + stack : ""}`;
        }),
      ),
    }),
  ],
});

const httpLogger = morgan("dev", {
  stream: { write: (message) => logger.http(message.trim()) },
});

module.exports = { logger, httpLogger };
