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
  assert.equal(await page.locator('.world-object[data-inspect="chair"][data-chair-pose="mirrored"]').count(),1);
  await next();await next();await select('[data-answer="autumn"]');await next();
  await select('[data-answer="daytrip"]');
  assert.equal(await page.locator('.world-object[data-inspect="tent"]').count(),0);
  assert(await page.locator('[data-scene-preview="night"]').isDisabled());
  await select('[data-answer="one_night"]');
  await snap("tent");
  await next();await select('[data-answer="no_car"]');await next();
  await select('[data-experience="bonfire"]');await select('[data-experience="coffee"]');
  if(width<=390){
    await page.locator('[data-experience="easy"]').scrollIntoViewIfNeeded();
    const mini=page.locator('.studio-mobile-feedback');
    assert(await mini.isVisible(),"long experience chooser needs a live mini scene");
    const rect=await mini.boundingBox();
    assert(rect&&rect.y>=0&&rect.y<160,"mini preview must stay near viewport top while scrolling");
    assert.equal(await mini.locator('[data-mini-role="fire_pit"]').count(),1);
    assert.equal(await mini.locator('[data-inspect]').count(),0,"mini view must have no duplicate actions");
    assert.match(await mini.locator('.studio-mobile-feedback-count').innerText(),/選択中/);
    await snap("mobile-live-feedback");
  }
  // The old ::after looked 44px wide, but the button itself was only 5% of
  // the scene. Test the ACTUAL hit rectangle and unchanged camera-scale sprite.
  for(const id of ["led_lantern","kettle"]){
    const prop=page.locator('.sim-visual .world-object[data-inspect="'+id+'"]').first();
    await prop.waitFor();
    const box=await prop.evaluate(el=>{
      const btn=el.getBoundingClientRect();
      const img=el.querySelector("img").getBoundingClientRect();
      const frame=el.closest(".world-frame").getBoundingClientRect();
      return {hitWidth:btn.width,hitHeight:btn.height,spriteWidth:img.width,frameWidth:frame.width};
    });
    assert(box.hitWidth>=43.5&&box.hitHeight>=43.5,id+": actual tap rectangle must be at least 44px");
    assert(Math.abs(box.spriteWidth-box.frameWidth*.05)<2,id+": sprite scale must not grow with tap area");
    await prop.click();
    assert.match(await page.locator('.world-dialog[open]').innerText(),new RegExp(id==="kettle"?"ケトル":"ランタン"));
    await page.keyboard.press("Escape");
  }
  await page.reload();await page.locator('[data-inspect="tent"]').first().waitFor();
  const snapshot=await saved();
  await select('[data-inspect="tent"]');
  assert.match(await page.locator('dialog[open]').innerText(),/テント ×1/);
  await page.keyboard.press("Escape");
  await select('[data-inspect="all"]');assert.match(await page.locator('dialog[open]').innerText(),/焚き火台/);
  await page.keyboard.press("Escape");
  for(const time of ["morning","evening","night"]){
   await select('[data-scene-preview="'+time+'"]');await snap(time);
   if(time==="night"){
     const frame=page.locator('.sim-visual .world-frame');
     assert.equal(await frame.getAttribute("data-fire-glow"),"true");
     const opacity=await frame.locator(".world-fire-spill").evaluate(el=>Number(getComputedStyle(el).opacity));
     assert(opacity>.5,"night floor should receive campfire spill");
   }
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
  await select('[data-go="owned"]');await select('[data-go="gear"]');
  await select('[data-go="cooking"]');await select('[data-go="budget"]');
  assert(await page.locator("[data-complete]").isDisabled());
  await page.locator('[data-status="mat"]').selectOption("buy");
  await select("[data-complete]");await page.locator(".finished-world .studio-scene").waitFor();
  await select('[data-go="schedule"]');
  await context.route("**/world/**",r=>r.abort());
  await page.goto(base+"camp/?test=1#question");
  await next();assert(await page.locator('[data-go="owned"]').first().isVisible());
  await page.goto(base+"camp/?test=1#privacy");
  page.once("dialog",dialog=>dialog.accept());
  await select("[data-delete]");assert.equal(await saved(),null);
  assert.deepEqual(errors,[]);
  results.push({engine,width,...metrics});
  await context.close();
 }
}finally{
 await browser.close();
 fs.writeFileSync(dir+"/"+engine+"-results.json",JSON.stringify(results,null,2));
}
console.log(results);
