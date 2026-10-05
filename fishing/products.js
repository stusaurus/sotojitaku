import {productEligible} from "./engine.js";

const roleBoost={
  child_safety:30,
  beginner_default:20,
  budget:10,
  long_term:8,
  optional_comfort:0
};

function audienceForCategory(categoryId){
  if(categoryId==="life_jacket_child")return "child";
  if(categoryId==="life_jacket_adult")return "adult";
  return null;
}

function productRank(product,neededIds){
  const covers=(product.coverCategoryIds||[]).filter(id=>neededIds.has(id)).length;
  return (Number(product.score)||Number(product.recommendationScore)||0)
    +covers*12+(roleBoost[product.recommendationRole]||0);
}

export function eligibleForCategory(products,{input,plan,categoryId,now=Date.now()}){
  return (products||[]).filter(product=>productEligible(product,{
    methodId:plan.methodId,
    categoryId,
    budgetTier:input.budget,
    audience:audienceForCategory(categoryId),
    baitPreference:input.bait,
    now
  }));
}

export function buildProductRecommendations(products,{input,plan,checklist,now=Date.now()}){
  const monetizable=(checklist||[]).filter(item=>item.monetizable&&item.state!=="owned");
  const required=monetizable.filter(item=>item.priority==="required");
  const optional=monetizable.filter(item=>item.priority==="optional");
  const ordered=[...required,...optional];
  const neededIds=new Set(ordered.map(x=>x.id));
  const covered=new Set();
  const recommendations={};
  const selected=[];

  for(const item of ordered){
    if(covered.has(item.id))continue;
    const candidates=eligibleForCategory(products,{input,plan,categoryId:item.id,now})
      .sort((a,b)=>productRank(b,neededIds)-productRank(a,neededIds)||a.price-b.price);
    if(!candidates.length){
      recommendations[item.id]={primary:null,upgrade:null,unresolved:true};
      continue;
    }
    const primary=candidates[0];
    const upgrade=candidates.slice(1).find(p=>p.price>primary.price&&p.recommendationRole==="long_term")||null;
    recommendations[item.id]={primary,upgrade,unresolved:false};
    selected.push(primary);
    for(const id of primary.coverCategoryIds||[primary.categoryId])covered.add(id);
  }

  const unresolved=ordered.filter(item=>!covered.has(item.id)&&recommendations[item.id]?.unresolved).map(x=>x.id);
  return {
    recommendations,
    selected,
    coveredCategoryIds:[...covered],
    unresolvedCategoryIds:unresolved
  };
}

export function applyProductCoverage(checklist,selectedProducts){
  const covered=new Set((selectedProducts||[]).flatMap(p=>p.coverCategoryIds||[p.categoryId]));
  return (checklist||[]).map(item=>covered.has(item.id)&&item.state!=="owned"
    ?{...item,state:"covered_by_product"}
    :item);
}
