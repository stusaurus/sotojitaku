import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const pages=['camp-guide/index.html','camp-guide/budget/index.html','camp-guide/family/index.html','camp-guide/sleep/index.html','camp-guide/cooking/index.html','camp-guide/bonfire/index.html'];
test('SEO guide pages are substantive and canonical',()=>{for(const p of pages){const s=fs.readFileSync(p,'utf8');assert.match(s,/<link rel="canonical"/);assert.match(s,/<meta name="description"/);assert.match(s,/application\/ld\+json/);assert.ok(s.length>2500, p+' should not be thin');assert.match(s,/キャンプをつくる/);}});
test('sitemap lists every guide',()=>{const map=fs.readFileSync('sitemap.xml','utf8');for(const p of pages){const route=p.replace(/index\.html$/,'');assert.ok(map.includes('https://stusaurus.github.io/sotojitaku/'+route), route);}});
test('product refresh deployment retains guides',()=>{const wf=fs.readFileSync('.github/workflows/refresh-products.yml','utf8');assert.match(wf,/cp -r assets data camp-guide public\//);});
