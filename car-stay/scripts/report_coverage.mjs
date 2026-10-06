import fs from "node:fs";
import path from "node:path";
import {recommendations} from "../products.js";

const ROOT=path.resolve(import.meta.dirname,"../..");
const vehicles=JSON.parse(fs.readFileSync(path.join(ROOT,"car-stay/data/vehicles.json"),"utf8")).vehicles||[];
const catalog=JSON.parse(fs.readFileSync(path.join(ROOT,"car-stay/data/audited-products.json"),"utf8"));
const products=catalog.products||[];
const now=Date.now();

function configsFor(vehicle){
  if(vehicle.config?.validConfigs?.length){
    return vehicle.config.validConfigs.map(config=>({...config}));
  }
  const seats=vehicle.config?.seatCounts?.length?vehicle.config.seatCounts:[null];
  const trims=vehicle.config?.trims?.length?vehicle.config.trims:[null];
  const configs=[];
  for(const seatCount of seats)for(const trim of trims){
    const config={};
    if(seatCount!==null)config.seatCount=seatCount;
    if(trim!==null)config.trim=trim;
    configs.push(config);
  }
  return configs;
}
function eligible(vehicleId,config,gapId){
  const result=recommendations(products,{gaps:[{id:gapId}],vehicleId,config,status:"ALMOST_READY",now,allowUpgrades:false});
  return result[gapId]||[];
}
function uniqueById(items){
  return [...new Map(items.map(x=>[x.productId,x])).values()];
}
const rows=[];
for(const vehicle of vehicles){
  for(const config of configsFor(vehicle)){
    const privacy=eligible(vehicle.vehicleId,config,"privacy_full");
    const floor=eligible(vehicle.vehicleId,config,"floor_step");
    const surface=eligible(vehicle.vehicleId,config,"sleep_surface");
    const sleep=uniqueById([...floor,...surface]);
    rows.push({
      vehicleId:vehicle.vehicleId,
      vehicle:vehicle.shortLabel||vehicle.label,
      config,
      privacy:{count:privacy.length,productIds:privacy.map(p=>p.productId)},
      sleep:{count:sleep.length,productIds:sleep.map(p=>p.productId)},
      floor:{count:floor.length,productIds:floor.map(p=>p.productId)},
      surface:{count:surface.length,productIds:surface.map(p=>p.productId)}
    });
  }
}
const byVehicle=[];
for(const vehicle of vehicles){
  const vr=rows.filter(r=>r.vehicleId===vehicle.vehicleId);
  const privacyCovered=vr.filter(r=>r.privacy.count>0).length;
  const sleepCovered=vr.filter(r=>r.sleep.count>0).length;
  byVehicle.push({
    vehicleId:vehicle.vehicleId,
    vehicle:vehicle.shortLabel||vehicle.label,
    configurations:vr.length,
    privacyCovered,
    sleepCovered,
    privacyCoveragePct:Math.round(privacyCovered/vr.length*100),
    sleepCoveragePct:Math.round(sleepCovered/vr.length*100)
  });
}
const measuredFallbacks=products.filter(p=>{
  const role=p.recommendationRole||"beginner_default";
  return p.fitStrategy==="measurement"&&["beginner_default","beginner_alternative"].includes(role);
});
const hasMeasuredSleepFallback=measuredFallbacks.some(p=>(p.gapIds||[]).includes("sleep_surface"));
const holes=rows.flatMap(r=>{
  const out=[];
  if(r.privacy.count===0)out.push({priority:1,type:"privacy_full",vehicleId:r.vehicleId,vehicle:r.vehicle,config:r.config,measurementFallback:false});
  if(r.sleep.count===0)out.push({priority:2,type:"sleep",vehicleId:r.vehicleId,vehicle:r.vehicle,config:r.config,measurementFallback:hasMeasuredSleepFallback});
  return out;
}).sort((a,b)=>a.priority-b.priority||a.vehicle.localeCompare(b.vehicle,"ja"));

const privacyCoveredCount=rows.filter(r=>r.privacy.count>0).length;
const sleepCoveredCount=rows.filter(r=>r.sleep.count>0).length;
const measurementFallbackHoleCount=holes.filter(h=>h.measurementFallback).length;
const unmonetizedHoleCount=holes.filter(h=>!h.measurementFallback).length;
const monetizableConfigCount=rows.length-unmonetizedHoleCount;

const report={
  version:1,
  generatedAt:new Date().toISOString(),
  catalogUpdatedAt:catalog.updatedAt||null,
  liveProductCount:products.length,
  summary:{
    configurations:rows.length,
    privacyCovered:privacyCoveredCount,
    sleepCovered:sleepCoveredCount,
    privacyCoveragePct:Math.round(privacyCoveredCount/rows.length*100),
    sleepCoveragePct:Math.round(sleepCoveredCount/rows.length*100),
    monetizableConfigurations:monetizableConfigCount,
    monetizableCoveragePct:Math.round(monetizableConfigCount/rows.length*100),
    revenueHoles:holes.length,
    measurementFallbackProducts:measuredFallbacks.length,
    measurementFallbackHoles:measurementFallbackHoleCount,
    unmonetizedHoles:unmonetizedHoleCount
  },
  byVehicle,
  holes,
  configurations:rows
};
const output=process.argv[2]||path.join(ROOT,"car-stay/data/coverage-report.json");
fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");
console.log("CAR STAY coverage:",JSON.stringify(report.summary));
for(const h of holes.slice(0,20))console.log("HOLE",h.type,h.vehicleId,JSON.stringify(h.config));
