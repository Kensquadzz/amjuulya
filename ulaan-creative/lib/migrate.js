// Applies pending migrations (lib/migrations.js, generated from migrations/*.sql) once each,
// tracked in schema_migrations. Used by `npm run db:migrate` and automatically on the first
// database request of each server instance, so a fresh database (e.g. Neon created from the
// Vercel dashboard) needs no terminal step.
// Works through connection poolers (Neon/PgBouncer transaction mode): the lock is a
// transaction-scoped advisory lock and all pending migrations run in one transaction.
import { getPool, dbConfigured } from './db.js';
import { MIGRATIONS } from './migrations.js';

const LOCK = 742002;

export async function runMigrations(log = () => {}) {
  const pool = getPool();
  await pool.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const pending = async (q) => {
    const done = new Set((await q.query('select name from schema_migrations')).rows.map((r) => r.name));
    MIGRATIONS.forEach((m) => { if (done.has(m.name)) log(`✓ ${m.name} (already applied)`); });
    return MIGRATIONS.filter((m) => !done.has(m.name));
  };
  if (!(await pending(pool)).length) return []; // common case: nothing to do, no lock needed
  const client = await pool.connect();
  const applied = [];
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1)', [LOCK]); // another instance may be migrating
    for (const m of await pending(client)) {
      try { await client.query(m.sql); } catch (e) { throw new Error(`${m.name}: ${e.message}`); }
      await client.query('insert into schema_migrations (name) values ($1)', [m.name]);
      applied.push(m.name); log(`+ ${m.name} applied`);
    }
    await client.query('commit');
    return applied;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

let ready = null;
let lastError = null;
/** Runs pending migrations once per instance; retried on the next request if it failed. */
export function ensureMigrated() {
  if (!dbConfigured()) return Promise.resolve();
  if (!ready) {
    ready = runMigrations().then((a) => { lastError = null; if (a.length) console.log('[db] migrations applied:', a.join(', ')); })
      .catch((e) => { ready = null; lastError = e; console.error('[db] migration failed:', e.message); throw e; });
  }
  return ready;
}
export const migrationError = () => lastError;
