// Run from the candidate Git checkout. The other checkout must contain the original PR.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const [originalDir,catalogRef,observedAt]=process.argv.slice(2);
if(!originalDir || !catalogRef || !observedAt)
  throw new Error("Usage: node compare-plans.mjs PREVIOUS_CHECKOUT MAIN_SHA ISO_DATE");
const git=(cwd,...args)=>execFileSync("git",["-C",cwd,...args],{encoding:"utf8"}).trim();
const current=process.cwd();
const epoch=Date.parse(observedAt);
assert(Number.isFinite(epoch));
const from=(root,file)=>import(pathToFileURL(resolve(root,file)).href);
const [before,after,oldOffers,newOffers]=await Promise.all([
  from(originalDir,"engine.js"),from(current,"engine.js"),
  from(originalDir,"products.js"),from(current,"products.js"),
]);
const names=["questions","equipment","abilities","recipes","recommendation-rules"];
const data=Object.fromEntries(names.map(name=>[name==="recommendation-rules"?"rules":name,
  JSON.parse(readFileSync(resolve(current,"data",name+".json"),"utf8"))]));
const catalog=JSON.parse(git(current,"show",catalogRef+":data/products.json"));
const cases=[
  ["solo-daytrip",{party_type:"solo",adults:1,children:0,stay:"daytrip",transport:"no_car",experiences:["easy"],budget:"30000"},{}],
  ["couple-overnight",{experiences:["coffee","bonfire"]},{tent:"rent"}],
  ["family-bbq",{party_type:"family",children:2,experiences:["bbq","bonfire","coffee"]},{tent:"owned"}],
  ["family-no-fuel",{party_type:"family",children:2,experiences:["coffee","bonfire"]},{fuel:"skip"}],
  ["core-mat-skipped",{party_type:"solo",adults:1,experiences:["relax"]},{mat:"skip"}],
  ["five-person",{party_type:"friends",adults:5,experiences:["bbq","coffee"]},{}],
];
const proof={original:git(originalDir,"rev-parse","HEAD"),candidate:git(current,"rev-parse","HEAD"),
  catalogRef,catalogBlob:git(current,"rev-parse",catalogRef+":data/products.json"),asOf:observedAt,
  catalogCount:catalog.products.length,profiles:[],identicalRecommendationSets:0,nonemptyRecommendationSets:0};
for(const [id,answers,gear] of cases){
  // A v1 plan from before the studio can lack the optional party-selection flag.
  const state={version:1,answers:{...after.DEFAULT,...answers},gear,recipes:[],
    productPrefs:{},selectedProducts:{},stage:"question",q:5,finished:false};
  for(const engine of [before,after])assert.deepEqual(engine.validateStored(state,data),state,id);
  for(const key of ["plan","readiness","costs","schedule"])
    assert.deepEqual(before[key](state,data),after[key](state,data),id+" "+key);
  const plan=after.plan(state,data);
  for(const {id:category} of data.equipment.categories){
    const quantity=plan.find(row=>row.id===category)?.quantity||1;
    for(const preference of ["easy","comfort","compact","value"]){
      const args=[catalog.products,category,state.answers,data.equipment,data.rules,
        {preference,quantity,targetBudget:50000},epoch];
      const actual=newOffers.recommend(...args);
      assert.deepEqual(actual,oldOffers.recommend(...args),id+" "+category+" "+preference);
      proof.identicalRecommendationSets++;
      if(actual.length)proof.nonemptyRecommendationSets++;
    }
  }
  const ready=after.readiness(state,data);
  if(id==="family-no-fuel")assert(ready.blocked.includes("coffee")&&ready.blocked.includes("bonfire"));
  if(id==="core-mat-skipped")assert.equal(ready.canComplete,false);
  proof.profiles.push({id,gear:plan.length,checkedCategories:data.equipment.categories.length,canComplete:ready.canComplete});
}
console.log(JSON.stringify(proof,null,2));
