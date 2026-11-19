/**
 * WebKit device-profile lab QA for CAMP. This is NOT a physical Safari,
 * battery/thermal, or real-user Core Web Vitals measurement.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import {devices,webkit} from "playwright";

const base=process.env.CAMP_BASE||"http://127.0.0.1:4173/";
const outDir=process.env.PROOF_DIR||"browser-proof/devices";
const scenarios=["iPhone SE","iPhone 13","iPhone 13 landscape","iPad Mini","iPad Mini landscape"];
for(const name of scenarios)assert(devices[name]?.hasTouch,"Unknown touch device: "+name);
fs.mkdirSync(outDir,{recursive:true});
const browser=await webkit.launch({headless:true});
const results=[];
try {
  for(const deviceName of scenarios){
    const context=await browser.newContext({...devices[deviceName],locale:"ja-JP",reducedMotion:"reduce"});
    await context.route(/googletagmanager|google-analytics|fonts.googleapis|fonts.gstatic/,route=>route.abort());
    const page=await context.newPage();
    page.setDefaultTimeout(10000);
    const errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    const tap=async(selector)=>page.locator(selector).first().tap();
    const next=()=>tap("[data-next]");
    try{
      await page.goto(base+"camp/?test=1",{waitUntil:"domcontentloaded"});
      await tap("#main [data-start]");
      await page.locator(".studio-scene").waitFor();
      assert.equal(await page.locator(".world-object").count(),0,deviceName+": empty site should be empty");
      await tap('[data-answer="family"]');
      assert.equal(await page.locator('.world-object[data-inspect="chair"]').count(),4,deviceName+": chairs");
      await next();await next();await tap('[data-answer="autumn"]');await next();
      await tap('[data-answer="one_night"]');await next();
      await tap('[data-answer="no_car"]');await next();
      const experience=page.locator('[data-experience="bonfire"]');
      await experience.scrollIntoViewIfNeeded();
      await experience.tap();
      await tap('[data-experience="coffee"]');
      const mini=page.locator(".studio-mobile-feedback");
      const expectedMini=devices[deviceName].viewport.width<=760 ||
        (devices[deviceName].viewport.width<=960 && devices[deviceName].viewport.height<=540);
      if(expectedMini){
        await page.locator('[data-experience="easy"]').scrollIntoViewIfNeeded();
        assert(await mini.isVisible(),deviceName+": scrolling needs a visible live scene");
        const rect=await mini.boundingBox();
        assert(rect&&rect.y>=-1&&rect.y<100,deviceName+": live scene should stay at viewport top");
        assert.equal(await mini.locator('[data-inspect]').count(),0,deviceName+": preview must be inert");
        assert.equal(await mini.locator('[data-mini-role="fire_pit"]').count(),1,deviceName+": fire should appear in preview");
      }else{
        assert(!(await mini.isVisible()),deviceName+": tablet split view should not duplicate scene");
      }
      const prior=await page.evaluate(()=>localStorage.getItem("sotojitaku_camp_v1"));
      await tap('[data-scene-preview="night"]');
      assert.equal(await page.locator('.studio-scene').first().getAttribute("data-studio-time"),"night");
      assert.equal(await page.evaluate(()=>localStorage.getItem("sotojitaku_camp_v1")),prior,deviceName+": preview must not persist");
      const metrics=await page.evaluate(()=>{
        const names=performance.getEntriesByType("resource").filter(e=>e.name.includes("/camp/world/"));
        const pictureUrls=[...new Set(names.map(e=>new URL(e.name).pathname))];
        const bytes=names.reduce((total,e)=>total+(e.encodedBodySize||0),0);
        const overflow=document.documentElement.scrollWidth>innerWidth+1;
        const panel=document.querySelector(".sim-visual");
        const note=panel?.querySelector(".world-note");
        const clipped=panel&&note&&getComputedStyle(panel).overflow==="hidden"
           && note.getBoundingClientRect().bottom>panel.getBoundingClientRect().bottom+2;
        return {sceneResourceBytes:bytes,sceneResourceCount:pictureUrls.length,
          layoutOverflow:overflow,sceneControlsClipped:Boolean(clipped),
          touchSupport:navigator.maxTouchPoints||0,viewportWidth:innerWidth,viewportHeight:innerHeight};
      });
      assert(!metrics.layoutOverflow,deviceName+": horizontal overflow");
      assert(!metrics.sceneControlsClipped,deviceName+": controls clipped by short landscape viewport");
      assert(metrics.sceneResourceBytes<1100000,deviceName+": scene transfer exceeds 1.1 MB");
      assert(metrics.sceneResourceCount<=9,deviceName+": unexpected scene resources");
      await page.screenshot({path:outDir+"/"+deviceName.replaceAll(" ","-")+".jpg",quality:80});
      await page.reload();
      await page.locator('[data-inspect="fire_pit"]').first().waitFor();
      assert.equal(await page.locator('.world-object[data-inspect="chair"]').count(),4,deviceName+": restored chairs");
      assert.deepEqual(errors,[],deviceName+": JS page errors");
      results.push({device:deviceName,status:"PASS",...metrics,diagnosticStatePreserved:true});
    }finally{await context.close();}
  }
}finally{
  fs.writeFileSync(outDir+"/webkit-device-results.json",JSON.stringify(results,null,2)+"\n");
  await browser.close();
}
console.log("CAMP WebKit touch device emulation:",JSON.stringify(results));
