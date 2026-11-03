// Release integrity gate: the published CAR STAY catalog must be the exact
// verified catalog checked out by this workflow, not an older Pages build.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {setTimeout as sleep} from "node:timers/promises";

const source=JSON.parse(fs.readFileSync("car-stay/data/audited-products.json","utf8"));
const base=new URL(process.env.CAR_STAY_BASE||"https://stusaurus.github.io/sotojitaku/car-stay/");
const endpoint=new URL("data/audited-products.json",base);
endpoint.searchParams.set("release",process.env.GITHUB_SHA?.slice(0,12)||"manual");
const attempts=8;
let reason="";
assert.ok(Array.isArray(source.products)&&source.products.length>0,"source CAR STAY catalog missing");
assert.ok(source.products.every(p=>p.audit?.status==="verified_live"),"source contains unverified offers");
for(let attempt=1;attempt<=attempts;attempt++){
  try{
    const response=await fetch(endpoint,{headers:{"cache-control":"no-cache"},signal:AbortSignal.timeout(25000)});
    assert.equal(response.status,200,"public CAR STAY JSON HTTP status");
    const published=await response.json();
    assert.deepEqual(published,source,"published CAR STAY JSON differs from verified main");
    const result={
      checkedAt:new Date().toISOString(),
      sourceSha:process.env.GITHUB_SHA||"manual",
      publicUrl:endpoint.href,
      status:"PASS",
      productCount:published.products.length,
      updatedAt:published.updatedAt
    };
    fs.mkdirSync(path.join("browser-proof","car-stay"),{recursive:true});
    fs.writeFileSync("browser-proof/car-stay/catalog-exact-match.json",JSON.stringify(result,null,2));
    console.log("PASS: public CAR STAY exactly matches current release:",result.productCount,
      "verified offers; updatedAt",result.updatedAt);
    process.exit(0);
  }catch(error){
    reason=error.message;
    if(attempt<attempts){
      console.log(`Retry ${attempt}/${attempts}: Pages propagation or stale catalog: ${reason.slice(0,180)}`);
      await sleep(3000);
    }
  }
}
throw new Error(`Public CAR STAY is not the catalog in this release: ${reason}`);
