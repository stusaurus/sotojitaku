import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compareModels,verifiedSpecs,yen} from '../camp/compare-products.js';

const maker='https://example.org/maker/model';
const offered=(id='A',family='family-a',patch={})=>({
 itemCode:'seller:'+id,
 name:'検証専用 キャンプマット '+id,
 family,price:4500,units:2,totalPrice:999999,
 spec:{weight:1800,length:180,width:60},
 evidence:{specification:maker,fields:{weight:maker,length:maker,width:maker}},
 matchReasons:['2人分をそろえられる寝床','持ち運びを優先'],
 ...patch,
});
test('comparison uses exact units times actual offer price, never a fabricated total',()=>{
 const m=compareModels([offered()], 'mat',{targetBudget:7000});
 assert.equal(m.count,1);
 assert.equal(m.rows[0].units,2);
 assert.equal(m.rows[0].unitPrice,4500);
 assert.equal(m.rows[0].totalPrice,9000);
 assert.equal(m.rows[0].difference,2000);
 assert.equal(yen(m.rows[0].totalPrice),'¥9,000');
 assert.equal(m.fields.length,0,'one product is not claimed to be side-by-side');
});
test('separate verified family rows produce a true comparison with shared evidence',()=>{
 const b=offered('B','family-b',{price:3800,units:2,
  spec:{weight:1200,length:187,width:63},
  evidence:{specification:maker,fields:{weight:maker,length:maker}}});
 const m=compareModels([offered(),b],'mat',{targetBudget:8000});
 assert.equal(m.count,2);
 assert.deepEqual(m.fields,['length','weight']);
 assert.equal(m.rows[0].totalPrice,9000);
 assert.equal(m.rows[1].totalPrice,7600);
 assert.equal(m.rows[0].difference,1000);
 assert.equal(m.rows[1].difference,-400);
 assert.equal(m.rows[0].specs.find(x=>x.key==='weight').value,'1.8kg');
 assert.equal(m.rows[1].specs.find(x=>x.key==='weight').value,'1.2kg');
});
test('same product family from different shops never becomes a second choice',()=>{
 const m=compareModels([offered(),offered('B','family-a')],'mat');
 assert.equal(m.count,1);
 assert.equal(m.rows[0].itemCode,'seller:A');
 assert.deepEqual(m.fields,[]);
});
test('unknown or unproved manufacturer details are omitted rather than guessed',()=>{
 const bad=offered('A','family-a',{spec:{weight:1200,length:190,width:65},
  evidence:{specification:maker,fields:{length:maker,weight:'',width:'javascript:evil()'}}});
 const specs=verifiedSpecs(bad,'mat');
 assert.deepEqual(specs.map(x=>x.key),['length']);
 assert.equal(specs[0].value,'190cm');
 const unprovedFire={spec:{capacity:4,weight:5000},
  evidence:{specification:maker,fields:{capacity:maker,weight:maker}}};
 assert.deepEqual(verifiedSpecs(unprovedFire,'fire_pit').map(x=>x.key),['weight']);
});
test('manufacturer-stated group capacity is only shown when proof aligns with model',()=>{
 const fire={spec:{capacity:4,weight:5500},
  evidence:{specification:maker,fields:{capacity:maker,weight:maker}},
  familyCapacityEvidence:{basis:'manufacturer_explicit_person_count',maxPeople:4,source:maker}};
 assert.equal(verifiedSpecs(fire,'fire_pit')[0].value,'4人');
 fire.familyCapacityEvidence.maxPeople=5;
 assert.equal(verifiedSpecs(fire,'fire_pit').some(s=>s.key==='capacity'),false);
});
test('missing, nonsensical or out-of-bound prices and quantities never create comparison cards',()=>{
 for(const changed of [
  {price:0},{price:NaN},{units:0},{units:21},{units:1.5},{family:''},
 ]){
  assert.equal(compareModels([offered('A','family-a',changed)],'mat').count,0);
 }
 assert.equal(compareModels([], 'mat').count,0);
 assert.equal(yen(NaN),null);
 assert.equal(yen(-1),null);
});
test('comparison is capped at three real product families',()=>{
 const rows=Array.from({length:7},(_,i)=>offered(String(i),String(i)));
 const m=compareModels(rows,'mat');
 assert.equal(m.count,3);
 assert.equal(new Set(m.rows.map(r=>r.itemCode)).size,3);
});
test('comparison thumbnail only accepts the exact trusted Rakuten image host',()=>{
 const good='https://thumbnail.image.rakuten.co.jp/campaign/photo.jpg';
 assert.equal(compareModels([offered('A','family-a',{image:good})],'mat').rows[0].image,good);
 for(const bad of [
  'https://thumbnail.image.rakuten.co.jp.evil.example/fake.jpg',
  'http://thumbnail.image.rakuten.co.jp/insecure.jpg',
  'javascript:alert(1)',null
 ])assert.equal(compareModels([offered('A','family-a',{image:bad})],'mat').rows[0].image,null);
});

test('mobile page prioritizes quick comparison, collapses advanced details and adds one-tap shopping',()=>{
 const source=fs.readFileSync(new URL('../camp/app.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../style.css',import.meta.url),'utf8');
 assert.match(source,/id="camp-product-details"/);
 assert.match(source,/id="preference-adjustment"/);
 assert.match(source,/class="compare-to-list"/);
 assert.match(source,/data-go="shopping"/);
 assert.match(source,/preferenceExpanded=true/);
 assert.match(css,/scroll-snap-type:x mandatory/);
});

test('rendered UI permits real choice and detail jumping, without pseudo-scientific fit percentages',()=>{
 const source=fs.readFileSync(new URL('../camp/app.js',import.meta.url),'utf8');
 assert.match(source,/function quickCompare\(recs,c,ctx\)/);
 assert.match(source,/data-select-product=/);
 assert.match(source,/data-jump-product=/);
 assert.match(source,/if\(t\.dataset\.jumpProduct!==undefined\)/);
 assert.match(source,/fit-confirmed/);
 assert.doesNotMatch(source,/あなた適合/);
 assert.doesNotMatch(source,/<small>\/100<\/small>/);
});
