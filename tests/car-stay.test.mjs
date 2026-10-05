import test from "node:test";
import assert from "node:assert/strict";
import {evaluate,productEligible,DEFAULT_RULES,resolvedVehicleProfile} from "../car-stay/engine.js";
import {recommendations} from "../car-stay/products.js";

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


test("unknown-floor vehicle only gets a floor gap after the user observes one",()=>{
  const vehicle={vehicleId:"test-unknown-floor",geometry:{usableLengthMm:1900,usableWidthMm:1200},floorGrade:"unknown"};
  const common={...base,people:[{type:"adult",height:171}],placeType:"rv_park",measurements:{},gear:[{gearId:"mobile_battery",capabilities:["usb_power"]}]};
  const unknown=evaluate({...common,floorObservation:"unknown"},vehicle,DEFAULT_RULES);
  assert.equal(unknown.gaps.some(g=>g.id==="floor_step"),false);
  const observed=evaluate({...common,floorObservation:"noticeable"},vehicle,DEFAULT_RULES);
  assert.equal(observed.gaps.some(g=>g.id==="floor_step"),true);
});

test("flat floor observation never creates a mat-selling gap on unknown floor data",()=>{
  const vehicle={vehicleId:"test-flat-floor",geometry:{usableLengthMm:1900,usableWidthMm:1200},floorGrade:"unknown"};
  const r=evaluate({...base,people:[{type:"adult",height:171}],floorObservation:"flat"},vehicle,DEFAULT_RULES);
  assert.equal(r.gaps.some(g=>g.id==="floor_step"),false);
  assert.equal(r.floor.state,"flat");
});


test("Sienta 5-seat uses verified 2045mm profile while 7-seat remains unknown",()=>{
  const v={vehicleId:"toyota-sienta-10-15",geometry:{usableLengthMm:null,usableWidthMm:null},floorGrade:"unknown",sleepProfiles:[
    {when:{seatCount:5},geometry:{usableLengthMm:2045,usableWidthMm:null},floorGrade:"B"}
  ]};
  assert.equal(resolvedVehicleProfile(v,{seatCount:5}).geometry.usableLengthMm,2045);
  assert.equal(resolvedVehicleProfile(v,{seatCount:7}).geometry.usableLengthMm,null);
});

test("FREED CROSSTAR 5-seat resolves Honda measured 1970mm and 25mm step",()=>{
  const v={vehicleId:"honda-freed-gt",geometry:{usableLengthMm:null,usableWidthMm:null},floorGrade:"unknown",sleepProfiles:[
    {when:{seatCount:5,trim:"CROSSTAR"},geometry:{usableLengthMm:1970,usableWidthMm:null},floorGrade:"C",floorStepMm:25}
  ]};
  const p=resolvedVehicleProfile(v,{seatCount:5,trim:"CROSSTAR"});
  assert.equal(p.geometry.usableLengthMm,1970);
  assert.equal(p.floorGrade,"C");
  assert.equal(p.floorStepMm,25);
  assert.equal(resolvedVehicleProfile(v,{seatCount:6,trim:"CROSSTAR"}).geometry.usableLengthMm,null);
});

test("verified vehicle geometry removes only the confirmed length QUICK MEASURE",()=>{
  const v={vehicleId:"honda-nvan-jj1-jj2",geometry:{usableLengthMm:2300,usableWidthMm:null},floorGrade:"A"};
  const r=evaluate({...base,people:[{type:"adult",height:171}],config:{}},v,DEFAULT_RULES);
  assert.equal(r.sleep.needsQuickMeasure.includes("length"),false);
  assert.equal(r.sleep.lengthState,"comfort");
});


test("flat verified floor with no padding creates a sleep-surface gap",()=>{
  const vehicle={vehicleId:"flat-car",geometry:{usableLengthMm:1900,usableWidthMm:1200},floorGrade:"A"};
  const r=evaluate({...base,people:[{type:"adult",height:171}],gear:[{gearId:"mobile_battery",capabilities:["usb_power"]}],floorObservation:"flat"},vehicle,DEFAULT_RULES);
  assert.equal(r.gaps.some(g=>g.id==="sleep_surface"),true);
  assert.equal(r.gaps.some(g=>g.id==="floor_step"),false);
});

test("home padding resolves the sleep-surface gap without shopping",()=>{
  const vehicle={vehicleId:"flat-car",geometry:{usableLengthMm:1900,usableWidthMm:1200},floorGrade:"A"};
  const r=evaluate({...base,people:[{type:"adult",height:171}],gear:[{gearId:"blanket",capabilities:["warmth","padding","gap_fill"]}],floorObservation:"flat"},vehicle,DEFAULT_RULES);
  assert.equal(r.gaps.some(g=>g.id==="sleep_surface"),false);
  assert.ok(r.resolved.includes("sleep_surface"));
});

test("floor-step gap absorbs sleep-surface need instead of duplicating it",()=>{
  const vehicle={vehicleId:"step-car",geometry:{usableLengthMm:1900,usableWidthMm:1200},floorGrade:"C"};
  const r=evaluate({...base,people:[{type:"adult",height:171}],gear:[],floorObservation:"unknown"},vehicle,DEFAULT_RULES);
  assert.equal(r.gaps.filter(g=>g.id==="floor_step").length,1);
  assert.equal(r.gaps.some(g=>g.id==="sleep_surface"),false);
});


test("beginner results suppress frequent-user upgrades unless explicitly allowed",()=>{
  const item=id=>"https://item.rakuten.co.jp/shop/"+id+"/";
  const product=(id,role,score)=>({
    productId:id,gapIds:["sleep_surface"],recommendationRole:role,score,
    verifiedAt:"2026-10-05T00:00:00Z",audit:{status:"verified_live"},
    price:10000,image:"https://thumbnail.image.rakuten.co.jp/"+id+".jpg",
    itemUrl:item(id),affiliateUrl:"https://hb.afl.rakuten.co.jp/hgc/x/?pc="+encodeURIComponent(item(id)),
    vehicleFit:[{vehicleId:nbox.vehicleId,status:"verified"}]
  });
  const products=[
    product("default","beginner_default",80),
    product("alternative","beginner_alternative",99),
    product("upgrade","frequent_user_upgrade",100)
  ];
  const baseContext={gaps:[{id:"sleep_surface"}],vehicleId:nbox.vehicleId,config:{},status:"ALMOST_READY",now:Date.parse("2026-10-05T12:00:00Z")};
  const beginner=recommendations(products,baseContext).sleep_surface;
  assert.deepEqual(beginner.map(p=>p.productId),["default","alternative"]);
  const withUpgrade=recommendations(products,{...baseContext,allowUpgrades:true}).sleep_surface;
  assert.deepEqual(withUpgrade.map(p=>p.productId),["default","alternative","upgrade"]);
});
