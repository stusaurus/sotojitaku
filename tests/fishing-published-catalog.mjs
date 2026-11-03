// Compare the exact PUBLIC FISHING merchandise with the repository release.
// This script never opens an affiliate link or sends production analytics.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {setTimeout as delay} from "node:timers/promises";

const local = JSON.parse(readFileSync(new URL("../fishing/data/audited-products.json",import.meta.url),"utf8"));
const base = process.env.FISHING_BASE || "https://stusaurus.github.io/sotojitaku/fishing/";
const remote = new URL("data/audited-products.json",base);

assert.equal(remote.protocol,"https:","public catalog must be fetched using HTTPS");
assert.equal(remote.hostname,"stusaurus.github.io","unexpected public origin");

function validateCatalog(data){
  assert.ok(Array.isArray(data.products)&&data.products.length>0,"empty public merchandise");
  assert.equal(data.verifiedCount,data.products.length,"verifiedCount must match actual items");
  assert.ok(["partial","verified","complete"].includes(data.status),"unknown catalog status");
  const now=Date.now(), day=86400000;
  const ids=new Set();
  for(const product of data.products){
    assert.equal(product.audit?.status,"verified_live","unverified product must never ship");
    assert.ok(typeof product.productId==="string"&&product.productId,"missing product ID");
    assert.ok(!ids.has(product.productId),"duplicate product ID");
    ids.add(product.productId);
    const age=now-Date.parse(product.verifiedAt);
    assert.ok(Number.isFinite(age)&&age>=-60000&&age<=7*day,"expired or future-dated product");
    assert.ok(Number.isFinite(product.price)&&product.price>0,"non-positive price");
    const item = new URL(product.itemUrl);
    const aff = new URL(product.affiliateUrl);
    assert.equal(item.protocol,"https:");
    assert.equal(item.hostname,"item.rakuten.co.jp");
    assert.equal(aff.protocol,"https:");
    assert.equal(aff.hostname,"hb.afl.rakuten.co.jp");
    const dest = new URL(aff.searchParams.get("pc"));
    assert.equal(dest.origin+dest.pathname.replace(/\\/+$/,""),item.origin+item.pathname.replace(/\\/+$/,""),"affiliate destination mismatch");
  }
}
validateCatalog(local);

let lastError;
for(let attempt=1;attempt<=7;attempt++){
  try{
    // Bypass a stale CDN cache during eventual Pages deployment propagation.
    remote.searchParams.set("qa",String(attempt));
    const response=await fetch(remote,{cache:"no-store",signal:AbortSignal.timeout(12000)});
    assert.equal(response.status,200,"public catalog is not HTTP 200");
    const published=await response.json();
    validateCatalog(published);
    assert.deepEqual(published,local,"public product data differs from current main");
    console.log("PASS: public FISHING matches main:",published.products.length,"verified offers; status",published.status);
    process.exit(0);
  }catch(error){
    lastError=error;
    console.warn("FISHING public verification attempt",attempt,"did not match current main:",error.message);
    if(attempt<7)await delay(5000);
  }
}
console.error("FAIL: public FISHING did not match currently verified main:",lastError?.message);
process.exit(1);
