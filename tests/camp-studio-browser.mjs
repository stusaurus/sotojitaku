import assert from "node:assert/strict";
import fs from "node:fs";
import {chromium} from "playwright";

const base=process.env.CAMP_BASE||"http://127.0.0.1:4173/";
const publicCamp="https://stusaurus.github.io/sotojitaku/camp/?test=1";
const proofDir="browser-proof/public";
fs.mkdirSync(proofDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
try{
 for(const width of [320,390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:"reduce"});
  await context.route(/googletagmanager|google-analytics/,r=>r.fulfill({status:200,body:""}));
  const page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  const publicPage=await context.newPage();
  let baseline="captured";
  try{
   await publicPage.goto(publicCamp,{waitUntil:"domcontentloaded",timeout:25000});
   await publicPage.locator("#main [data-start]").first().waitFor({timeout:15000});
   await publicPage.locator("#main [data-start]").first().click();
   await publicPage.locator(".sim-visual img").first().evaluate(img=>img.decode());
   await publicPage.locator(".simulator").screenshot({path:proofDir+"/camp-studio-before-"+width+".png"});
  }catch(error){baseline="unavailable: "+error.message.slice(0,160);}
  await publicPage.close();
  await page.goto(base+"camp/?test=1");
  await page.locator("#main [data-start]").first().waitFor();
  await page.locator("#main [data-start]").first().click();
  await page.locator(".studio-scene[data-studio-time='morning']").waitFor();
  await page.waitForFunction(()=>{const img=document.querySelector(".studio-image");return img&&img.complete&&img.naturalWidth>0});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,"initial "+width+" overflow");
  await page.locator(".simulator").screenshot({path:proofDir+"/camp-studio-after-"+width+".png"});
  await page.locator('[data-answer="family"]').click();
  assert.match(await page.locator(".studio-chip-row").innerText(),/家族・4人/);
  const storedBefore=await page.evaluate(()=>localStorage.getItem("sotojitaku_camp_v1"));
  const viewsBefore=await page.evaluate(()=>window.dataLayer.filter(x=>x[0]==="event"&&x[1]==="page_view").length);
  await page.locator('[data-scene-preview="evening"]').click();
  assert.equal(await page.locator(".studio-scene").getAttribute("data-studio-time"),"evening");
  assert.equal(await page.evaluate(()=>localStorage.getItem("sotojitaku_camp_v1")),storedBefore,"preview changed plan");
  assert.equal(await page.evaluate(()=>window.dataLayer.filter(x=>x[0]==="event"&&x[1]==="page_view").length),viewsBefore,"preview caused extra page view");
  await page.locator('[data-next]').click();
  await page.locator('[data-next]').click();
  await page.locator('[data-answer="autumn"]').click();
  await page.locator('[data-next]').click();
  await page.locator('[data-answer="one_night"]').click();
  await page.locator('[data-next]').click();
  await page.locator('[data-answer="no_car"]').click();
  await page.locator('[data-next]').click();
  await page.locator('[data-experience="bonfire"]').click();
  assert.equal(await page.locator(".studio-scene").getAttribute("data-studio-variant"),"bonfire");
  await page.waitForFunction(()=>{const img=document.querySelector(".studio-image");return img&&img.complete&&img.naturalWidth>0});
  await page.locator(".simulator").screenshot({path:proofDir+"/camp-studio-bonfire-"+width+".png"});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,"bonfire "+width+" overflow");
  await page.locator('[data-next]').click();
  await page.locator('[data-next]').click();
  await page.locator('[data-go="owned"]').first().waitFor();
  const complete=await page.evaluate(()=>window.dataLayer.filter(x=>x[0]==="event"&&x[1]==="journey_step_complete").length);
  assert.equal(complete,7,"seven original question completions must remain");
  assert.deepEqual(errors,[],"browser page errors");
  results.push({width,status:"PASS",baseline,complete,previewPlanImmutable:true,scenePhotosLoaded:true});
  await context.close();
 }
}finally{
 fs.writeFileSync(proofDir+"/camp-studio-browser-results.json",JSON.stringify(results,null,2));
 await browser.close();
}
console.log("CAMP Scene Studio visual/browser QA:",JSON.stringify(results));
