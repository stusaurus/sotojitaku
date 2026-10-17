// Run all JS tests except the five live CAMP catalog availability assertions.
// The exclusions are narrow and explicit. CAMP refresh and the daily Growth audit
// continue running the complete npm test suite, so stale or missing CAMP offers
// remain a blocking production-health signal.
import {readFileSync, readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const excluded = [
  'live audited catalog has safe exact links and each listing fits a compatible baseline profile',
  'real catalog covers core profiles and preference choices',
  'family tent preference choices produce distinct top picks',
  'family gear has multiple genuinely eligible purchase choices',
  'all CAMP categories keep meaningful preference diversity',
];
const source = readFileSync('tests/engine.test.mjs', 'utf8');
for (const name of excluded) {
  if (!source.includes("test('" + name + "'")) {
    throw new Error('CAMP isolation contract changed; review exclusion: ' + name);
  }
}
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const skip = '^(?:' + excluded.map(escape).join('|') + ')$';
const files = readdirSync('tests').filter(x=>x.endsWith('.test.mjs')).sort().map(x=>path.join('tests',x));
console.log('Service-specific tests: excluding ONLY ' + excluded.length + ' time-sensitive CAMP catalog assertions.');
console.log('CAMP refresh and Growth audit still run npm test with these assertions enabled.');
const run = spawnSync(process.execPath, ['--test', '--test-skip-pattern=' + skip, ...files], {stdio:'inherit'});
if (run.error) throw run.error;
process.exit(run.status ?? 1);
