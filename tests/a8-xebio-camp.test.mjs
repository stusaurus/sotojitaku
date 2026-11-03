import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderXebioAd} from '../assets/a8-xebio-camp.js';

const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html = renderXebioAd();
const url = 'https://px.a8.net/svt/ejp?a8mat=4BGCF2+AM8F0A+4ABU+6J4I9';
const image = 'https://www24.a8.net/svt/bgt?aid=261103070642&wid=006&eno=01&mid=s00000020001001097000&mc=1';
const pixel = 'https://www19.a8.net/0.gif?a8mat=4BGCF2+AM8F0A+4ABU+6J4I9';

test('Xebio 728x90 campaign preserves the original A8 destination, creative, and 1x1 beacon', () => {
  assert.equal(html.split(url).length-1,1);
  assert.equal(html.split(image).length-1,1);
  assert.equal(html.split(pixel).length-1,1);
  assert.match(html, /width="728" height="90" alt="" src="https:\/\/www24\.a8\.net\/svt\/bgt\?/);
  assert.match(html, /width="1" height="1" src="https:\/\/www19\.a8\.net\/0\.gif/);
  assert.match(html, /rel="nofollow"/);
});

test('Xebio remains a sponsored store alternative, never a verified ranking or an assumed cheapest vendor', () => {
  assert.match(html,/広告｜A8\.netアフィリエイト/);
  assert.match(html,/おすすめ順位や楽天の価格比較には影響しません/);
  assert.match(html,/送料はリンク先で確認/);
  assert.equal((html.match(/<a /g)||[]).length,1);
  for(const word of ['最安値を保証','送料無料です','定価より安い'])assert.equal(html.includes(word),false);
  const app=read('camp/app.js');
  const storeStart=app.indexOf('function store(){');
  const productsStart=app.indexOf('\nfunction productPreference',storeStart);
  assert.ok(storeStart>=0 && productsStart>storeStart);
  assert.ok(app.slice(storeStart,productsStart).includes('${renderXebioAd()}'));
  assert.equal(app.split('${renderXebioAd()}').length-1,1);
  assert.ok(!read('car-stay/index.html').includes('4BGCF2+AM8F0A'));
  assert.ok(!read('fishing/index.html').includes('4BGCF2+AM8F0A'));
});

test('Xebio clicks use existing opted-out and operator-test-aware GA4 path',()=>{
  const app=read('camp/app.js');
  assert.match(app,/track\('affiliate_click',\{affiliate:'a8',program:'super_sports_xebio'/);
  assert.match(app,/ad_creative:'banner_728x90'/);
  assert.match(app,/conversion_source:'camp_store_browse'/);
  assert.match(app,/function track\(name,params=\{\}\)\{if\(analyticsDisabled\(\)\)return;/);
  assert.match(app,/operator_test:operator\?'1':'0'/);
});

test('Xebio wide banner scales within mobile viewports and does not change app entry/SEO canonical',()=>{
  const css=read('assets/a8-xebio-camp.css');
  const landing=read('camp/index.html');
  assert.match(css,/max-width:728px/);
  assert.match(css,/max-width:100%/);
  assert.match(css,/height:auto/);
  assert.ok(landing.includes('a8-xebio-camp.css'));
  assert.ok(landing.includes('https://stusaurus.github.io/sotojitaku/camp/'));
  assert.ok(landing.includes('app.js?v='));
});
