import {eligibleForCategory} from "../../products.js";

const METHODS=new Set(["sabiki","choi_nage"]);
const BUDGETS=new Set(["low","balanced","long_term"]);

// Use the diagnosis engine's full verification gate; a listing in the catalog
// alone does not mean it is still safe to show a purchase link.
export function starterScenario(product,now=Date.now()){
  if(product?.categoryId!=="rod_reel"||!Array.isArray(product.coverCategoryIds)||product.coverCategoryIds.length<2)return null;
  const methods=(Array.isArray(product.methodIds)?product.methodIds:[]).filter(id=>METHODS.has(id));
  const budgets=[...new Set(["balanced",...(Array.isArray(product.budgetTiers)?product.budgetTiers:[])])].filter(id=>BUDGETS.has(id));
  for(const method of methods)for(const budget of budgets){
    const input={
      party:"solo",
      fun:method==="sabiki"?"easy_catch":"cast_wait",
      bait:method==="sabiki"?"low_mess":"no_worm",
      take_home:"no",
      carry:"compact",
      budget,
      owned:[]
    };
    if(eligibleForCategory([product],{input,plan:{methodId:method},categoryId:"rod_reel",now}).length){
      return {method,budget,input};
    }
  }
  return null;
}

export function requiredCoverageScore(checklist,coveredIds){
  const required=(checklist||[]).filter(item=>item.priority==="required");
  if(!required.length)return 0;
  const covered=new Set(coveredIds||[]);
  return Math.round(required.filter(item=>covered.has(item.id)).length/required.length*100);
}
