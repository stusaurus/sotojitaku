import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {analyzeSupply} from '../camp/supply-guidance.js';

const read=file=>JSON.parse(fs.readFileSync(new URL('../data/'+file+'.json',import.meta.url),'utf8'));
const equipment=read('equipment'),rules=read('recommendation-rules');
const now=Date.parse('2026-11-05T06:00:00Z');
const answers={party_type:'family',adults:2,children:2,stay:'one_night',transport:'car',
  season:'autumn',experiences:[],budget:'100000'};
const gear=[{id:'table',label:'テーブル',quantity:1,status:'buy'},
  {id:'mat',label:'キャンプマット',quantity:4,status:'buy'},
  {id:'fire_sheet',label:'耐熱シート',quantity:1,status:'buy'},
  {id:'tent',label:'テント',quantity:1,status:'rent'}];
function offer({item='12345678',weight=1000,family='family-a'}={}){
 const itemUrl='https://item.rakuten.co.jp/teststore/'+item+'/';
 return {
  category:'table',model:'T-'+item,name:'キャンプ テーブル T-'+item,
  itemCode:'teststore:'+item,family,audited:true,bodyConfirmed:true,
  condition:'new',fixedVariant:true,available:true,quantityPerListing:1,
  priceAudit:true,price:9000,referencePrice:9000,
  itemUrl,affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/a/?pc='+encodeURIComponent(itemUrl),
  image:'https://thumbnail.image.rakuten.co.jp/image.jpg',
  verifiedAt:new Date(now).toISOString(),
  spec:{table_size:'120x60cm',table_capacity:4,packed_size:'70x15cm',weight},
  evidence:{listing:itemUrl,specification:'https://example.org/maker',
    fields:{table_size:'https://example.org/maker',packed_size:'https://example.org/maker',weight:'https://example.org/maker'}},
  scores:{fit:.9,beginner:.9,comfort:.9,portability:.9,value:.9,trust:.9},
  traits:['easy','comfort'],
 };
}
const analyze=(products=[],selection={},overrides={})=>analyzeSupply(
 gear,products,overrides.answers||answers,equipment,rules,overrides.preferences||{},selection,now);

test('all unavailable means zero purchase choice, not "two more to finish"',()=>{
 const s=analyze();
 assert.deepEqual(s.rows.map(r=>[r.id,r.status]),[
  ['table','unavailable'],['mat','unavailable']]);
 assert.equal(s.pickedCount,0);
 assert.equal(s.selectableCount,0);
 assert.equal(s.unavailableCount,2);
 assert.equal(s.total,2);
 assert(!s.rows.some(r=>r.id==='tent'||r.id==='fire_sheet'),
   'rented and checklist-only gear are not product recommendations');
});

test('eligible exact seller listing becomes selectable, not already bought',()=>{
 const s=analyze([offer()]);
 assert.equal(s.pickedCount,0);
 assert.equal(s.selectableCount,1);
 assert.equal(s.unavailableCount,1);
 assert.equal(s.selectable[0].id,'table');
});

test('selected verified offer is picked; stale or wrong offer is unavailable',()=>{
 const p=offer();
 const s=analyze([p],{table:p.itemCode});
 assert.equal(s.pickedCount,1);
 assert.equal(s.picked[0].id,'table');
 assert.equal(s.unavailableCount,1);
 const stale={...p,verifiedAt:new Date(now-9*86400000).toISOString()};
 const old=analyze([stale],{table:stale.itemCode});
 assert.equal(old.pickedCount,0);
 assert.equal(old.unavailableCount,2);
 const wrong=analyze([p],{table:'wrongstore:999'});
 assert.equal(wrong.selectableCount,1);
 assert.equal(wrong.pickedCount,0);
});

test('same product at two sellers is never counted as two distinct recommended categories',()=>{
 const s=analyze([offer(),offer({item:'98765432',family:'family-a'})]);
 assert.equal(s.selectableCount,1);
 assert.equal(s.total,2);
 assert.equal(s.unavailableCount,1);
 assert.equal(s.rows[0].status,'selectable');
});

test('no-car heavier than 2kg table is not recommended despite recorded listing',()=>{
 const s=analyze([offer({weight:3000})],{},{
  answers:{...answers,transport:'no_car'}});
 assert.equal(s.unavailableCount,2);
 assert.equal(s.selectableCount,0);
});

test('research-only incomplete listing never becomes a selectable item',()=>{
 const p=offer();
 delete p.priceAudit;
 const s=analyze([p],{table:p.itemCode});
 assert.equal(s.pickedCount,0);
 assert.equal(s.unavailableCount,2);
});

test('supply state only exposes category labels, counts and status, never live price or merchant URLs',()=>{
 const p=offer(),summary=analyze([p]);
 const encoded=JSON.stringify(summary);
 for(const hidden of [p.itemCode,p.itemUrl,p.affiliateUrl,p.name,'"price":','"stock":'])
  assert.equal(encoded.includes(hidden),false,hidden);
});

test('UI uses independent unavailable and selectable sections and a real rental status handler',()=>{
 const source=fs.readFileSync(new URL('../camp/app.js',import.meta.url),'utf8');
 assert.match(source,/function supplyReport\(items\)/);
 assert.match(source,/supply\.unavailableCount/);
 assert.match(source,/現在案内できない/);
 assert.match(source,/data-supply-status="rent"/);
 assert.match(source,/data-supply-status="owned"/);
 assert.match(source,/if\(t\.dataset\.supplyStatus\)/);
 assert.match(source,/レンタル先の貸出条件/);
 assert.doesNotMatch(source,/あと\$\{unpicked\}カテゴリの商品を決めると/);
 assert.doesNotMatch(source,/これを楽天で買う/);
});
