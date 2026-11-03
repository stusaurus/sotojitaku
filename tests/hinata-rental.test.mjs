import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HINATA_BUY_CREATIVE, HINATA_RENT_CREATIVE, HINATA_PROGRAMS, renderHinataChoice} from '../assets/a8-hinata-rental.js';

const read = name => readFileSync(new URL('../'+name, import.meta.url), 'utf8');
const buyCode = [
  '<a href="https://px.a8.net/svt/ejp?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL" rel="nofollow">',
  '<img border="0" width="300" height="250" alt="" src="https://www23.a8.net/svt/bgt?aid=261103070370&wid=006&eno=01&mid=s00000022571002027000&mc=1"></a>',
  '<img border="0" width="1" height="1" src="https://www16.a8.net/0.gif?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL" alt="">'
].join('\n');
const rentCode = [
  '<a href="https://px.a8.net/svt/ejp?a8mat=4BGCF2+64VY2I+4U5Q+62ENL" rel="nofollow">',
  '<img border="0" width="600" height="500" alt="" src="https://www24.a8.net/svt/bgt?aid=261103070371&wid=006&eno=01&mid=s00000022571001019000&mc=1"></a>',
  '<img border="0" width="1" height="1" src="https://www16.a8.net/0.gif?a8mat=4BGCF2+64VY2I+4U5Q+62ENL" alt="">'
].join('\n');

test('original 300x250 is BUY, new 600x500 is RENT, both A8 creatives byte-for-byte intact', () => {
  assert.equal(HINATA_BUY_CREATIVE, buyCode);
  assert.equal(HINATA_RENT_CREATIVE, rentCode);
  assert.equal(HINATA_PROGRAMS.buy,'hinata_purchase');
  assert.equal(HINATA_PROGRAMS.rent,'hinata_rental');
  for(const ad of [HINATA_BUY_CREATIVE,HINATA_RENT_CREATIVE]){
    assert.equal(ad.match(/<a /g)?.length,1);
    assert.equal(ad.match(/<img /g)?.length,2);
    assert.match(ad,/rel="nofollow"/);
    assert.doesNotMatch(ad,/target="_blank"/);
  }
});

test('buy and rent decisions show only their matching, fully disclosed A8 creative', () => {
  const gears=[{id:'tent',status:'buy'},{id:'mat',status:'owned'}, {id:'sleeping_bag',status:'rent'}];
  const bought=renderHinataChoice(gears,'buy','gear');
  const rented=renderHinataChoice(gears,'rent','gear');
  assert.ok(bought.includes(buyCode));
  assert.ok(!bought.includes(rentCode));
  assert.ok(rented.includes(rentCode));
  assert.ok(!rented.includes(buyCode));
  assert.ok(bought.includes('data-hinata-choice="buy"'));
  assert.ok(rented.includes('data-hinata-choice="rent"'));
  for (const ad of [bought,rented]) {
    assert.match(ad,/広告｜A8.netアフィリエイト/);
    assert.match(ad,/成果報酬が発生する場合があります/);
    assert.match(ad,/計画用の目安/);
    assert.match(ad,/同じ仕様|診断|契約/);
    assert.equal(ad.match(/<a href="https:\/\/px.a8.net/g)?.length,1);
  }
  assert.match(bought,/購入先/);
  assert.match(rented,/レンタル先/);
  assert.ok(!bought.includes('購入より安いこと'));
  assert.ok(rented.includes('購入より安いこと'));
});

test('no ad if its matching status is absent; bad placement or status fails closed', () => {
  const gears=[{status:'buy'},{status:'owned'},{status:'skip'}];
  assert.equal(renderHinataChoice(gears,'rent'), '');
  assert.equal(renderHinataChoice([], 'buy'), '');
  assert.equal(renderHinataChoice(null, 'buy'), '');
  assert.ok(renderHinataChoice(gears,'buy','missing').includes('data-hinata-placement="missing"'));
  assert.throws(()=>renderHinataChoice(gears,'unknown'));
  assert.throws(()=>renderHinataChoice(gears,'rent','bogus'));
});

test('CAMP UI presents matching ads on gear and buy/rent list tabs; tracks them separately', () => {
  for(const file of ['app.js','camp/app.js']){
    const app=read(file);
    assert.ok(app.includes('renderHinataChoice'),file);
    assert.ok(app.includes("plan(state,data).some(g=>g.status==='rent')?'rent':'buy'"),file);
    assert.ok(app.includes("['buy','rent'].includes(gearTab)?renderHinataChoice(p,gearTab,'missing'):''"),file);
    assert.ok(app.includes("program:kind==='buy'?'hinata_purchase':'hinata_rental'"),file);
    assert.ok(app.includes("conversion_source:kind==='buy'?'camp_gear_buy':'camp_gear_rental'"),file);
    assert.ok(app.includes("ad_creative:kind==='buy'?'banner_300x250':'banner_600x500'"),file);
    assert.ok(app.includes("if(t.dataset.affiliate){track('affiliate_click',{affiliate:'rakuten'"),file);
    assert.ok(app.includes("operator_test:operator?'1':'0'"),file);
  }
  assert.ok(read('style.css').includes('.hinata-choice-banner--rent>a{width:600px}'));
});
