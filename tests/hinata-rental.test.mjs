import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HINATA_A8_HTML, HINATA_A8_URL, renderHinataRentalCard } from '../camp/hinata-rental.js';

const creative = '<a href="https://px.a8.net/svt/ejp?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL" rel="nofollow">\n'
  + '<img border="0" width="300" height="250" alt="" src="https://www23.a8.net/svt/bgt?aid=261103070370&wid=006&eno=01&mid=s00000022571002027000&mc=1"></a>\n'
  + '<img border="0" width="1" height="1" src="https://www16.a8.net/0.gif?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL" alt="">';

test('hinata campaign source HTML is preserved exactly, including 300x250 artwork and 1x1 impression pixel', () => {
  assert.equal(HINATA_A8_HTML, creative);
  assert.equal(HINATA_A8_URL, 'https://px.a8.net/svt/ejp?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL');
  assert.equal(creative.match(/href="https:\/\/px.a8.net\//g)?.length, 1);
  assert.equal(creative.match(/\/0.gif\?/g)?.length, 1);
  assert.equal(creative.match(/width="300" height="250"/g)?.length, 1);
});

test('ad appears only for user-selected rental equipment and never guarantees price or availability', () => {
  assert.equal(renderHinataRentalCard([]), '');
  assert.equal(renderHinataRentalCard(undefined), '');
  const banner = renderHinataRentalCard([{id:'tent', status:'rent'}]);
  assert.equal(banner.includes(creative), true);
  assert.match(banner, /広告｜A8.netアフィリエイト/);
  assert.match(banner, /1種類の道具を「借りる」/);
  assert.match(banner, /計画用概算/);
  assert.match(banner, /在庫や貸出・配送可能性を保証しません/);
  assert.ok(!banner.includes('最安値'));
  const twice = renderHinataRentalCard([{id:'tent'}, {id:'mat'}]);
  assert.match(twice, /2種類の道具を「借りる」/);
  assert.equal(twice.split(HINATA_A8_URL).length - 1, 1);
});

test('CAMP routes preserve existing gear planning and differentiate A8 from Rakuten clicks', () => {
  const app = fs.readFileSync(new URL('../camp/app.js', import.meta.url), 'utf8');
  assert.match(app, /import \{renderHinataRentalCard,HINATA_A8_URL\} from '\.\/hinata-rental\.js/);
  assert.match(app, /function rentalOffer\(\)\{return renderHinataRentalCard\(plan\(state,data\)\.filter\(g=>g\.status==='rent'\)\)/);
  assert.equal(app.split('$' + '{rentalOffer()}').length - 1, 2);
  assert.match(app, /t\.closest\('#hinata-rental-ad'\)/);
  assert.match(app, /program:'hinata_rental'/);
  assert.match(app, /category_id:'camp_rental'/);
  assert.match(app, /conversion_source:'camp_rental_plan'/);
  assert.match(app, /hinataLink\.setAttribute\('aria-label'/);
  assert.ok(!app.includes('data-affiliate="hinata_rental"'));
});

test('cache fingerprint and CAMP module syntax are part of shipping checks', () => {
  const stamp = fs.readFileSync(new URL('../scripts/stamp_assets.py', import.meta.url), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(stamp, /version\('camp\/hinata-rental\.js'\)/);
  assert.match(pkg.scripts.check, /camp\/hinata-rental\.js/);
});
