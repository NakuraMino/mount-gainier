// Admin CLI to add (or reset) an account. Account creation is intentionally not
// exposed publicly — run this on the server.
//
//   npm run create-user -- <username> <password> [admin]
//
// e.g.  npm run create-user -- alex hunter2
//       npm run create-user -- coach s3cret admin
//
// New accounts start with an empty exercise library (they add their own, or you
// can adapt scripts/seed.mjs to stock one).
import { createAccount } from '../server/auth.mjs';

const [, , username, password, flag] = process.argv;
if (!username || !password) {
  console.error('usage: npm run create-user -- <username> <password> [admin]');
  process.exit(1);
}
const isAdmin = flag === 'admin' || flag === '--admin';

createAccount({ username, password, isAdmin })
  .then((u) => {
    console.log(`[create-user] ${u.username}${isAdmin ? ' (admin)' : ''} ready. Log in with username "${u.username}".`);
    process.exit(0);
  })
  .catch((e) => {
    console.error('[create-user] failed:', e.message);
    process.exit(1);
  });
