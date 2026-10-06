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

function effectivePreferenceTags(product={}){
  const tags=new Set(product.preferenceTags||[]);
  const name=String(product.name||"");
  if(name.includes("アミ姫")){
    tags.add("no_worm");
    tags.add("low_mess");
  }
  if(name.includes("パワーイソメ")||name.includes("パワーミニイソメ")){
    tags.add("no_worm");
    tags.add("low_mess");
  }
  return [...tags];
}

export function productCoverageForInput(product,input={}){
  const covers=[...(product.coverCategoryIds||[product.categoryId])];
  if(["no_worm","low_mess"].includes(input.bait) && covers.includes("bait")){
    const tags=effectivePreferenceTags(product);
    if(!tags.includes(input.bait))return covers.filter(id=>id!=="bait");
  }
  return covers;
}

function productRank(product,neededIds,input){
  const covers=productCoverageForInput(product,input).filter(id=>neededIds.has(id)).length;
  const intentBoost=input?.budget==="long_term"&&product.recommendationRole==="long_term"?70:0;
  return (Number(product.score)||Number(product.recommendationScore)||0)
    +covers*12+(roleBoost[product.recommendationRole]||0)+intentBoost;
}

export function eligibleForCategory(products,{input,plan,categoryId,now=Date.now()}){
  return (products||[]).filter(product=>productEligible(product,{
    methodId:plan.methodId,
    categoryId,
    budgetTier:input.budget,
    audience:audienceForCategory(categoryId),
    baitPreference:input.bait,
    childFit:input.child_fit||null,
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
      .sort((a,b)=>productRank(b,neededIds,input)-productRank(a,neededIds,input)||a.price-b.price);
    if(!candidates.length){
      recommendations[item.id]={primary:null,upgrade:null,unresolved:true};
      continue;
    }
    const primary=candidates[0];
    const upgrade=candidates.slice(1).find(p=>p.price>primary.price&&p.recommendationRole==="long_term")||null;
    const primaryCoverage=productCoverageForInput(primary,input);
    const selectedPrimary={...primary,effectiveCoverCategoryIds:primaryCoverage};
    recommendations[item.id]={primary:selectedPrimary,upgrade,unresolved:false};
    selected.push(selectedPrimary);
    for(const id of primaryCoverage)covered.add(id);
  }

  const unresolvedRequiredCategoryIds=required
    .filter(item=>!covered.has(item.id)&&recommendations[item.id]?.unresolved)
    .map(x=>x.id);
  const unresolvedOptionalCategoryIds=optional
    .filter(item=>!covered.has(item.id)&&recommendations[item.id]?.unresolved)
    .map(x=>x.id);
  return {
    recommendations,
    selected,
    coveredCategoryIds:[...covered],
    unresolvedCategoryIds:unresolvedRequiredCategoryIds,
    unresolvedRequiredCategoryIds,
    unresolvedOptionalCategoryIds
  };
}

export function applyProductCoverage(checklist,selectedProducts){
  const covered=new Set((selectedProducts||[]).flatMap(p=>p.effectiveCoverCategoryIds||p.coverCategoryIds||[p.categoryId]));
  return (checklist||[]).map(item=>covered.has(item.id)&&item.state!=="owned"
    ?{...item,state:"covered_by_product"}
    :item);
}
