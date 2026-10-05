import {productEligible} from "./engine.js";
export function recommendations(products,context){
  const byGap={};
  if(context.status==="CHANGE_PLAN")return byGap;
  for(const gap of context.gaps||[]){
    byGap[gap.id]=(products||[])
      .filter(p=>{
        if(!productEligible(p,{vehicleId:context.vehicleId,config:context.config,gapId:gap.id,now:context.now??Date.now()}))return false;
        const role=p.recommendationRole||"beginner_default";
        if(role==="frequent_user_upgrade"&&!context.allowUpgrades)return false;
        return ["beginner_default","beginner_alternative","frequent_user_upgrade"].includes(role);
      })
      .sort((a,b)=>{
        const roleRank={beginner_default:3,beginner_alternative:2,frequent_user_upgrade:1};
        const roleDiff=(roleRank[b.recommendationRole||"beginner_default"]||0)-(roleRank[a.recommendationRole||"beginner_default"]||0);
        return roleDiff||((b.score||0)-(a.score||0));
      })
      .slice(0,3);
  }
  return byGap;
}
