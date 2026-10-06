import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {productEligible} from "../car-stay/engine.js";
import {recommendations} from "../car-stay/products.js";

const catalog=JSON.parse(fs.readFileSync(new URL("../car-stay/data/audited-products.json",import.meta.url),"utf8"));

test("every published CAR STAY product is eligible for at least one declared fit strategy",()=>{
  for(const p of catalog.products||[]){
    const now=Date.parse(p.verifiedAt)+60*60*1000;
    let passes=false;
    if(p.fitStrategy==="measurement"){
      const fit=p.measurementFit||{};
      const width=(Number(fit.unitWidthMm)||0)*Math.min(2,Number(fit.maxUnits)||1);
      const measurements={lengthMm:Number(fit.unitLengthMm)||0,widthMm:width};
      const sleep={targetWidth:width};
      for(const gapId of p.gapIds||[]){
        if(productEligible(p,{vehicleId:"measurement",config:{},gapId,now,measurements,sleep})){passes=true;break;}
      }
    }else{
      for(const fit of p.vehicleFit||[]){
        const config={};
        if(fit.seatCounts?.length)config.seatCount=fit.seatCounts[0];
        if(fit.trims?.length)config.trim=fit.trims[0];
        for(const gapId of p.gapIds||[]){
          if(productEligible(p,{vehicleId:fit.vehicleId,config,gapId,now})){passes=true;break;}
        }
        if(passes)break;
      }
    }
    assert.equal(passes,true,p.productId+" should have at least one valid declared fit strategy");
  }
});

test("live CAR STAY recommendations are score-sorted and capped at three per gap",()=>{
  const items=(catalog.products||[]).filter(p=>p.vehicleFit?.some(f=>f.vehicleId==="honda-freed-gt"));
  if(items.length<2)return;
  const now=Date.parse(items[0].verifiedAt)+60*60*1000;
  const out=recommendations(items,{
    vehicleId:"honda-freed-gt",
    config:{seatCount:5,trim:"AIR"},
    gaps:[{id:"privacy_full"}],
    now
  }).privacy_full;
  assert.ok(out.length<=3);
  for(let i=1;i<out.length;i++)assert.ok((out[i-1].score||0)>=(out[i].score||0));
});

test("N-BOX Slope never receives trim-excluded shade or floor items",()=>{
  const items=(catalog.products||[]).filter(p=>p.vehicleFit?.some(f=>f.vehicleId==="honda-nbox-jf5-jf6"));
  if(!items.length)return;
  const now=Date.parse(items[0].verifiedAt)+60*60*1000;
  for(const p of items){
    const fit=p.vehicleFit.find(f=>f.vehicleId==="honda-nbox-jf5-jf6");
    if(!fit?.exclusions?.includes("N-BOX Slope"))continue;
    for(const gapId of p.gapIds||[]){
      assert.equal(productEligible(p,{vehicleId:"honda-nbox-jf5-jf6",config:{trim:"N-BOX Slope"},gapId,now}),false,p.productId);
    }
  }
});


test("CHANGE PLAN suppresses all product recommendations",()=>{
  const sample=(catalog.products||[])[0];
  if(!sample)return;
  const fit=sample.vehicleFit?.[0];
  const config={};
  if(fit?.seatCounts?.length)config.seatCount=fit.seatCounts[0];
  if(fit?.trims?.length)config.trim=fit.trims[0];
  const measurement=sample.fitStrategy==="measurement";
  const mf=sample.measurementFit||{};
  const width=(Number(mf.unitWidthMm)||0)*Math.min(2,Number(mf.maxUnits)||1);
  const now=Date.parse(sample.verifiedAt)+60*60*1000;
  const out=recommendations(catalog.products,{
    vehicleId:fit?.vehicleId||"measurement",
    config,
    gaps:[{id:(sample.gapIds||[])[0]}],
    status:"CHANGE_PLAN",
    now,
    measurements:measurement?{lengthMm:Number(mf.unitLengthMm)||0,widthMm:width}:{},
    sleep:measurement?{targetWidth:width}:{}
  });
  assert.deepEqual(out,{});
});
