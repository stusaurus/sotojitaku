import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/products.json',import.meta.url)));
const audits=JSON.parse(fs.readFileSync(new URL('../data/audited-products.json',import.meta.url))).products;
const equipment=JSON.parse(fs.readFileSync(new URL('../data/equipment.json',import.meta.url)));

test('CAMP publication contains no stale sellers and honestly records unavailable categories',()=>{
 const byCategory=new Set(catalog.products.map(p=>p.category));
 const all=new Set(equipment.categories.map(c=>c.id));
 // An expired offer must disappear after a failed recheck, rather than
 // retaining a stale recommendation just to satisfy a coverage assertion.
 assert.ok(catalog.products.length<=audits.length,'no invented products');
 assert.equal(catalog.status,byCategory.size<all.size?'partial_error':'ok');
 assert.deepEqual(new Set(catalog.failedCategories),new Set([...all].filter(x=>!byCategory.has(x))));
 for(const missing of catalog.failedCategories)assert.equal(catalog.failureReasons[missing],'fresh_seller_evidence_missing');
 for(const p of catalog.products){
   const source=audits.find(a=>a.category===p.category&&a.model===p.model&&a.itemUrl===p.itemUrl&&a.itemCode===p.itemCode);
   assert.ok(source,'every live offer must match its individually reaudited original seller');
   assert.equal(p.listingAuditedAt,source.listingAuditedAt);
   assert.ok(typeof source.listingAudit==='string'&&source.listingAudit.includes('GitHub Actions run'),'independent evidence trace must exist');
   assert.ok(Date.parse(p.verifiedAt)<=Date.now(),'no future-dated verification');
   assert.ok(Date.now()-Date.parse(p.verifiedAt)<7*86400000,'no expired recommendation');
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
