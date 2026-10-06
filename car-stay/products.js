import {measurementFitPlan,productEligible} from "./engine.js";
export function recommendations(products,context){
  const byGap={};
  if(context.status==="CHANGE_PLAN")return byGap;
  for(const gap of context.gaps||[]){
    byGap[gap.id]=(products||[])
      .filter(p=>{
        if(!productEligible(p,{vehicleId:context.vehicleId,config:context.config,gapId:gap.id,now:context.now??Date.now(),measurements:context.measurements||{},sleep:context.sleep||{}}))return false;
        const role=p.recommendationRole||"beginner_default";
        if(role==="frequent_user_upgrade"&&!context.allowUpgrades)return false;
        return ["beginner_default","beginner_alternative","frequent_user_upgrade"].includes(role);
      })
      .map(p=>{
        if(p.fitStrategy!=="measurement")return {...p,recommendedQty:1};
        const plan=measurementFitPlan(p,{measurements:context.measurements||{},sleep:context.sleep||{}});
        return {...p,recommendedQty:plan?.quantity||1,measurementPlan:plan};
      })
      .sort((a,b)=>{
        const fitRank=p=>(p.fitStrategy==="measurement"?1:2);
        const fitDiff=fitRank(b)-fitRank(a);
        if(fitDiff)return fitDiff;
        const roleRank={beginner_default:3,beginner_alternative:2,frequent_user_upgrade:1};
        const roleDiff=(roleRank[b.recommendationRole||"beginner_default"]||0)-(roleRank[a.recommendationRole||"beginner_default"]||0);
        return roleDiff||((b.score||0)-(a.score||0));
      })
      .slice(0,3);
  }
  return byGap;
}
