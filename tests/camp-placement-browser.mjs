import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium, webkit } from "playwright";

const engine = process.env.STUDIO_ENGINE || "chromium";
const candidate = process.env.CAMP_BASE || "http://127.0.0.1:4173/";
const previous = process.env.PLACEMENT_BASELINE;
const out = process.env.PROOF_DIR || "browser-proof/placement";
const browser = await ({chromium, webkit}[engine]).launch({executablePath:process.env.BROWSER_BINARY || undefined});
const results = [];
fs.mkdirSync(out, {recursive:true});

async function visit(base, width, version) {
  const context = await browser.newContext({viewport:{width, height:width < 500 ? 844 : 900}, locale:"ja-JP",
    reducedMotion:"no-preference", hasTouch:width <= 768});
  try {
    await context.route(/googletagmanager|google-analytics|fonts\.googleapis|fonts\.gstatic/, route => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(9000);
    const exceptions = [];
    page.on("pageerror", error => exceptions.push(error.message));
    await page.addInitScript(() => {
      window.siteDraw = [];
      document.addEventListener("click", event => {
        if (!event.target.closest("[data-place-experience],[data-experience]")) return;
        const start = performance.now();
        requestAnimationFrame(() => requestAnimationFrame(() => window.siteDraw.push(Math.round(performance.now()-start))));
      }, true);
    });
    const click = selector => page.locator(selector).first().click();
    const next = () => click("[data-next]");
    const scene = page.locator(".sim-visual .studio-scene");
    const frame = scene.locator(".world-frame");
    const marker = id => scene.locator('[data-place-experience="'+id+'"]');
    const card = id => page.locator('[data-experience="'+id+'"]');
    const press = async id => {
      const input = version === "before" ? card(id) : marker(id);
      if (width <= 768) await input.tap();
      else await input.click();
    };
    const stored = () => page.evaluate(() => localStorage.getItem("sotojitaku_camp_v1"));
    const events = () => page.evaluate(() => window.dataLayer.filter(entry => entry[0] === "event").map(entry => ({
      name:entry[1], answer:entry[2]?.answer_id, selected:entry[2]?.selected
    })));
    const photo = async (label, viewport=false) => {
      await page.evaluate(() => scrollTo({top:0, behavior:"instant"}));
      await frame.locator("img").evaluateAll(images => Promise.all(images.map(img => img.decode())));
      // Finish the real placement/light transitions before comparing stills.
      await page.waitForTimeout(680);
      const filename = out+"/"+engine+"-"+width+"-"+version+"-"+label;
      await frame.screenshot({path:filename+".jpg", quality:90});
      if (viewport) await page.screenshot({path:filename+"-viewport.jpg", quality:83});
    };
    await page.goto(base+"camp/?test=1");
    await click("#main [data-start]");
    await click('[data-answer="family"]');
    await next(); await next(); await click('[data-answer="autumn"]'); await next();
    if(version==="after"){
      const stay=scene.locator("[data-place-stay]");
      await stay.click();
      assert.equal(await page.locator('[data-answer="daytrip"]').getAttribute("aria-pressed"),"true");
      assert(await scene.locator('[data-scene-preview="night"]').isDisabled());
      assert.equal(await frame.locator('button[data-inspect="tent"]').count(),0);
      await stay.focus(); await page.keyboard.press("Enter");
      assert.equal(await stay.getAttribute("aria-pressed"),"true");
      assert.equal(await stay.evaluate(el=>el===document.activeElement),true);
      assert.equal(await page.locator('[data-answer="one_night"]').getAttribute("aria-pressed"),"true");
    } else await click('[data-answer="one_night"]');
    await next(); await click('[data-answer="no_car"]'); await next();
    await click('[data-scene-preview="morning"]');
    await photo("empty", true);
    const before = await events();
    await press("coffee"); await press("bonfire");
    if (version === "after") {
      assert.equal(await card("coffee").getAttribute("aria-pressed"),"true");
      assert.equal(await marker("bonfire").getAttribute("aria-pressed"),"true");
      assert.equal(await scene.getAttribute("data-studio-time"),"morning","explicit light survives placement");
      const difference = (await events()).slice(before.length);
      assert.deepEqual(difference.map(e=>[e.name,e.answer,e.selected]),[
        ["simulator_answer","coffee",1],["simulator_answer","bonfire",1]
      ],"one answer per action without extra page views");
      assert.equal(await page.locator(".studio-mobile-feedback-preview button").count(),0);
      const geometry = await frame.evaluate(el => {
        const props = [...el.querySelectorAll("button.world-object")];
        const flags = [...el.querySelectorAll("[data-place-experience]")];
        const centerHits = controls => controls.every(button => {
          const rect=button.getBoundingClientRect();
          return button.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));
        });
        const overlap = (x,y) => x.left<y.right && y.left<x.right && x.top<y.bottom && y.top<x.bottom;
        const rects=flags.map(el => el.getBoundingClientRect());
        return {hitFlags:centerHits(flags),smallPropHits:centerHits(props.filter(p => ["kettle","led_lantern"].includes(p.dataset.inspect))),
          flagTargetSizes:rects.map(r=>[Math.round(r.width),Math.round(r.height)]),flagsOverlap:overlap(...rects)};
      });
      assert(geometry.hitFlags && geometry.smallPropHits && !geometry.flagsOverlap, JSON.stringify(geometry));
      assert(geometry.flagTargetSizes.every(([w,h])=>w>=44 && h>=44));
      await marker("coffee").focus(); await page.keyboard.press("Space");
      assert.equal(await marker("coffee").getAttribute("aria-pressed"),"false");
      assert.equal(await marker("coffee").evaluate(el=>el===document.activeElement),true);
      assert.equal(await frame.locator('button[data-inspect="kettle"]').count(),0);
      await page.keyboard.press("Space");
      assert.equal(await frame.locator('button[data-inspect="kettle"]').count(),1);
      assert.equal(await frame.locator('[data-departing][data-mini-role="kettle"]').count(),0);
      await page.waitForTimeout(260);
      assert.equal(await frame.locator("[data-departing]").count(),0);
      assert.equal(JSON.parse(await stored()).answers.experiences.filter(x=>x==="coffee").length,1);
    }
    for (const time of ["morning","evening","night"]) {
      await click('[data-scene-preview="'+time+'"]');
      await photo(time, time==="evening");
    }
    const planned = JSON.parse(await stored());
    await page.reload();
    assert.deepEqual(JSON.parse(await stored()).answers, planned.answers);
    await click('[data-scene-preview="morning"]');
    await press("coffee"); await press("bonfire");
    await click('[data-scene-preview="morning"]');
    await photo("removed");
    assert.equal(await frame.locator('button[data-inspect="fire_pit"],button[data-inspect="kettle"]').count(),0);
    assert.deepEqual(exceptions,[]);
    const feedback = await page.evaluate(() => window.siteDraw);
    assert(feedback.length>=2 && feedback.every(ms=>ms < 1200));
    if (version==="after" && width===390) {
      await page.emulateMedia({reducedMotion:"reduce"});
      await press("coffee");
      assert.equal(await frame.locator('[data-inspect="kettle"] img').evaluate(img=>img.getAnimations().length),0);
      await press("coffee");
      assert.equal(await frame.locator("[data-departing]").count(),0);
      await press("bonfire"); await card("bbq").click(); await press("bonfire");
      assert.equal(await marker("bonfire").getAttribute("aria-pressed"),"false");
      assert.equal(await frame.locator('[data-inspect="fire_pit"]').count(),1,"BBQ still needs the shared fire pit");
      await card("bbq").click();
      assert.equal(await frame.locator('[data-inspect="fire_pit"]').count(),0);
    }
    results.push({engine,width,version,twoFrameMs:feedback,errors:exceptions});
  } finally { await context.close(); }
}

async function testMotion(cores) {
  // Deterministic lab profiles. These numbers are capability hints, not
  // emulations of a physical phone's CPU, battery or thermal envelope.
  const context=await browser.newContext({viewport:{width:390,height:844},locale:"ja-JP",reducedMotion:"no-preference"});
  try {
    await context.route(/googletagmanager|google-analytics|fonts\.googleapis|fonts\.gstatic/,route=>route.abort());
    await context.addInitScript(cores=>{
      Object.defineProperty(navigator,"hardwareConcurrency",{get:()=>cores});
      Object.defineProperty(navigator,"deviceMemory",{get:()=>4});
    },cores);
    const page=await context.newPage();
    await page.goto(candidate+"camp/?test=1");
    await page.locator("#main [data-start]").first().click();
    const next=()=>page.locator("[data-next]").click();
    await page.locator('[data-answer="family"]').click(); await next(); await next(); await next();
    const frame=page.locator(".sim-visual .world-frame");
    const button=frame.locator("[data-place-stay]");
    await button.click();
    await page.waitForFunction(()=>!document.querySelector(".world-frame [data-departing]"));
    await frame.scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector(".studio-scene").dataset.inView==="true");
    await page.locator(".sim-visual .studio-image").evaluate(img=>img.decode());
    const motion=await button.evaluate(button=>{
      button.click();
      const sprite=button.closest(".world-frame").querySelector('[data-inspect="tent"] img');
      const animation=sprite.getAnimations().find(a=>a.effect.getTiming().duration===520);
      if(animation)animation.pause();
      return Boolean(animation);
    });
    assert.equal(motion,cores===4,"adaptive tent assembly");
    if(motion){
      for(const part of [0,0.45,1]){
        await frame.locator('[data-inspect="tent"] img').evaluate((img,part)=>{
          const a=img.getAnimations().find(a=>a.effect.getTiming().duration===520); a.currentTime=part*520;
          return img.decode();
        },part);
        await frame.screenshot({path:out+"/"+engine+"-390-assembly-"+Math.round(part*100)+".jpg",quality:90});
      }
    }
    await next(); await next();
    await frame.locator('[data-place-experience="coffee"]').click();
    await page.locator('[data-scene-preview="morning"]').click();
    const steam=frame.locator(".world-coffee-steam");
    assert.equal(await steam.evaluate(el=>getComputedStyle(el,"::before").animationName !== "none"),cores===4);
    if(cores===4){
      await page.locator('[data-experience="easy"]').scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>document.querySelector(".studio-scene").dataset.inView==="false");
      assert.equal(await steam.evaluate(el=>getComputedStyle(el,"::before").animationName),"none");
    }
    results.push({engine,profile:cores===4?"regular-motion":"low-capability",tentAnimated:motion});
  } finally { await context.close(); }
}

try {
  for (const width of [320,390,768,1024,1440]) {
    if (previous) await visit(previous,width,"before");
    await visit(candidate,width,"after");
  }
  await testMotion(4); await testMotion(2);
} finally {
  await browser.close();
  fs.writeFileSync(out+"/"+engine+"-placement.json", JSON.stringify(results,null,2)+"\n");
}
