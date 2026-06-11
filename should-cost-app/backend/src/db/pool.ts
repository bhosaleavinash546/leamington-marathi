import { Pool, types } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// pg returns NUMERIC/BIGINT columns as strings by default; the frontend
// expects numbers (it calls .toFixed() on cost values). Parse them here so
// every endpoint returns real numbers.
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : parseInt(v, 10)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
});

pool.on('error', (err) => {
  console.error('Unexpected idle client error', err);
});

export default pool;
