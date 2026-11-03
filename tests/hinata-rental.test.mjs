import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HINATA_A8_CREATIVE, HINATA_PROGRAM, renderHinataRental} from '../assets/a8-hinata-rental.js';

const root = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const original = [
  '<a href="https://px.a8.net/svt/ejp?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL" rel="nofollow">',
  '<img border="0" width="300" height="250" alt="" src="https://www23.a8.net/svt/bgt?aid=261103070370&wid=006&eno=01&mid=s00000022571002027000&mc=1"></a>',
  '<img border="0" width="1" height="1" src="https://www16.a8.net/0.gif?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL" alt="">'
].join('\n');

test('provided A8 hinata banner, outbound link, and 1x1 pixel are unmodified', () => {
  assert.equal(HINATA_PROGRAM, 'hinata_rental');
  assert.equal(HINATA_A8_CREATIVE, original);
  assert.equal(HINATA_A8_CREATIVE.match(/<a /g)?.length, 1);
  assert.equal(HINATA_A8_CREATIVE.match(/<img /g)?.length, 2);
  assert.ok(!HINATA_A8_CREATIVE.includes('target="_blank"'));
});

test('rental advertising appears only after selecting rent for at least one gear type', () => {
  const ownedAndBuy = [{id:'tent', status:'owned'}, {id:'mat', status:'buy'}, {id:'chair', status:'skip'}];
  assert.equal(renderHinataRental([]), '');
  assert.equal(renderHinataRental(undefined), '');
  assert.equal(renderHinataRental(ownedAndBuy, 'gear'), '');
  assert.equal(renderHinataRental(ownedAndBuy, 'missing'), '');
  const rented = [...ownedAndBuy, {id:'sleeping_bag', status:'rent'}];
  const ad = renderHinataRental(rented, 'gear');
  assert.ok(ad.includes(original));
  assert.equal(ad.match(/<a href="https:\/\/px.a8.net/g)?.length,1);
  assert.ok(ad.includes('借りる'));
  assert.ok(ad.includes('1種類'));
  assert.ok(ad.includes('広告｜A8.netアフィリエイト'));
  assert.ok(ad.includes('data-hinata-placement="gear"'));
  assert.ok(ad.includes('商品代金＋配送代金（送料・手数料）＋補償料'));
  assert.ok(ad.includes('レンタルの見積額ではありません'));
  assert.ok(!ad.includes('必ず安い'));
  assert.ok(!ad.includes('在庫を確保しました'));
});

test('missing gear rent tab displays the same single original banner and never alters ranking', () => {
  const p=[{id:'tent',status:'rent'}, {id:'mat',status:'rent'}, {id:'cooler',status:'buy'}];
  const ad=renderHinataRental(p,'missing');
  assert.equal(ad.split(original).length-1,1);
  assert.ok(ad.includes('2種類'));
  assert.ok(ad.includes('data-hinata-placement="missing"'));
  assert.throws(()=>renderHinataRental(p,'unknown'));
  for (const file of ['app.js','camp/app.js']) {
    const app=root(file);
    assert.ok(app.includes("renderHinataRental(plan(state,data),'gear')"),file);
    assert.ok(app.includes("gearTab==='rent'?renderHinataRental(p,'missing'):''"),file);
    assert.ok(app.includes("if(t.matches('[data-hinata-rental] a[href^="),file);
    assert.ok(app.includes("track('affiliate_click',{affiliate:'a8',merchant:'hinata_rental'"),file);
    assert.ok(app.includes("ad_creative:'banner_300x250'"),file);
    assert.ok(app.includes('aria-label'),file);
  }
});

test('banner remains distinct from audited Rakuten products and existing privacy filters', () => {
  const app=root('camp/app.js');
  assert.ok(app.includes("if(t.dataset.affiliate){track('affiliate_click',{affiliate:'rakuten'"));
  assert.ok(app.includes("operator_test:operator?'1':'0'"));
  assert.ok(root('assets/a8-hinata-rental.js').includes('広告リンクから予約した場合')===false); // uses explicit compensation phrasing
  assert.ok(root('assets/a8-hinata-rental.js').includes('成果報酬が発生することがあります'));
  assert.ok(root('style.css').includes('.hinata-rental-card'));
  assert.ok(root('assets/a8-hinata-rental.js').includes('利用日・受取場所・対象商品・在庫'));
});
