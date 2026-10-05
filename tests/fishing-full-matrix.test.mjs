import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {selectPlan,buildGearChecklist} from "../fishing/engine.js";
import {buildProductRecommendations,applyProductCoverage} from "../fishing/products.js";

const plans=JSON.parse(fs.readFileSync(new URL("../fishing/data/plans.json",import.meta.url)));
const gear=JSON.parse(fs.readFileSync(new URL("../fishing/data/gear.json",import.meta.url)));
const catalog=JSON.parse(fs.readFileSync(new URL("../fishing/data/audited-products.json",import.meta.url)));

const parties=["solo","pair","family_child","group"];
const funs=["easy_catch","cast_wait","choose_for_me"];
const baits=["okay","no_worm","low_mess"];
const takeHomes=["yes","no","undecided"];
const carries=["compact","normal","comfort"];
const budgets=["low","balanced","long_term"];

test("every first-trip diagnosis has purchasable coverage for all required monetizable gaps",()=>{
  const failures=[];
  let cases=0;
  for(const party of parties)
    for(const fun of funs)
      for(const bait of baits)
        for(const take_home of takeHomes)
          for(const carry of carries)
            for(const budget of budgets){
              cases++;
              const input={party,fun,bait,take_home,carry,budget,owned:[]};
              const plan=selectPlan(input,plans);
              const checklist=buildGearChecklist(input,plan,gear);
              const result=buildProductRecommendations(catalog.products,{
                input,plan,checklist,now:Date.now()
              });
              const covered=applyProductCoverage(checklist,result.selected);
              const missing=covered.filter(
                x=>x.priority==="required"&&x.monetizable&&x.state==="needed"
              );
              if(missing.length){
                failures.push({
                  input,
                  method:plan.methodId,
                  missing:missing.map(x=>x.id),
                  unresolved:result.unresolvedCategoryIds
                });
              }
              assert.equal(
                new Set(result.selected.map(x=>x.productId)).size,
                result.selected.length,
                "same product must never be selected twice"
              );
            }
  assert.equal(cases,972);
  assert.deepEqual(failures,[]);
});

test("owned safety and handling gear are never emitted as standalone recommendations",()=>{
  const input={
    party:"family_child",
    fun:"easy_catch",
    bait:"low_mess",
    take_home:"yes",
    carry:"normal",
    budget:"balanced",
    owned:["life_jacket_adult","life_jacket_child","cooler","bucket","fish_grip","scissors","bag"]
  };
  const plan=selectPlan(input,plans);
  const checklist=buildGearChecklist(input,plan,gear);
  const result=buildProductRecommendations(catalog.products,{input,plan,checklist,now:Date.now()});
  const standaloneCategories=new Set(result.selected.map(x=>x.categoryId));
  for(const category of ["life_jacket_adult","life_jacket_child","cooler","bucket","fish_grip","scissors","bag"]){
    assert.equal(standaloneCategories.has(category),false,category+" must not be recommended standalone when owned");
  }
});
