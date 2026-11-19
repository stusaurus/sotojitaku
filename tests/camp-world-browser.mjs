import assert from "node:assert/strict";
import fs from "node:fs";
import {chromium,webkit} from "playwright";

const engine=process.env.STUDIO_ENGINE||"chromium";
const browser=await ({chromium,webkit}[engine]).launch({
  executablePath:process.env.BROWSER_BINARY||undefined
});
const base=process.env.CAMP_BASE||"http://127.0.0.1:4173/";
const dir=process.env.PROOF_DIR||"browser-proof/world";
fs.mkdirSync(dir,{recursive:true});
const results=[];
try{
 for(const width of [320,390,768,1024,1440]){
  const context=await browser.newContext({viewport:{width,height:width<500?844:900},locale:"ja-JP",reducedMotion:"reduce"});
  await context.route(/google-analytics|googletagmanager|fonts.googleapis|fonts.gstatic/,r=>r.abort());
  const page=await context.newPage();
  page.setDefaultTimeout(9000);
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  const select=s=>page.locator(s).first().click();
  const next=()=>select("[data-next]");
  const saved=()=>page.evaluate(()=>localStorage.getItem("sotojitaku_camp_v1"));
  const snap=async name=>{
   await page.locator('.studio-scene img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
   await page.screenshot({path:dir+"/"+engine+"-"+width+"-"+name+".jpg",quality:83});
  };
  if(process.env.BASELINE){
   await page.goto(process.env.BASELINE+"camp/?test=1");
   await select("#main [data-start]");
   await page.locator(".studio-image").evaluate(img=>img.decode());
   await page.screenshot({path:dir+"/"+engine+"-"+width+"-before.jpg",quality:83});
  }
  await page.goto(base+"camp/?test=1");
  await select("#main [data-start]");
  assert.equal(await page.locator(".world-object").count(),0);
  await snap("initial");
  await select('[data-answer="family"]');
  assert.equal(await page.locator('.world-object[data-inspect="chair"]').count(),4);
  await next();await next();await select('[data-answer="autumn"]');await next();
  await select('[data-answer="daytrip"]');
  assert.equal(await page.locator('.world-object[data-inspect="tent"]').count(),0);
  assert(await page.locator('[data-scene-preview="night"]').isDisabled());
  await select('[data-answer="one_night"]');
  await snap("tent");
  await next();await select('[data-answer="no_car"]');await next();
  await select('[data-experience="bonfire"]');await select('[data-experience="coffee"]');
  await page.reload();await page.locator('[data-inspect="tent"]').first().waitFor();
  const snapshot=await saved();
  await select('[data-inspect="tent"]');
  assert.match(await page.locator('dialog[open]').innerText(),/テント ×1/);
  await page.keyboard.press("Escape");
  await select('[data-inspect="all"]');assert.match(await page.locator('dialog[open]').innerText(),/焚き火台/);
  await page.keyboard.press("Escape");
  for(const time of ["morning","evening","night"]){
   await select('[data-scene-preview="'+time+'"]');await snap(time);
   assert.equal(await saved(),snapshot);
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const metrics=await page.evaluate(()=>({
   sceneBytes:performance.getEntriesByType("resource").filter(r=>r.name.includes("/world/")).reduce((s,r)=>s+r.encodedBodySize,0),
   heapBytes:performance.memory?.usedJSHeapSize||null
  }));
  await select("[data-back-question]");await next();await next();
  await select('[data-answer="30000"]');assert.match(await page.locator(".world-note").innerText(),/30,000/);
  await next();await select('[data-go="owned"]');await select('[data-owned="tent"]');await select('[data-go="gear"]');
  await page.locator('[data-status="tent"]').selectOption("rent");
  await page.locator('[data-status="mat"]').selectOption("skip");
  await page.goto(base+"camp/?test=1#provisional");
  await select('[data-inspect="tent"]');assert.match(await page.locator('dialog[open]').innerText(),/レンタル予定/);
  await page.keyboard.press("Escape");
  await context.route("**/world/**",r=>r.abort());
  await page.goto(base+"camp/?test=1#question");
  await next();assert(await page.locator('[data-go="owned"]').first().isVisible());
  assert.deepEqual(errors,[]);
  results.push({engine,width,...metrics});
  await context.close();
 }
}finally{
 await browser.close();
 fs.writeFileSync(dir+"/"+engine+"-results.json",JSON.stringify(results,null,2));
}
console.log(results);
