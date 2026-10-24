import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root=fs.readFileSync(new URL("../camp/index.html",import.meta.url),"utf8");

test("CAMP exposes a crawlable CAR STAY navigation link",()=>{
  assert.ok(root.includes('href="../car-stay/"'));
  assert.ok(root.includes("CAR STAY｜車中泊をつくる"));
});

test("CAR STAY footer CAMP navigation points to CAMP rather than HOME",()=>{
  const html=fs.readFileSync(new URL("../car-stay/index.html",import.meta.url),"utf8");
  assert.ok(html.includes('<a href="../camp/">CAMP</a>'));
});

test("all CAR STAY vehicle SEO links labeled CAMP resolve to CAMP, not the brand HOME",()=>{
  const paths=[
    "car-stay/car/index.html",
    ...["n-box","sienta","freed","hustler","n-van","every"].map(slug=>"car-stay/car/"+slug+"/index.html")
  ];
  for(const path of paths){
    const html=fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");
    const canonical=html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.ok(canonical,path+" canonical must exist");
    const links=[...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>\s*CAMP\s*<\/a>/g)];
    assert.ok(links.length>0,path+" should offer CAMP cross-service navigation");
    for(const link of links){
      const destination=new URL(link[1],canonical);
      assert.equal(destination.origin,"https://stusaurus.github.io",path);
      assert.equal(destination.pathname,"/sotojitaku/camp/",path+" CAMP link points to the wrong page");
    }
  }
});
