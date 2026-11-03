import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {reject} from '../products.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/products.json',import.meta.url)));
const audits=JSON.parse(fs.readFileSync(new URL('../data/audited-products.json',import.meta.url))).products;
const equipment=JSON.parse(fs.readFileSync(new URL('../data/equipment.json',import.meta.url)));

test('partial CAMP publication contains no stale sellers and honestly records unavailable categories',()=>{
 assert.equal(catalog.status,'partial_error');
 const snapshotTime=Date.parse(catalog.updatedAt);
 assert.ok(Number.isFinite(snapshotTime),'historical catalog must have a dated publication');
 const byCategory=new Set(catalog.products.map(p=>p.category));
 const all=new Set(equipment.categories.map(c=>c.id));
 // An expired offer must disappear after a failed recheck, rather than
 // retaining a stale recommendation just to satisfy a coverage assertion.
 assert.ok(catalog.products.length<=audits.length,'no invented products');
 assert.ok(byCategory.size<all.size,'this is not complete category coverage');
 assert.deepEqual(new Set(catalog.failedCategories),new Set([...all].filter(x=>!byCategory.has(x))));
 for(const missing of catalog.failedCategories){
   const reason=catalog.failureReasons[missing];
   assert.match(reason,/^[a-z][a-z0-9_]*$/,'failure reason must be a safe explicit diagnostic code');
 }

 for(const p of catalog.products){
   const source=audits.find(a=>a.category===p.category&&a.model===p.model&&a.itemUrl===p.itemUrl&&a.itemCode===p.itemCode);
   assert.ok(source,'every live offer must match its individually reaudited original seller');
   assert.equal(p.listingAuditedAt,source.listingAuditedAt);
   assert.ok(typeof source.listingAudit==='string'&&source.listingAudit.includes('GitHub Actions run'),'independent evidence trace must exist');
   const verified=Date.parse(p.verifiedAt);
   assert.ok(verified<=snapshotTime,'no future-dated verification at historical publication');
   assert.ok(snapshotTime-verified<7*86400000,'historical publication may contain only then-fresh sellers');
   assert.ok(verified<=Date.now(),'no verification from the future');
   // Historical files can expire between scheduled runs. Runtime must reject
   // those sellers today rather than redefining the TTL or forging timestamps.
   if(Date.now()-verified>7*86400000){
     const season=p.category==='sleeping_bag'&&Number(p.spec?.comfort_temperature)>5?'summer':'spring';
     const answers={adults:1,children:0,season,stay:'one_night',transport:'car',experiences:['relax']};
     assert.equal(reject(p,p.category,answers,equipment,Date.now()),'stale',
       p.category+': an expired archived offer must never be recommended now');
   }
   assert.ok(p.price>0&&Number.isSafeInteger(p.price));
   assert.equal(p.shipping,'included');
   assert.equal(p.verificationMode,'sales_page_and_official_item_api');
   assert.equal(p.fixedVariant,true);
   assert.equal(p.available,true);
   assert.equal(p.quantityPerListing,1);
   const link=new URL(p.affiliateUrl);
   assert.equal(link.hostname,'hb.afl.rakuten.co.jp');
   assert.equal(new URL(link.searchParams.get('pc')).pathname,new URL(p.itemUrl).pathname);
 }
});
