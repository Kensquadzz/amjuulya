// Creates an admin user, or resets the password of an existing one.
// There is no default account. Usage:
//   npm run admin:create -- --email owner@example.com
// The password is asked interactively (hidden). For automation only, it can be
// passed via the ADMIN_PASSWORD environment variable — never commit it.
import readline from 'node:readline';
import './load-env.mjs';
import { query, closePool } from '../lib/db.js';
import { hashPassword, validatePasswordStrength } from '../lib/auth.js';

const args = process.argv.slice(2);
const email = (args[args.indexOf('--email') + 1] || '').trim().toLowerCase();
if (!args.includes('--email') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: npm run admin:create -- --email you@example.com');
  process.exit(1);
}

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(prompt)) rl.output.write(s); };
    rl.question(prompt, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

let password = process.env.ADMIN_PASSWORD;
if (!password) {
  password = await askHidden('Password (min 12 chars, letters + digits): ');
  const again = await askHidden('Repeat password: ');
  if (password !== again) { console.error('Passwords do not match.'); process.exit(1); }
}
const problem = validatePasswordStrength(password);
if (problem) { console.error(problem); process.exit(1); }

const hash = await hashPassword(password);
const { rows } = await query(
  `insert into admin_users (email, password_hash) values ($1, $2)
   on conflict (email) do update set password_hash = excluded.password_hash, updated_at = now()
   returning (xmax = 0) as created`, [email, hash]);
await query('delete from admin_sessions where user_id = (select id from admin_users where email = $1)', [email]);
console.log(rows[0].created ? `Admin created: ${email}` : `Password reset for: ${email} (all sessions signed out)`);
await closePool();
