// Certified release: CAMP public static JSON must match the independently
// verified source at this exact commit. Potential audit inventory and active
// verified seller offers are separate files; both must be identical.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {setTimeout as sleep} from "node:timers/promises";

const base=new URL(process.env.CAMP_BASE||"https://stusaurus.github.io/sotojitaku/");
const files=["data/audited-products.json","data/products.json"];
const source=Object.fromEntries(files.map(file=>[
  file,JSON.parse(fs.readFileSync(file,"utf8"))
]));
assert.ok(Array.isArray(source["data/audited-products.json"].products),"CAMP audit source absent");
assert.ok(Array.isArray(source["data/products.json"].products),"CAMP live source absent");
const failures=[];
const result={checkedAt:new Date().toISOString(),sourceSha:process.env.GITHUB_SHA||"manual",catalogs:[]};
for(const file of files){
  const url=new URL(file,base);
  url.searchParams.set("release",process.env.GITHUB_SHA?.slice(0,12)||"manual");
  let pass=false;
  let lastError="";
  for(let attempt=1;attempt<=8;attempt++){
    try{
      const response=await fetch(url,{headers:{"cache-control":"no-cache"},signal:AbortSignal.timeout(25000)});
      assert.equal(response.status,200,file+" HTTP status");
      const published=await response.json();
      assert.deepEqual(published,source[file],file+" does not match verified main release");
      result.catalogs.push({file,url:url.href,status:"PASS",products:published.products.length,updatedAt:published.updatedAt||null});
      pass=true;
      break;
    }catch(error){
      lastError=error.message;
      if(attempt<8)await sleep(3000);
    }
  }
  if(!pass)failures.push(file+": "+lastError);
}
fs.mkdirSync(path.join("browser-proof","camp"),{recursive:true});
result.status=failures.length?"FAIL":"PASS";
result.errors=failures;
fs.writeFileSync("browser-proof/camp/published-catalog-parity.json",JSON.stringify(result,null,2));
if(failures.length)throw new Error("CAMP release parity failed: "+failures.join("; "));
console.log("PASS: CAMP public audit and live verified catalogs exactly match main release",
  result.catalogs.map(x=>x.file+"="+x.products).join(", "));
