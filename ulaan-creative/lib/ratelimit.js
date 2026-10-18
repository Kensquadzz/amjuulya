// Database-backed sliding-window rate limiting. Serverless instances don't
// share memory, so counts live in Postgres (table: rate_events).
import { query, one } from './db.js';

export async function hit(bucket, key, { limit, windowSec }) {
  const row = await one(
    `select count(*)::int as n from rate_events where bucket = $1 and key = $2 and created_at > now() - make_interval(secs => $3)`,
    [bucket, key, windowSec],
  );
  if (row.n >= limit) return { allowed: false, count: row.n };
  await query('insert into rate_events (bucket, key) values ($1, $2)', [bucket, key]);
  // Opportunistic cleanup of old events (cheap, indexed).
  if (Math.random() < 0.05) await query(`delete from rate_events where created_at < now() - interval '2 days'`);
  return { allowed: true, count: row.n + 1 };
}

export async function count(bucket, key, windowSec) {
  const row = await one(
    `select count(*)::int as n from rate_events where bucket = $1 and key = $2 and created_at > now() - make_interval(secs => $3)`,
    [bucket, key, windowSec],
  );
  return row.n;
}

export async function clear(bucket, key) {
  await query('delete from rate_events where bucket = $1 and key = $2', [bucket, key]);
}
