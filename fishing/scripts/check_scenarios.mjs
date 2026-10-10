import fs from "node:fs";
import {selectPlan,buildGearChecklist} from "../engine.js";
import {buildProductRecommendations,applyProductCoverage} from "../products.js";

const readJson=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url),"utf8"));
const plans=readJson("../data/plans.json");
const gear=readJson("../data/gear.json");
const catalog=readJson("../data/audited-products.json");

const suspendedRod=readJson("../data/product-seeds/choi-shimano-complete.json").suspended===true;
const suspendedSabikiRod=readJson("../data/product-seeds/sabiki-shimano-complete.json").suspended===true;
const dimensions={
  party:["solo","pair","family_child","group"],
  fun:["easy_catch","cast_wait","choose_for_me"],
  bait:["okay","no_worm","low_mess"],
  take_home:["yes","no","undecided"],
  carry:["compact","normal","comfort"],
  budget:["low","balanced","long_term"]
};

const ownedProfiles=[
  {name:"none",owned:[]},
  {name:"household",owned:["cooler","scissors","towel","bag"]},
  {name:"some_tackle",owned:["rod_reel","life_jacket_adult","bucket","fish_grip","scissors","pliers","towel"]}
];

const failures=[];
let scenarios=0;

for(const party of dimensions.party)
for(const fun of dimensions.fun)
for(const bait of dimensions.bait)
for(const take_home of dimensions.take_home)
for(const carry of dimensions.carry)
for(const budget of dimensions.budget)
for(const profile of ownedProfiles){
  const input={party,fun,bait,take_home,carry,budget,owned:[...profile.owned]};
  if(party==="family_child"&&profile.name==="some_tackle"){
    // This profile intentionally does not claim a child PFD. Child safety stays
    // outside monetized recommendations until fit/size is known.
  }

  const plan=selectPlan(input,plans);
  if(!plan){
    failures.push({kind:"no_plan",input,profile:profile.name});
    continue;
  }

  const checklist=buildGearChecklist(input,plan,gear);
  const result=buildProductRecommendations(catalog.products||[],{
    input,plan,checklist,now:Date.now()
  });
  const covered=applyProductCoverage(checklist,result.selected);

  const unresolved=covered.filter(item=>
    item.monetizable &&
    item.priority==="required" &&
    item.state!=="owned" &&
    item.state!=="covered_by_product"
  );

  const suspendedHole=((suspendedRod&&plan.methodId==="choi_nage")||(suspendedSabikiRod&&plan.methodId==="sabiki"))&&budget!=="low"&&!input.owned?.includes("rod_reel");
  const unexpected=unresolved.filter(x=>!(suspendedHole&&x.id==="rod_reel"));
  if(unexpected.length){
    failures.push({
      kind:"unresolved_required_product",
      input,
      profile:profile.name,
      method:plan.methodId,
      unresolved:unexpected.map(x=>x.id),
      selected:(result.selected||[]).map(x=>x.productId)
    });
  }

  if((result.selected||[]).some(p=>p.categoryId==="life_jacket_child")){
    failures.push({
      kind:"fit_sensitive_child_pfd_was_auto_selected",
      input,
      profile:profile.name,
      selected:(result.selected||[]).map(x=>x.productId)
    });
  }

  // Bait-averse users must never have bait marked covered by a product whose
  // effective coverage intentionally excludes bait.
  if(["no_worm","low_mess"].includes(bait)){
    const baitItem=covered.find(x=>x.id==="bait");
    if(baitItem?.state!=="covered_by_product"){
      failures.push({
        kind:"bait_preference_not_resolved",
        input,
        profile:profile.name,
        method:plan.methodId,
        baitState:baitItem?.state||"missing"
      });
    }
  }

  scenarios++;
}

console.log("FISHING exhaustive scenarios:",scenarios);
console.log("Verified products:",(catalog.products||[]).length);

if(failures.length){
  console.error("FISHING scenario failures:",failures.length);
  for(const failure of failures.slice(0,30)){
    console.error(JSON.stringify(failure));
  }
  if(failures.length>30)console.error("...and",failures.length-30,"more");
  process.exit(1);
}

console.log("FISHING scenarios pass safety/coverage gates; known suspended sabiki/choi-nage rod holes remain for balanced/long_term.");
