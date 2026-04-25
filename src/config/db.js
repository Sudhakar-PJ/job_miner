const { Pool } = require("pg");
require("dotenv").config();

class Database {
  constructor() {
    const connectionString = process.env.DATABASE_URL;

    this.pool = new Pool({
      connectionString,
      ssl: connectionString
        ? { rejectUnauthorized: false } // required for Neon
        : false,

      // fallback (local dev)
      ...(!connectionString && {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
      }),
    });

    this.pool.on("connect", () => {
      console.log("🐘 Postgres Pool Connected");
    });

    this.pool.on("error", (err) => {
      console.error("Unexpected Postgres error", err);
      process.exit(-1);
    });
  }

  async query(text, params) {
    return this.pool.query(text, params);
  }

  async getClient() {
    return this.pool.connect();
  }
}

module.exports = new Database();