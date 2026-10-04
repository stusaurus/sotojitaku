import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const slugs=['beginner','gear','budget','family','tent','sleeping-bag','bbq','bonfire','breakfast','cooking'];
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('guide hub and search entry pages are substantive and indexable',()=>{const sitemap=read('sitemap.xml'),hub=read('guides/index.html');assert.match(hub,/キャンプ初心者の準備ガイド/);for(const slug of slugs){const p=read('guides/'+slug+'/index.html');assert.ok(p.length>3500,slug+' should not be thin');assert.match(p,/rel="canonical"/);assert.match(p,/data-guide-cta/);assert.ok(!/TODO|ダミー|lorem ipsum/i.test(p));assert.ok(sitemap.includes('/guides/'+slug+'/'));}});
test('refresh deployment includes guide directory',()=>{assert.match(read('.github/workflows/refresh-products.yml'),/cp -r assets data guides public\//);});
