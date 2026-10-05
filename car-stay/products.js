import {productEligible} from "./engine.js";
export function recommendations(products,context){
  const byGap={};
  for(const gap of context.gaps||[]){
    byGap[gap.id]=(products||[])
      .filter(p=>productEligible(p,{vehicleId:context.vehicleId,config:context.config,gapId:gap.id}))
      .sort((a,b)=>(b.score||0)-(a.score||0))
      .slice(0,3);
  }
  return byGap;
}
