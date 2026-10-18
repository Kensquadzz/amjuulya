// Applies migrations/*.sql in order, once each (tracked in schema_migrations).
// Usage: DATABASE_URL=postgres://… npm run db:migrate
// (The deployed site also does this automatically on its first database request.)
import './load-env.mjs';
import { runMigrations } from '../lib/migrate.js';
import { closePool } from '../lib/db.js';

try { await runMigrations(console.log); } catch (e) { console.error(`✗ ${e.message}`); process.exitCode = 1; }
await closePool();
