// PostgreSQL access. One small pool per serverless instance; all queries are
// parameterised ($1, $2 …) — never build SQL from user input.
import pg from 'pg';

let pool = null;

export const dbConfigured = () => Boolean(process.env.DATABASE_URL);

export function getPool() {
  if (!dbConfigured()) {
    const err = new Error('DATABASE_URL is not configured');
    err.code = 'DB_NOT_CONFIGURED';
    throw err;
  }
  if (!pool) {
    const url = process.env.DATABASE_URL;
    const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
    pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX) || 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      // Managed Postgres (Neon, Supabase, RDS …) requires TLS.
      ssl: local || process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: process.env.DATABASE_SSL_STRICT !== 'false' },
    });
    pool.on('error', (e) => console.error('[db] idle client error', e.message));
  }
  return pool;
}

export async function query(text, params = []) {
  return getPool().query(text, params);
}

export async function one(text, params = []) {
  const { rows } = await query(text, params);
  return rows[0] || null;
}

export async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) { await pool.end(); pool = null; }
}
