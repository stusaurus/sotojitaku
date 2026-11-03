import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {reject} from '../products.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/products.json',import.meta.url)));
const audits=JSON.parse(fs.readFileSync(new URL('../data/audited-products.json',import.meta.url))).products;
const equipment=JSON.parse(fs.readFileSync(new URL('../data/equipment.json',import.meta.url)));

test('partial CAMP publication contains no stale sellers and honestly records unavailable categories',()=>{
 assert.equal(catalog.status,'partial_error');
 const asOf=Date.parse(catalog.updatedAt);
 assert.ok(Number.isFinite(asOf),"the saved catalog needs a publication timestamp");
 const byCategory=new Set(catalog.products.map(p=>p.category));
 const all=new Set(equipment.categories.map(c=>c.id));
 // An expired offer must disappear after a failed recheck, rather than
 // retaining a stale recommendation just to satisfy a coverage assertion.
 assert.ok(catalog.products.length<=audits.length,'no invented products');
 assert.ok(byCategory.size<all.size,'this is not complete category coverage');
 assert.deepEqual(new Set(catalog.failedCategories),new Set([...all].filter(x=>!byCategory.has(x))));
 // Different exact-seller failures (429, redirect, stock, unknown variant) must
 // be reported accurately instead of being relabeled as generic missing proof.
 for(const missing of catalog.failedCategories){
   const reason=catalog.failureReasons?.[missing];
   assert.ok(typeof reason==='string'&&reason.length>0,'missing cause for '+missing);
   assert.notEqual(reason,'renewed_exact_original_seller','a failed category cannot claim renewal');
 }
 for(const p of catalog.products){
   const source=audits.find(a=>a.category===p.category&&a.model===p.model&&a.itemUrl===p.itemUrl&&a.itemCode===p.itemCode);
   assert.ok(source,'every live offer must match its individually reaudited original seller');
   assert.equal(p.listingAuditedAt,source.listingAuditedAt);
   assert.ok(typeof source.listingAudit==='string'&&source.listingAudit.includes('GitHub Actions run'),'independent evidence trace must exist');
   const verified=Date.parse(p.verifiedAt);
   assert.ok(verified<=asOf,'seller verification cannot be after original publication');
   assert.ok(asOf-verified<7*86400000,'saved seller must have been fresh when published');
   assert.ok(verified<=Date.now(),'seller verification cannot be future-dated');
   // The archived catalog is not a claim of today's saleability. When its
   // evidence has expired, the public recommendation engine must fail closed.
   if(Date.now()-verified>7*86400000){
     const season=p.category==='sleeping_bag'&&Number(p.spec?.comfort_temperature)>5?'summer':'spring';
     const context={adults:1,children:0,season,stay:'one_night',transport:'car',experiences:['relax']};
     assert.equal(reject(p,p.category,context,equipment,Date.now()),'stale',
       p.category+': expired seller cannot be shown as a current purchase option');
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
