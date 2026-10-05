import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const pages=[["freed","freed-mat"],["n-van","n-van-mat"],["hustler","hustler-mat"],["sienta","sienta-mat"]];

test("high-intent CAR STAY mat pages are substantive, indexed, and connected to Builder",()=>{
  const sitemap=read("sitemap.xml");
  for(const [slug,entry] of pages){
    const path="car-stay/car/"+slug+"/mat/index.html";
    const html=read(path);
    assert.ok(html.length>4000,slug+" mat page should not be thin");
    assert.match(html,/rel="canonical"/);
    assert.ok(html.includes("entry="+entry),slug+" should preserve SEO entry attribution");
    assert.ok(sitemap.includes("/car-stay/car/"+slug+"/mat/"),slug+" mat page must be in sitemap");
  }
});

test("verified geometry is surfaced only on pages with confirmed source data",()=>{
  assert.match(read("car-stay/car/freed/mat/index.html"),/197cm/);
  assert.match(read("car-stay/car/freed/mat/index.html"),/2\.5cm/);
  assert.match(read("car-stay/car/n-van/mat/index.html"),/230cm/);
  assert.match(read("car-stay/car/sienta/mat/index.html"),/2,045mm/);
  assert.doesNotMatch(read("car-stay/car/hustler/mat/index.html"),/197cm|230cm|2,045mm/);
});
