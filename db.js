// Neon Postgres Database Connection Pool and Query Utilities
import 'dotenv/config';
import pg from 'pg';

const { Pool, types } = pg;

// Automatically parse Postgres NUMERIC / DECIMAL (type ID 1700) into JavaScript numbers
types.setTypeParser(1700, val => val === null ? null : parseFloat(val));

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('⚠️ DATABASE_URL is not defined in environment! Database queries will fail.');
}

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: false
});

pool.on('error', (err) => {
  console.warn('Postgres connection pool note (handled):', err?.message || err);
});

pool.on('connect', (client) => {
  client.on('error', (err) => {
    console.warn('Postgres client note (handled):', err?.message || err);
  });
});

export async function query(text, params, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await pool.query(text, params);
      return res;
    } catch (err) {
      const isConnErr = err.code === 'ECONNRESET' ||
        err.message?.includes('Connection terminated') ||
        err.message?.includes('timeout') ||
        err.message?.includes('closed');
      if (isConnErr && attempt < retries) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

export async function getClient() {
  const client = await pool.connect();
  client.on('error', (err) => {
    console.warn('Client connection note (handled):', err?.message || err);
  });
  return client;
}
