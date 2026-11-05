import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reject, recommend } from '../products.js';

const equipment=JSON.parse(fs.readFileSync(new URL('../data/equipment.json',import.meta.url)));
const rules=JSON.parse(fs.readFileSync(new URL('../data/recommendation-rules.json',import.meta.url)));
const now=Date.now();
const official='https://ec.snowpeak.co.jp/item/SNP0120A0737';
const answers=(adults,children)=>({
  adults,children,party_type:children?'family':'couple',
  season:'autumn',stay:'one_night',transport:'car',
  experiences:['bonfire'],budget:'100000'
});
const makeFirePit=()=>{
 const itemUrl='https://item.rakuten.co.jp/test-shop/101/';
 return {
  category:'fire_pit',
  model:'ST-032RS',
  name:'Snow Peak 焚火台 L ST-032RS',
  family:'test-snowpeak-fire-pit',
  itemCode:'test-shop:101',
  itemUrl,
  affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/test/?pc='+encodeURIComponent(itemUrl),
  image:'https://thumbnail.image.rakuten.co.jp/test.jpg',
  audited:true,bodyConfirmed:true,fixedVariant:true,available:true,
  priceAudit:true,condition:'new',quantityPerListing:1,
  verifiedAt:new Date(now).toISOString(),
  price:21120,referencePrice:21120,
  spec:{weight:5500,packed_size:'560×640×32mm',capacity:4},
  evidence:{
   listing:itemUrl,specification:official,
   fields:{weight:official,packed_size:official}
  },
  familyCapacityEvidence:{
   basis:'manufacturer_explicit_person_count',maxPeople:4,source:official,
   manufacturerStatement:'焚火台 L [3-4人用]'
  },
  scores:{fit:.96,beginner:.93,comfort:.97,portability:.3,value:.7,trust:.95},
  traits:['comfort']
 };
};

test('official 3-4 person Snow Peak source can certify family four without relaxing sales gates',()=>{
 const p=makeFirePit();
 assert.equal(reject(p,'fire_pit',answers(2,2),equipment,now),null);
 const options={preference:'comfort',quantity:1,targetBudget:25000};
 assert.equal(recommend([p],'fire_pit',answers(2,2),equipment,rules,options,now).length,1);
 p.available=false;
 assert.equal(reject(p,'fire_pit',answers(2,2),equipment,now),'listing_conditions');
 p.available=true;
 p.verifiedAt=new Date(now-8*86400000).toISOString();
 assert.equal(reject(p,'fire_pit',answers(2,2),equipment,now),'stale');
});

test('unsubstantiated four-person estimate cannot be shown as eligible fire pit',()=>{
 const p=makeFirePit();
 delete p.familyCapacityEvidence;
 assert.equal(reject(p,'fire_pit',answers(2,2),equipment,now),'unverified_fire_pit_group_size');
 assert.deepEqual(recommend([p],'fire_pit',answers(2,2),equipment,rules,
                           {preference:'easy'},now),[]);
});

test('fabricated people count or unrelated merchant URL cannot certify family capacity',()=>{
 const p=makeFirePit();
 for(const change of [
  {maxPeople:3},
  {maxPeople:5},
  {source:'https://item.rakuten.co.jp/test-shop/101/'},
  {source:'https://unverified.example.com/specs'},
  {basis:'guess_from_dimensions'}
 ]){
  const x=structuredClone(p);
  Object.assign(x.familyCapacityEvidence,change);
  assert.equal(reject(x,'fire_pit',answers(2,2),equipment,now),
               'unverified_fire_pit_group_size');
 }
 const outside=structuredClone(p);
 outside.familyCapacityEvidence.source='https://unverified.example.com/specs';
 outside.evidence.specification=outside.familyCapacityEvidence.source;
 assert.equal(reject(outside,'fire_pit',answers(2,2),equipment,now),
              'unverified_fire_pit_group_size');
});

test('one-person fire pit remains eligible for one, but never for family',()=>{
 const p=makeFirePit();
 p.spec.capacity=1;
 delete p.familyCapacityEvidence;
 assert.equal(reject(p,'fire_pit',answers(1,0),equipment,now),null);
 assert.equal(reject(p,'fire_pit',answers(2,2),equipment,now),'fire_pit_capacity');
});

test('only Snow Peak L has an explicit manufacturer group-size declaration in current historic audit',()=>{
 const audits=JSON.parse(fs.readFileSync(
  new URL('../data/audited-products.json',import.meta.url))).products;
 const group=audits.filter(p=>p.category==='fire_pit');
 const snow=group.find(p=>p.model==='ST-032RS');
 const coleman=group.find(p=>p.model==='2000031235');
 assert.equal(snow.familyCapacityEvidence.basis,'manufacturer_explicit_person_count');
 assert.equal(snow.familyCapacityEvidence.maxPeople,4);
 assert.equal(snow.familyCapacityEvidence.source,official);
 assert.equal(coleman.familyCapacityEvidence,undefined);
});
