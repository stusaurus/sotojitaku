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

test("CAR STAY vehicle pages labeled CAMP lead to the CAMP page, not SOTOJITAKU HOME",()=>{
  const paths=[
    "car-stay/car/index.html",
    ...["n-box","sienta","freed","hustler","n-van","every"]
      .map(slug=>"car-stay/car/"+slug+"/index.html")
  ];
  for(const path of paths){
    const html=fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");
    const canonical=html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.ok(canonical,path+": canonical is required");
    const anchors=[...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>\s*CAMP\s*<\/a>/g)];
    assert.equal(anchors.length,1,path+": exactly one CAMP cross-service link");
    const resolved=new URL(anchors[0][1],canonical);
    assert.equal(resolved.origin,"https://stusaurus.github.io",path);
    assert.equal(resolved.pathname,"/sotojitaku/camp/",path+": CAMP label must match destination");
    assert.ok(html.includes("<h1"),path+": primary content should remain intact");
  }
});
