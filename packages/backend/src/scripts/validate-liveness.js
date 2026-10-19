// Runs the liveness validator once, outside the server.
//
//   node src/scripts/validate-liveness.js            # dry run: check + log, write nothing
//   node src/scripts/validate-liveness.js --apply    # expire dead jobs
//   node src/scripts/validate-liveness.js --apply --force   # also expire platforms the breaker would hold
//   node src/scripts/validate-liveness.js --limit=200
import 'dotenv/config';
import { runValidator } from '../cron/runValidator.js';
import { client } from '../db/connection.js';

const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 0;

await runValidator({ dryRun: !apply, limit, force, source: 'cli' });
await client.close();
process.exit(0);
