const Redis = require("ioredis");
require("dotenv").config();

let redisConnection = null;

const getRedisConnection = () => {
  if (redisConnection) return redisConnection;
  
  const redisUrl = process.env.REDIS_URL;
  
  // If no URL or it's a placeholder, use localhost default
  if (!redisUrl || redisUrl.includes("host:port")) {
    console.log("⚠️ REDIS_URL not set or placeholder, using localhost:6379");
    redisConnection = new Redis({
      host: "127.0.0.1",
      port: 6379,
      maxRetriesPerRequest: null,
    });
  } else {
    redisConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
  }

  redisConnection.on("error", (err) => {
    // Suppress repeated connection errors to avoid log spam if redis is down
    // but log the first one or significant ones
  });

  redisConnection.on("connect", () => {
    console.log("🏁 Redis Connected");
  });
  
  return redisConnection;
};

// Export the connection directly to avoid confusion
module.exports = getRedisConnection();

