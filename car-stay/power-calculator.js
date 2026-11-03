/** Shared 80%-usable-capacity estimate for CAR STAY and the searchable tool.
 *  This is planning arithmetic, not a promise of runtime or a safety approval.
 */
export const POWER_EFFICIENCY_ESTIMATE=0.8;

export function estimateBlanketPower({watts,hours,count=1}={}){
  const w=Number(watts), h=Number(hours), n=Number(count);
  const validW=Number.isFinite(w)&&w>0;
  const validH=Number.isFinite(h)&&h>0;
  const validCount=Number.isInteger(n)&&n>=1;
  if(!validW||!validCount){
    return {requiredWh:null,requiredOutputW:null,consumptionWh:null,estimatedEfficiency:POWER_EFFICIENCY_ESTIMATE};
  }
  const requiredOutputW=w*n;
  if(!validH){
    return {requiredWh:null,requiredOutputW,consumptionWh:null,estimatedEfficiency:POWER_EFFICIENCY_ESTIMATE};
  }
  const consumptionWh=w*h*n;
  const requiredWh=Math.ceil(consumptionWh/POWER_EFFICIENCY_ESTIMATE);
  if(!Number.isSafeInteger(requiredWh)||!Number.isFinite(requiredOutputW)){
    return {requiredWh:null,requiredOutputW:null,consumptionWh:null,estimatedEfficiency:POWER_EFFICIENCY_ESTIMATE};
  }
  return {requiredWh,requiredOutputW,consumptionWh,estimatedEfficiency:POWER_EFFICIENCY_ESTIMATE};
}
