// Applies migrations/*.sql in order, once each (tracked in schema_migrations).
// Usage: DATABASE_URL=postgres://… npm run db:migrate
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './load-env.mjs';
import { getPool, closePool } from '../lib/db.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
const pool = getPool();
await pool.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
const done = new Set((await pool.query('select name from schema_migrations')).rows.map((r) => r.name));
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
for (const f of files) {
  if (done.has(f)) { console.log(`✓ ${f} (already applied)`); continue; }
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(readFileSync(path.join(dir, f), 'utf8'));
    await client.query('insert into schema_migrations (name) values ($1)', [f]);
    await client.query('commit');
    console.log(`+ ${f} applied`);
  } catch (e) {
    await client.query('rollback');
    console.error(`✗ ${f} failed: ${e.message}`);
    process.exitCode = 1;
    break;
  } finally { client.release(); }
}
await closePool();
