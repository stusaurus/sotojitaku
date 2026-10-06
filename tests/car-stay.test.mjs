import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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

test("CAR STAY audit shards keep the current seed load at five items or fewer per shard",()=>{
  const seeds=fs.readdirSync(new URL("../car-stay/data/product-seeds/",import.meta.url)).filter(name=>name.endsWith(".json"));
  const workflow=fs.readFileSync(new URL("../.github/workflows/refresh-car-stay-products.yml",import.meta.url),"utf8");
  const matrix=workflow.match(/shard:\s*\[([^\]]+)\]/);
  assert.ok(matrix,"shard matrix must exist");
  const shardCount=matrix[1].split(",").map(x=>x.trim()).filter(Boolean).length;
  const envTotal=Number(workflow.match(/CAR_STAY_REFRESH_SHARD_TOTAL:\s*\'(\d+)\'/)?.[1]);
  assert.equal(envTotal,shardCount);
  assert.ok(Math.ceil(seeds.length/shardCount)<=5,seeds.length+" seeds across "+shardCount+" shards is too dense");
});

test("CAR STAY product workflow blocks stale audit definitions from publishing",()=>{
  const workflow=fs.readFileSync(new URL("../.github/workflows/refresh-car-stay-products.yml",import.meta.url),"utf8");
  assert.match(workflow,/git diff --quiet "\$GITHUB_SHA" origin\/main/);
  assert.match(workflow,/skip stale catalog publish/);
  assert.match(workflow,/car-stay\/data\/product-seeds/);
});

test("N-BOX Slope is not offered through the standard sleep profile",()=>{
  const data=JSON.parse(fs.readFileSync(new URL("../car-stay/data/vehicles.json",import.meta.url),"utf8"));
  const vehicle=data.vehicles.find(v=>v.vehicleId==="honda-nbox-jf5-jf6");
  const allowed=(vehicle.config?.validConfigs||[]).map(x=>x.trim);
  assert.ok(allowed.includes("N-BOX"));
  assert.ok(allowed.includes("N-BOX Custom"));
  assert.ok(allowed.includes("N-BOX JOY"));
  assert.ok(!allowed.includes("N-BOX Slope"));
});


test("live CAR STAY catalog only references supported vehicle configurations",()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL("../car-stay/data/audited-products.json",import.meta.url),"utf8"));
  const vehicleData=JSON.parse(fs.readFileSync(new URL("../car-stay/data/vehicles.json",import.meta.url),"utf8"));
  const vehicleMap=new Map(vehicleData.vehicles.map(v=>[v.vehicleId,v]));
  const allowedProductGaps=new Set(["privacy_full","floor_step","sleep_surface","power_capacity","thermal_warmth","frequent_use_bed"]);
  const ids=new Set();

  for(const product of catalog.products||[]){
    assert.ok(product.productId&&!ids.has(product.productId),"duplicate/missing productId: "+product.productId);
    ids.add(product.productId);
    assert.ok((product.gapIds||[]).length>0,product.productId+" needs at least one gap");
    for(const gap of product.gapIds)assert.ok(allowedProductGaps.has(gap),product.productId+" has unsupported gap "+gap);

    for(const fit of product.vehicleFit||[]){
      const vehicle=vehicleMap.get(fit.vehicleId);
      assert.ok(vehicle,product.productId+" references unknown vehicle "+fit.vehicleId);
      const valid=vehicle.config?.validConfigs;
      if(valid?.length){
        const matching=valid.filter(vc=>{
          if(fit.seatCounts?.length&&!fit.seatCounts.includes(Number(vc.seatCount)))return false;
          if(fit.trims?.length&&!fit.trims.includes(vc.trim))return false;
          if(fit.exclusions?.includes(vc.trim))return false;
          return true;
        });
        assert.ok(matching.length>0,product.productId+" has no valid config for "+fit.vehicleId);
      }else{
        if(fit.seatCounts?.length&&vehicle.config?.seatCounts?.length){
          for(const seat of fit.seatCounts)assert.ok(vehicle.config.seatCounts.includes(Number(seat)),product.productId+" has invalid seat count "+seat);
        }
        if(fit.trims?.length&&vehicle.config?.trims?.length){
          for(const trim of fit.trims)assert.ok(vehicle.config.trims.includes(trim),product.productId+" has invalid trim "+trim);
        }
      }
    }
  }
});

test("every live catalog item is actually recommendable for at least one declared fit",()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL("../car-stay/data/audited-products.json",import.meta.url),"utf8"));
  const vehicleData=JSON.parse(fs.readFileSync(new URL("../car-stay/data/vehicles.json",import.meta.url),"utf8"));
  const vehicleMap=new Map(vehicleData.vehicles.map(v=>[v.vehicleId,v]));

  for(const product of catalog.products||[]){
    let surfaced=false;
    for(const fit of product.vehicleFit||[]){
      const vehicle=vehicleMap.get(fit.vehicleId);
      if(!vehicle)continue;
      let configs=[{}];
      if(vehicle.config?.validConfigs?.length){
        configs=vehicle.config.validConfigs.filter(vc=>{
          if(fit.seatCounts?.length&&!fit.seatCounts.includes(Number(vc.seatCount)))return false;
          if(fit.trims?.length&&!fit.trims.includes(vc.trim))return false;
          if(fit.exclusions?.includes(vc.trim))return false;
          return true;
        });
      }else{
        const seats=fit.seatCounts?.length?fit.seatCounts:(vehicle.config?.seatCounts?.length?vehicle.config.seatCounts:[undefined]);
        const trims=fit.trims?.length?fit.trims:(vehicle.config?.trims?.length?vehicle.config.trims:[undefined]);
        configs=[];
        for(const seatCount of seats)for(const trim of trims){
          const config={};
          if(seatCount!==undefined)config.seatCount=seatCount;
          if(trim!==undefined)config.trim=trim;
          configs.push(config);
        }
      }

      for(const config of configs){
        for(const gapId of product.gapIds||[]){
          const ok=productEligible(product,{
            vehicleId:fit.vehicleId,
            config,
            gapId,
            now:Date.parse(product.verifiedAt)+60*60*1000
          });
          if(ok){surfaced=true;break;}
        }
        if(surfaced)break;
      }
      if(surfaced)break;
    }
    assert.ok(surfaced,product.productId+" is live but can never surface through the current eligibility rules");
  }
});

test("CHANGE_PLAN never exposes live catalog products",()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL("../car-stay/data/audited-products.json",import.meta.url),"utf8"));
  const sample=(catalog.products||[])[0];
  if(!sample)return;
  const fit=sample.vehicleFit[0];
  const out=recommendations([sample],{
    gaps:(sample.gapIds||[]).map(id=>({id})),
    vehicleId:fit.vehicleId,
    config:{seatCount:fit.seatCounts?.[0],trim:fit.trims?.[0]},
    status:"CHANGE_PLAN",
    now:Date.parse(sample.verifiedAt)+60*60*1000
  });
  assert.deepEqual(out,{});
});
