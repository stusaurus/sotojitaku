import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('SOTOJITAKU root is ready for URL-prefix Search Console verification via GA',()=>{
  const html=read('index.html');
  const app=read('app.js');
  const robots=read('robots.txt');
  assert.match(html,/googletagmanager\.com\/gtag\/js\?id=G-GFVSZ8YDQ5/);
  assert.match(html,/gtag\('config','G-GFVSZ8YDQ5'/);
  assert.match(html,/send_page_view:false/);
  assert.match(app,/querySelector\('script\[src\*=/);
  assert.match(robots,/Sitemap: https:\/\/stusaurus\.github\.io\/sotojitaku\/sitemap\.xml/);
});

test('CAR STAY remains discoverable from the static root navigation',()=>{
  const html=read('index.html');
  assert.match(html,/href="car-stay\/"/);
  assert.match(html,/CAR STAY｜車中泊をつくる/);
});
