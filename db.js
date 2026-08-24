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
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
});

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  return res;
}

export async function getClient() {
  return await pool.connect();
}
