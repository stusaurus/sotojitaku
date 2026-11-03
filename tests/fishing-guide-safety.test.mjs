import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {starterScenario,requiredCoverageScore} from "../fishing/guides/starter-set/selection.js";

// Deliberately fabricated, IN-MEMORY merchant evidence. Never write this to
// fishing/data/audited-products.json or represent it as a verified live offer.
function fakeRod(now=Date.now()){
  const itemUrl="https://item.rakuten.co.jp/test-fixture/test-rod/";
  return {
    productId:"TEST-ONLY-ROD",name:"TEST fixture rod and rig",categoryId:"rod_reel",
    methodIds:["choi_nage"],budgetTiers:["low"],audiences:["adult"],
    coverCategoryIds:["rod_reel","rig"],preferenceTags:[],
    price:6000,image:"https://example.com/test-rod.png",
    itemUrl,affiliateUrl:"https://hb.afl.rakuten.co.jp/hgc/test/?pc="+encodeURIComponent(itemUrl),
    verifiedAt:new Date(now-3600000).toISOString(),audit:{status:"verified_live"}
  };
}
test("starter-set guide reuses diagnosis gates for active, exact, safe products",()=>{
  const now=Date.now(),product=fakeRod(now);
  const scenario=starterScenario(product,now);
  assert.ok(scenario,"suitable fake fixture should be eligible");
  assert.equal(scenario.method,"choi_nage");
  assert.equal(scenario.budget,"low");
  assert.equal(starterScenario({...product,audit:{status:"suspended"}},now),null);
  assert.equal(starterScenario({...product,verifiedAt:new Date(now-8*86400000).toISOString()},now),null);
  assert.equal(starterScenario({...product,price:0},now),null);
  assert.equal(starterScenario({...product,affiliateUrl:"https://example.com/misleading"},now),null);
  assert.equal(starterScenario({...product,itemUrl:"https://item.rakuten.co.jp/other-shop/other-item/"},now),null);
  assert.equal(starterScenario({...product,methodIds:["unknown"]},now),null);
  assert.equal(starterScenario({...product,coverCategoryIds:["rod_reel"]},now),null);
});

test("required coverage is not inflated by optional gear",()=>{
  const checklist=[
    {id:"rod_reel",priority:"required"},{id:"life_jacket_adult",priority:"required"},
    {id:"bucket",priority:"optional"}
  ];
  assert.equal(requiredCoverageScore(checklist,["rod_reel","bucket"]),50);
  assert.equal(requiredCoverageScore(checklist,["rod_reel","life_jacket_adult","bucket"]),100);
  assert.equal(requiredCoverageScore(checklist,["bucket"]),0);
  assert.equal(requiredCoverageScore([],["rod_reel"]),0);
});

test("missing FISHING merchandise never displays a false ¥0 necessary budget",()=>{
  const source=fs.readFileSync(new URL("../fishing/guides/budget/budget.js",import.meta.url),"utf8");
  assert.match(source,/確認済み分の小計/);
  assert.match(source,/総額未算出/);
  assert.match(source,/card\.products\.length\?money\(card\.total\):"未算出"/);
});
