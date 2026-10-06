import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {selectPlan,buildGearChecklist} from "../fishing/engine.js";
import {buildProductRecommendations} from "../fishing/products.js";

const readJson=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url),"utf8"));
const plans=readJson("../fishing/data/plans.json");
const gear=readJson("../fishing/data/gear.json");
const catalog=readJson("../fishing/data/audited-products.json");
const now=Date.parse(catalog.updatedAt);

function run(input){
  const plan=selectPlan(input,plans);
  const checklist=buildGearChecklist(input,plan,gear);
  const products=buildProductRecommendations(catalog.products,{
    input,plan,checklist,now
  });
  return {plan,checklist,products};
}

test("family low-budget sabiki gets a complete shoppable basket",()=>{
  const r=run({
    party:"family_child",fun:"easy_catch",bait:"okay",take_home:"yes",
    carry:"normal",budget:"low",owned:[]
  });
  assert.equal(r.plan.methodId,"sabiki");
  assert.deepEqual(r.products.unresolvedCategoryIds,[]);
  assert.ok(r.products.selected.some(p=>p.categoryId==="rod_reel"));
  assert.ok(r.products.selected.some(p=>p.categoryId==="life_jacket_adult"));
  assert.ok(r.products.selected.some(p=>p.categoryId==="life_jacket_child"));
  assert.ok(r.products.selected.some(p=>p.categoryId==="cooler"));
});

test("balanced choi-nage gets a verified rod set and all required categories",()=>{
  const r=run({
    party:"pair",fun:"cast_wait",bait:"okay",take_home:"no",
    carry:"normal",budget:"balanced",owned:[]
  });
  assert.equal(r.plan.methodId,"choi_nage");
  assert.deepEqual(r.products.unresolvedCategoryIds,[]);
  assert.ok(r.products.selected.some(p=>p.productId==="choi-shimano-complete-500527"));
});

test("low-mess sabiki adds preference-valid bait instead of trusting bundle bait",()=>{
  const r=run({
    party:"family_child",fun:"easy_catch",bait:"low_mess",take_home:"yes",
    carry:"normal",budget:"balanced",owned:[]
  });
  assert.equal(r.plan.methodId,"sabiki");
  assert.deepEqual(r.products.unresolvedCategoryIds,[]);
  const complete=r.products.selected.find(p=>p.productId==="sabiki-shimano-complete-500528");
  const bait=r.products.selected.find(p=>p.categoryId==="bait");
  assert.ok(complete);
  assert.ok(bait);
  assert.equal(complete.effectiveCoverCategoryIds.includes("bait"),false);
  assert.ok((bait.preferenceTags||[]).includes("low_mess"));
});
