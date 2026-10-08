import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('SOTOJITAKU root is ready for URL-prefix Search Console verification via GA',()=>{
  const html=read('index.html');
  const app=read('app.js');
  const robots=read('robots.txt');
  assert.match(html,/googletagmanager\.com\/gtag\/js\?id=G-6STQ5HXRDH/);
  assert.match(html,/gtag\('config','G-6STQ5HXRDH'/);
  assert.match(html,/send_page_view:true/);
  assert.match(app,/querySelector\('script\[src\*=/);
  assert.match(robots,/Sitemap: https:\/\/stusaurus\.github\.io\/sotojitaku\/sitemap\.xml/);
});

test('CAR STAY remains discoverable from the static root navigation',()=>{
  const html=read('index.html');
  assert.match(html,/href="car-stay\/"/);
  assert.match(html,/data-service="car_stay"/);
});


test('CAR STAY has a dedicated sitemap discoverable from robots',()=>{
  const robots=read('robots.txt');
  const sitemap=read('car-stay/sitemap.xml');
  assert.match(robots,/Sitemap: https:\/\/stusaurus\.github\.io\/sotojitaku\/car-stay\/sitemap\.xml/);
  const urls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
  const rootSitemap=read('sitemap.xml');
  const rootCarStay=[...rootSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]).filter(url=>url.includes('/car-stay/'));
  assert.deepEqual(urls,rootCarStay);
  assert.ok(urls.length>=27);
  assert.ok(urls.every(url=>url.startsWith('https://stusaurus.github.io/sotojitaku/car-stay/')));
  assert.ok(urls.every(url=>!url.includes('?')));
});
