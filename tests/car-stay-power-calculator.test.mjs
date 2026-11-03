import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {estimateBlanketPower, POWER_EFFICIENCY_ESTIMATE} from "../car-stay/power-calculator.js";
import {evaluate} from "../car-stay/engine.js";

const read=(path)=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Wh formula is the same as the existing CAR STAY Builder",()=>{
  assert.equal(POWER_EFFICIENCY_ESTIMATE,0.8);
  assert.deepEqual(estimateBlanketPower({watts:50,hours:2,count:1}),{
    requiredWh:125,requiredOutputW:50,consumptionWh:100,estimatedEfficiency:0.8
  });
  const vehicle={vehicleId:"demo",geometry:{usableLengthMm:2200,usableWidthMm:1200},floorGrade:"flat"};
  const result=evaluate({
    people:[{type:"adult",height:171}],weather:{status:"known",minC:12,maxC:20},
    placeType:"rv_park",tripStyle:"sleep_only",gear:[],devices:["electric_blanket"],
    powerUse:{blanketW:50,hours:2},floorObservation:"flat",
    measurements:{lengthMm:2200,widthMm:1200},sleepEngineOn:false,openFlameInside:false
  },vehicle);
  assert.equal(result.power.requiredWh,125);
  assert.equal(result.power.requiredOutputW,50);
});

test("Multiple simultaneous blankets add both W output and Wh capacity requirements",()=>{
  const result=estimateBlanketPower({watts:50,hours:8,count:2});
  assert.equal(result.consumptionWh,800);
  assert.equal(result.requiredWh,1000);
  assert.equal(result.requiredOutputW,100);
  assert.equal(estimateBlanketPower({watts:50,hours:1,count:1}).requiredWh,63);
});

test("Unspecified or invalid device data never becomes a zero-capacity recommendation",()=>{
  for(const input of [
    {watts:0,hours:8,count:1},
    {watts:50,hours:0,count:1},
    {watts:50,hours:8,count:0},
    {watts:50,hours:8,count:1.5},
    {watts:-20,hours:8,count:1},
    {watts:Infinity,hours:8,count:1},
  ])assert.equal(estimateBlanketPower(input).requiredWh,null,JSON.stringify(input));
  assert.equal(estimateBlanketPower({watts:55,hours:0}).requiredOutputW,55);
});

test("Power landing page has one indexable canonical and a direct Builder handoff",()=>{
  const html=read("car-stay/power/index.html");
  const parent=read("car-stay/index.html");
  const hub=read("car-stay/car/index.html");
  const sitemap=read("sitemap.xml");
  const target="https://stusaurus.github.io/sotojitaku/car-stay/power/";
  assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
  assert.ok(html.includes(`rel="canonical" href="${target}"`));
  assert.ok(sitemap.includes(`<loc>${target}</loc><lastmod>2026-11-03</lastmod>`));
  assert.ok(parent.includes('href="./power/"'));
  assert.ok(hub.includes('href="../power/"'));
  assert.ok(html.includes('href="../?from=power-calculator&amp;entry=blanket-power"'));
  assert.match(html,/name="description"/);
  assert.match(html,/BreadcrumbList/);
  assert.match(html,/WebApplication/);
  assert.match(html,/NITE/);
  assert.match(html,/www\.nite\.go\.jp/);
  assert.match(html,/www\.jackery\.jp/);
  assert.ok(!html.includes('href="https://hb.afl.rakuten.co.jp/'),"calculator does not fabricate product offers");
});

test("Power landing page keeps explicit safety caveats and actionable unknown state",()=>{
  const html=read("car-stay/power/index.html");
  const js=read("car-stay/power/app.js");
  assert.match(html,/就寝中はスイッチを切る/);
  assert.match(html,/定格出力/);
  assert.match(html,/計算上/);
  assert.match(js,/ownedWh===null\|\|ownedOutput===null/);
  assert.match(js,/SOTOJITAKU_ANALYTICS\?\.optedOut/);
  assert.match(js,/operator_test/);
  assert.ok(!js.includes("localStorage"),"no personal power inputs persisted");
});
