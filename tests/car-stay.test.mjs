import test from "node:test";
import assert from "node:assert/strict";
import {evaluate,productEligible,DEFAULT_RULES} from "../car-stay/engine.js";

const nbox={vehicleId:"honda-nbox-jf5-jf6",geometry:{usableLengthMm:1800,usableWidthMm:null},floorGrade:"C"};
const base={
  people:[{type:"adult",height:171},{type:"adult",height:160}],
  tripStyle:"onsen",
  placeType:"rv_park",
  weather:{status:"known",minC:8,maxC:18},
  gear:[
    {gearId:"blanket",capabilities:["warmth","padding","gap_fill"]},
    {gearId:"mobile_battery",capabilities:["usb_power"]}
  ],
  devices:[],measurements:{},sleepEngineOn:false,openFlameInside:false
};

test("N-BOX two adults with unknown width requires QUICK MEASURE",()=>{
  const r=evaluate(base,nbox,DEFAULT_RULES);
  assert.equal(r.status,"CHALLENGE");
  assert.ok(r.sleep.needsQuickMeasure.includes("width"));
});

test("measured width clears width-unknown branch",()=>{
  const r=evaluate({...base,measurements:{widthMm:1150}},nbox,DEFAULT_RULES);
  assert.equal(r.sleep.needsQuickMeasure.includes("width"),false);
});

test("hot night blocks even with fan",()=>{
  const r=evaluate({...base,weather:{status:"known",minC:27,maxC:33},gear:[...base.gear,{gearId:"fan",capabilities:["air_movement"]}]},nbox,DEFAULT_RULES);
  assert.equal(r.status,"CHANGE_PLAN");
  assert.ok(r.issues.some(x=>x.id==="heat"));
});

test("road station is never treated as normal lodging",()=>{
  const r=evaluate({...base,placeType:"road_station"},nbox,DEFAULT_RULES);
  assert.equal(r.status,"CHALLENGE");
  assert.ok(r.gaps.some(x=>x.id==="authorized_place_unconfirmed"));
});

test("idling while sleeping hard-blocks",()=>{
  const r=evaluate({...base,sleepEngineOn:true},nbox,DEFAULT_RULES);
  assert.equal(r.status,"CHANGE_PLAN");
});

test("unverified products never produce a purchase recommendation",()=>{
  const p={productId:"x",gapIds:["privacy_full"],verifiedAt:new Date().toISOString(),audit:{status:"research_only"},vehicleFit:[{vehicleId:nbox.vehicleId,status:"verified"}]};
  assert.equal(productEligible(p,{vehicleId:nbox.vehicleId,gapId:"privacy_full"}),false);
});

test("stale products expire after seven days",()=>{
  const p={productId:"x",gapIds:["privacy_full"],verifiedAt:"2026-09-01T00:00:00Z",audit:{status:"verified_live"},vehicleFit:[{vehicleId:nbox.vehicleId,status:"verified"}]};
  assert.equal(productEligible(p,{vehicleId:nbox.vehicleId,gapId:"privacy_full",now:Date.parse("2026-10-05T00:00:00Z")}),false);
});

test("seat-count mismatch rejects vehicle-specific item",()=>{
  const p={productId:"x",gapIds:["floor_step"],verifiedAt:"2026-10-05T00:00:00Z",audit:{status:"verified_live"},vehicleFit:[{vehicleId:"toyota-sienta-10-15",status:"verified",seatCounts:[5]}]};
  assert.equal(productEligible(p,{vehicleId:"toyota-sienta-10-15",gapId:"floor_step",config:{seatCount:7},now:Date.parse("2026-10-05T12:00:00Z")}),false);
});

test("fresh exact-fit Rakuten affiliate item can pass the product gate",()=>{
  const item="https://item.rakuten.co.jp/shop/item1/";
  const aff="https://hb.afl.rakuten.co.jp/hgc/x/?pc="+encodeURIComponent(item);
  const p={productId:"x",gapIds:["privacy_full"],verifiedAt:"2026-10-05T00:00:00Z",audit:{status:"verified_live"},price:12000,image:"https://thumbnail.image.rakuten.co.jp/x.jpg",itemUrl:item,affiliateUrl:aff,vehicleFit:[{vehicleId:nbox.vehicleId,status:"verified"}]};
  assert.equal(productEligible(p,{vehicleId:nbox.vehicleId,gapId:"privacy_full",now:Date.parse("2026-10-05T12:00:00Z")}),true);
});

test("affiliate link targeting another Rakuten item is rejected",()=>{
  const item="https://item.rakuten.co.jp/shop/item1/";
  const aff="https://hb.afl.rakuten.co.jp/hgc/x/?pc="+encodeURIComponent("https://item.rakuten.co.jp/shop/item2/");
  const p={productId:"x",gapIds:["privacy_full"],verifiedAt:"2026-10-05T00:00:00Z",audit:{status:"verified_live"},price:12000,image:"https://thumbnail.image.rakuten.co.jp/x.jpg",itemUrl:item,affiliateUrl:aff,vehicleFit:[{vehicleId:nbox.vehicleId,status:"verified"}]};
  assert.equal(productEligible(p,{vehicleId:nbox.vehicleId,gapId:"privacy_full",now:Date.parse("2026-10-05T12:00:00Z")}),false);
});
