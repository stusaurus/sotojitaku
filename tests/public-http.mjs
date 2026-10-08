// Non-destructive production HTTP and catalog smoke test.
// Requires Node.js 20+; no npm dependencies.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const base = process.env.SOTOJITAKU_BASE || 'https://stusaurus.github.io/sotojitaku/';
const output = 'browser-proof/public';
fs.mkdirSync(output, { recursive: true });
const proof = { checkedAt: new Date().toISOString(), base, checks: [] };
async function check(path, verify) {
  const url = new URL(path, base).href;
  const response = await fetch(url, {signal: AbortSignal.timeout(25000), redirect: 'follow', headers: {'cache-control':'no-cache'}});
  assert.equal(response.status, 200, path + ': HTTP ' + response.status);
  const body = await response.text();
  const details = await verify(body);
  proof.checks.push({ path, status: 'PASS', bytes: body.length, ...details });
  console.log('PASS', path, JSON.stringify(details));
}
async function catalog(path, name) {
  await check(path, async body => {
    const data = JSON.parse(body);
    assert.ok(Array.isArray(data.products), name + ': missing product array');
    const invalid = [], stale = [];
    for (const p of data.products) {
      const item = new URL(p.itemUrl);
      const affiliate = new URL(p.affiliateUrl);
      if (item.hostname !== 'item.rakuten.co.jp' ||
          affiliate.hostname !== 'hb.afl.rakuten.co.jp' ||
          affiliate.searchParams.get('pc')?.replace(/\/$/, '') !== item.href.replace(/\/$/, '')) {
        invalid.push(p.productId || p.itemCode || p.name?.slice(0,50));
      }
      const d = Date.parse(p.verifiedAt);
      if (!Number.isFinite(d) || Date.now() - d > 7 * 86400000) stale.push(p.productId || p.itemCode);
    }
    assert.deepEqual(invalid, [], name + ': invalid/mismatched affiliate destinations');
    assert.ok(data.products.length > 0, name + ': catalog empty');
    return { service: name, catalogCount: data.products.length, status: data.status || 'unknown',
      staleOrUndated: stale.length, invalidAffiliateDestinations: invalid.length };
  });
}
async function main() {
  try {
    for (const [path, name, marker] of [
      ['', 'HOME', 'data-service="fishing"'],
      ['camp/', 'CAMP', 'SOTOJITAKU CAMP'],
      ['car-stay/', 'CAR STAY', 'SOTOJITAKU CAR STAY'],
      ['fishing/', 'FISHING', 'SOTOJITAKU FISHING']
    ]) {
      await check(path, async html => {
        assert.ok(html.includes(marker), name + ': expected markup missing');
        assert.ok(html.includes('G-GFVSZ8YDQ5'), name + ': GA4 integration missing');
        if (name === 'HOME') {
          for (const expected of ['href="camp/"', 'href="car-stay/"', 'href="fishing/"'])
            assert.ok(html.includes(expected), 'HOME: missing ' + expected);
        }
        return { service: name, ga4: true };
      });
    }
    await catalog('data/products.json','CAMP');
    await catalog('car-stay/data/audited-products.json','CAR STAY');
    await catalog('fishing/data/audited-products.json','FISHING');
  } finally {
    fs.writeFileSync(output + '/http-results.json', JSON.stringify(proof,null,2));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
