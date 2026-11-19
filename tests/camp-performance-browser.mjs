/**
 * Synthetic performance + keyboard audit on the Draft PR candidate.
 * Measurements are lab diagnostics, NOT field Core Web Vitals or device thermals.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import {chromium} from "playwright";

const base=process.env.CAMP_BASE||"http://127.0.0.1:4173/";
const output=process.env.PROOF_DIR||"browser-proof/performance";
fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
try{
  for(const [width,slowLake] of [[390,false],[1440,false],[390,true]]){
    const context=await browser.newContext({viewport:{width,height:844},locale:"ja-JP",reducedMotion:"reduce"});
    await context.route(/googletagmanager|google-analytics|fonts.googleapis|fonts.gstatic/,route=>route.abort());
    if(slowLake){
      // Deliberately slow ONLY the new world image, not the diagnosis JSON or fonts.
      await context.route("**/camp/world/lake.webp",async route=>{
        await new Promise(resolve=>setTimeout(resolve,1200));
        await route.continue();
      });
    }
    const page=await context.newPage();
    page.setDefaultTimeout(10000);
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.addInitScript(()=>{
      window.__campLab={navigationLcp:null,cls:0,longTasks:0,twoFrameFeedbackSamples:[],sceneImageReadyMs:null};
      for(const [type,callback] of [
        ["largest-contentful-paint",entry=>window.__campLab.navigationLcp=entry.startTime],
        ["layout-shift",entry=>{if(!entry.hadRecentInput)window.__campLab.cls+=entry.value;}],
        ["longtask",entry=>window.__campLab.longTasks+=entry.duration]
      ]){
        try{new PerformanceObserver(list=>list.getEntries().forEach(callback)).observe({type,buffered:true});}
        catch{/* unsupported observers are reported as missing, never treated as success */}
      }
      document.addEventListener("click",event=>{
        const el=event.target.closest?.("button");
        if(el?.hasAttribute("data-start")){
          const started=performance.now();
          // A frame callback runs after the app's document-level click listener
          // replaces HOME with the new scene; a capture-phase microtask can run too soon.
          requestAnimationFrame(()=>{
            const image=document.querySelector(".studio-image");
            if(image&&image.decode){
              image.decode().then(()=>{
                window.__campLab.sceneImageReadyMs=Math.round(performance.now()-started);
              }).catch(()=>{window.__campLab.sceneImageReadyMs=null;});
            }
          });
        }
        if(!el||!el.matches("[data-answer],[data-experience],[data-scene-preview]"))return;
        const started=performance.now(),target=el.matches("[data-experience]")?"experience":el.matches("[data-scene-preview]")?"time":"answer";
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
          window.__campLab.twoFrameFeedbackSamples.push({target,ms:Math.round(performance.now()-started)});
        }));
      },true);
    });
    try{
      await page.goto(base+"camp/?test=1",{waitUntil:"domcontentloaded"});
      await page.locator("#main [data-start]").first().click();
      await page.locator(".studio-scene").waitFor();
      // The diagnostic must be operable even while the slow background is loading.
      assert(await page.locator(".question-title").isVisible(),"question blocked by scene image");
      await page.locator('[data-answer="family"]').click();
      await page.locator("[data-next]").focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains("question-title")),true,
        "moving to a new question should focus its heading");
      const next=()=>page.locator("[data-next]").first().click();
      await next();
      await page.locator('[data-answer="autumn"]').click();await next();
      await page.locator('[data-answer="one_night"]').click();await next();
      await page.locator('[data-answer="no_car"]').click();await next();
      await page.locator('[data-experience="bonfire"]').click();
      await page.locator('[data-experience="coffee"]').click();
      await page.locator('[data-inspect="fire_pit"]').first().focus();
      await page.keyboard.press("Enter");
      assert(await page.locator(".world-dialog[open]").isVisible(),"keyboard prop inspection should open");
      await page.keyboard.press("Escape");
      assert(!(await page.locator(".world-dialog[open]").count()),"Escape must close prop detail");
      await page.locator('[data-scene-preview="night"]').click();
      await page.waitForFunction(()=>window.__campLab.sceneImageReadyMs!==null,null,{timeout:10000});
      await page.waitForFunction(()=>document.querySelector(".studio-image")?.complete);
      await page.waitForTimeout(220);
      const stats=await page.evaluate(()=>{
        const resources=performance.getEntriesByType("resource");
        const world=resources.filter(x=>x.name.includes("/camp/world/"));
        const nav=performance.getEntriesByType("navigation")[0];
        return {
          initialNavigationLcpMs:window.__campLab.navigationLcp===null?null:Math.round(window.__campLab.navigationLcp),
          sceneImageReadyAfterStartMs:window.__campLab.sceneImageReadyMs,
          clsSupported:PerformanceObserver.supportedEntryTypes?.includes("layout-shift")||false,
          cls:Math.round(window.__campLab.cls*10000)/10000,
          longTaskSupported:PerformanceObserver.supportedEntryTypes?.includes("longtask")||false,
          longTaskMs:Math.round(window.__campLab.longTasks),
          navigationDOMContentLoadedMs:Math.round(nav?.domContentLoadedEventEnd||0),
          twoFrameFeedbackSamples:window.__campLab.twoFrameFeedbackSamples,
          worldEncodedBytes:world.reduce((sum,e)=>sum+e.encodedBodySize,0),
          worldUniqueUrls:new Set(world.map(e=>e.name)).size,
          layoutOverflow:document.documentElement.scrollWidth>innerWidth+1
        };
      });
      assert.equal(stats.layoutOverflow,false,"horizontal overflow");
      assert(stats.worldEncodedBytes<1100000,"regression in world asset budget");
      assert(stats.worldUniqueUrls<=9,"unintended extra world asset requests");
      assert(stats.twoFrameFeedbackSamples.length>=3,"two-frame response not recorded");
      assert(stats.twoFrameFeedbackSamples.every(e=>e.ms<1200),"very slow scene feedback");
      assert(Number.isFinite(stats.sceneImageReadyAfterStartMs),"scene decode wasn't timed");
      if(slowLake)assert(stats.sceneImageReadyAfterStartMs>=1000,
        "delayed image test did not actually exercise the delay");
      assert.deepEqual(errors,[],"browser exceptions");
      results.push({width,slowLake,result:"PASS",...stats});
    }finally{await context.close();}
  }
}finally{
  fs.writeFileSync(output+"/chromium-performance.json",JSON.stringify(results,null,2)+"\n");
  await browser.close();
}
console.log("CAMP performance LAB (NOT field CWV):",JSON.stringify(results));
