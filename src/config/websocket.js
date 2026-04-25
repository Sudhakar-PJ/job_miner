const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const redisModule = require("./redis");
const { logger } = require("./logger");

let io;

/**
 * Initialize Socket.io with Redis Adapter
 */
const initWebSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN
        ? [process.env.CORS_ORIGIN]
        : ["http://localhost:5173", "http://127.0.0.1:5173"],
      credentials: true,
    },
    transports: ["polling", "websocket"],
  });

  // Redis Adapter for scaling/broadcasting
  const redisClient = redisModule.getRedisConnection?.();
  if (redisClient) {
    try {
      const pubClient = redisClient;
      const subClient = redisClient.duplicate();
      io.adapter(createAdapter(pubClient, subClient));
    } catch (e) {
      logger.warn("[SOCKET] Redis adapter skipped:", e.message);
    }
  }

  io.on("connection", (socket) => {
    logger.info(`[SOCKET] New client connected: ${socket.id}`);

    socket.on("disconnect", () => {
      logger.info(`[SOCKET] Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

/**
 * Global accessor for broadcasting from services/workers
 */
const getIO = () => {
  if (!io) {
    return { emit: () => {}, to: () => ({ emit: () => {} }) };
  }
  return io;
};

module.exports = { initWebSocket, getIO };
