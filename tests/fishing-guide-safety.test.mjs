import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {starterScenario,requiredCoverageScore} from "../fishing/guides/starter-set/selection.js";

const catalog=JSON.parse(fs.readFileSync(new URL("../fishing/data/audited-products.json",import.meta.url),"utf8"));
const verified=catalog.products.find(p=>p.categoryId==="rod_reel"&&p.audit?.status==="verified_live");
assert.ok(verified,"fixture needs a verified rod/reel listing");
const now=Date.parse(verified.verifiedAt)+60*60*1000;

test("guide starter sets use the same verified eligibility gate as the diagnosis",()=>{
  const scenario=starterScenario(verified,now);
  assert.ok(scenario,"valid current listing remains visible");
  assert.ok(verified.methodIds.includes(scenario.method));
  assert.ok(verified.budgetTiers.includes(scenario.budget));
  assert.equal(starterScenario({...verified,audit:{status:"suspended"}},now),null);
  assert.equal(starterScenario({...verified,verifiedAt:"2020-01-01T00:00:00Z"},now),null);
  assert.equal(starterScenario({...verified,price:0},now),null);
  assert.equal(starterScenario({...verified,affiliateUrl:"https://example.com/not-an-affiliate"},now),null);
  assert.equal(starterScenario({...verified,methodIds:["invalid"]},now),null);
  assert.equal(starterScenario({...verified,coverCategoryIds:["rod_reel"]},now),null);
});

test("required coverage rate never counts optional included accessories",()=>{
  const checklist=[
    {id:"rod_reel",priority:"required"},
    {id:"life_jacket_adult",priority:"required"},
    {id:"bucket",priority:"optional"}
  ];
  assert.equal(requiredCoverageScore(checklist,["rod_reel","bucket"]),50);
  assert.equal(requiredCoverageScore(checklist,["rod_reel","life_jacket_adult","bucket"]),100);
  assert.equal(requiredCoverageScore(checklist,["bucket"]),0);
  assert.equal(requiredCoverageScore([],["rod_reel"]),0);
});

test("incomplete budget examples explicitly say subtotal, not necessary total",()=>{
  const code=fs.readFileSync(new URL("../fishing/guides/budget/budget.js",import.meta.url),"utf8");
  assert.match(code,/確認済み分の小計/);
  assert.match(code,/総額未算出/);
  assert.match(code,/card\.products\.length\?money\(card\.total\):"未算出"/);
});
