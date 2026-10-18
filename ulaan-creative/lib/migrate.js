// Applies migrations/*.sql once each (tracked in schema_migrations). Used by `npm run db:migrate`
// and automatically on the first database request of each server instance, so a fresh
// database (e.g. Neon created from the Vercel dashboard) needs no terminal step.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getPool, dbConfigured } from './db.js';

const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
const LOCK = 742001; // pg advisory lock id: only one instance migrates at a time

export async function runMigrations(log = () => {}) {
  const client = await getPool().connect();
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK]);
    await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await client.query('select name from schema_migrations')).rows.map((r) => r.name));
    const applied = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      if (done.has(f)) { log(`✓ ${f} (already applied)`); continue; }
      try {
        await client.query('begin');
        await client.query(readFileSync(dir + f, 'utf8'));
        await client.query('insert into schema_migrations (name) values ($1)', [f]);
        await client.query('commit');
        applied.push(f); log(`+ ${f} applied`);
      } catch (e) {
        await client.query('rollback').catch(() => {});
        throw new Error(`${f}: ${e.message}`);
      }
    }
    return applied;
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK]).catch(() => {});
    client.release();
  }
}

let ready = null;
/** Runs pending migrations once per instance; retried on the next request if it failed. */
export function ensureMigrated() {
  if (!dbConfigured()) return Promise.resolve();
  if (!ready) {
    ready = runMigrations().then((a) => { if (a.length) console.log('[db] migrations applied:', a.join(', ')); })
      .catch((e) => { ready = null; console.error('[db] migration failed:', e.message); throw e; });
  }
  return ready;
}
