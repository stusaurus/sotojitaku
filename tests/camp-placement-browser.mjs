import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium, webkit } from "playwright";

const engine = process.env.STUDIO_ENGINE || "chromium";
const candidate = process.env.CAMP_BASE || "http://127.0.0.1:4173/";
const previous = process.env.PLACEMENT_BASELINE;
const out = process.env.PROOF_DIR || "browser-proof/placement";
const freshBrowser = () => ({chromium, webkit}[engine]).launch({executablePath:process.env.BROWSER_BINARY || undefined});
const results = [];
fs.mkdirSync(out, {recursive:true});

// Save the frame and its enclosing viewport from one compositor sample.
// The fixed-size crop and the viewport now document exactly the same instant.
async function captureFrame(page, frame, filename, viewport=false) {
  const rect = await frame.evaluate(el => {
    const {left,top,right,bottom}=el.getBoundingClientRect();
    return [Math.round(left),Math.round(top),Math.round(right),Math.round(bottom)];
  });
  const size=page.viewportSize();
  assert(rect[0]>=0 && rect[1]>=0 && rect[2]<=size.width && rect[3]<=size.height,
    "scene is outside the captured viewport: "+JSON.stringify([rect,size]));
  console.log("Capturing "+filename);
  const screen=await page.screenshot({type:"png",timeout:30000});
  execFileSync("python",["-c",[
    "import io, json, sys",
    "from PIL import Image",
    "image = Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGB')",
    "image.crop(json.loads(sys.argv[1])).save(sys.argv[2]+'.jpg', quality=90)",
    "if sys.argv[3] == 'full': image.save(sys.argv[2]+'-viewport.jpg', quality=83)"
  ].join("\n"),JSON.stringify(rect),filename,viewport?"full":"crop"],{input:screen});
}

async function visit(base, width, version) {
  const browser = await freshBrowser();
  const context = await browser.newContext({viewport:{width, height:width < 500 ? 844 : 900}, locale:"ja-JP",
    reducedMotion:"no-preference", hasTouch:width <= 768});
  try {
    await context.route(/googletagmanager|google-analytics|fonts\.googleapis|fonts\.gstatic/, route => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const exceptions = [];
    page.on("pageerror", error => exceptions.push(error.message));
    await page.addInitScript(() => {
      window.siteDraw = [];
      window.siteTrace = [];
      const clicks = new WeakMap();
      document.addEventListener("click", event => {
        const button=event.target.closest("[data-place-experience],[data-experience]");
        if (!button) return;
        const start = performance.now();
        const entry={id:button.dataset.placeExperience||button.dataset.experience, start, y:Math.round(scrollY)};
        clicks.set(event,entry);window.siteTrace.push(entry);
        requestAnimationFrame(() => {
          entry.first=Math.round(performance.now()-start);
          requestAnimationFrame(() => {
            entry.second=Math.round(performance.now()-start);window.siteDraw.push(entry.second);
          });
        });
      }, true);
      window.addEventListener("click",event=>{
        const entry=clicks.get(event);
        if(entry)entry.dispatch=Math.round(performance.now()-entry.start);
      });
    });
    // Dispatch a real pointer at the visible button. Explicit hit testing also
    // catches overlays that can be missed when automating only by selector.
    const activate = async control => {
      const point=await control.evaluate(el=>{
        const center=()=>{
          const r=el.getBoundingClientRect();
          return {x:r.left+r.width/2,y:r.top+r.height/2};
        };
        const hit=({x,y})=>el.contains(document.elementFromPoint(x,y));
        let p=center();
        if(!hit(p)){
          el.scrollIntoView({block:"center",inline:"nearest",behavior:"instant"});
          p=center();
        }
        return {...p,hit:hit(p),enabled:!el.matches(":disabled"),label:el.textContent.trim()};
      });
      assert(point.hit && point.enabled,"unreachable control: "+JSON.stringify(point));
      if(width<=768)await page.touchscreen.tap(point.x,point.y);
      else await page.mouse.click(point.x,point.y);
    };
    const click = selector => activate(page.locator(selector).first());
    const next = () => click("[data-next]");
    const scene = page.locator(".sim-visual .studio-scene");
    const frame = scene.locator(".world-frame");
    const marker = id => scene.locator('[data-place-experience="'+id+'"]');
    const card = id => page.locator('[data-experience="'+id+'"]');
    const press = async id => {
      const input = version === "before" ? card(id) : marker(id);
      await activate(input);
    };
    const stored = () => page.evaluate(() => localStorage.getItem("sotojitaku_camp_v1"));
    const events = () => page.evaluate(() => window.dataLayer.filter(entry => entry[0] === "event").map(entry => ({
      name:entry[1], answer:entry[2]?.answer_id, selected:entry[2]?.selected
    })));
    const photo = async (label, viewport=false) => {
      await page.evaluate(() => scrollTo({top:0, behavior:"instant"}));
      await page.waitForFunction(()=>[...document.querySelectorAll(".sim-visual .world-frame img")]
        .every(img=>img.complete&&img.naturalWidth>0),null,{polling:50});
      // Finish the real placement/light transitions before comparing stills.
      await page.waitForTimeout(680);
      const filename = out+"/"+engine+"-"+width+"-"+version+"-"+label;
      await captureFrame(page,frame,filename,viewport);
    };
    await page.goto(base+"camp/?test=1");
    await click("#main [data-start]");
    if(width===390)await photo("arrival",true);
    if(version==="after"){
      const picker=frame.locator(".world-party");
      assert.equal(await frame.locator('button[data-inspect="chair"]').count(),0);
      const initialEvents=await events();
      await activate(picker.locator("summary"));
      // WebKit can return from touchend before the native summary has opened.
      await picker.locator(".world-party-options").waitFor({state:"visible",timeout:1500});
      const choices=picker.locator("[data-place-party]");
      assert.equal(await choices.count(),4);
      const partyTargets=await choices.evaluateAll(buttons=>buttons.map(b=>{
        const r=b.getBoundingClientRect();
        const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return {party:b.dataset.placeParty,x:r.x,y:r.y,width:r.width,height:r.height,
          hit:b.contains(hit),top:hit?.outerHTML.slice(0,160)};
      }));
      const canPick=partyTargets.every(t=>t.width>=44&&t.height>=44&&t.hit);
      if(!canPick)await page.screenshot({path:`${out}/${engine}-${width}-party-hit.jpg`,type:"jpeg"});
      assert(canPick,JSON.stringify(partyTargets));
      const family=picker.locator('[data-place-party="family"]');
      await activate(family);
      assert.equal(await picker.getAttribute("open"),null);
      assert.equal(await page.locator('[data-answer="family"]').getAttribute("aria-pressed"),"true");
      assert.equal(await frame.locator('button[data-inspect="chair"]').count(),4);
      assert.deepEqual((await events()).slice(initialEvents.length).map(e=>[e.name,e.answer]),[["simulator_answer","family"]]);
      if(width===390){
        await picker.locator("summary").focus(); await page.keyboard.press("Enter");
        await picker.locator('[data-place-party="solo"]').focus(); await page.keyboard.press("Enter");
        assert.equal(await picker.locator("summary").evaluate(el=>el===document.activeElement),true);
        assert.equal(await frame.locator('button[data-inspect="chair"]').count(),1);
        await activate(picker.locator("summary")); await activate(family);
      }
    } else await click('[data-answer="family"]');
    if(width===390)await photo("seated");
    await next(); await next(); await click('[data-answer="autumn"]'); await next();
    if(version==="after"){
      const stay=scene.locator("[data-place-stay]");
      await activate(stay);
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
    const stable=version==="after"&&width===390?await page.evaluateHandle(()=>{
      const frame=document.querySelector(".sim-visual .world-frame");
      const tent=frame.querySelector('[data-inspect="tent"]');
      const kept=[tent,...document.querySelectorAll(".experience-grid [data-experience], .studio-mobile-feedback-preview .studio-image, .studio-mobile-feedback-preview [data-mini-role=tent]")];
      const removed=[];
      const observer=new MutationObserver(records=>{
        for(const record of records)if([...record.removedNodes].includes(tent))removed.push("tent");
      });
      observer.observe(frame,{childList:true});
      return {kept,removed,observer};
    }):null;
    await press("coffee"); await press("bonfire");
    await click('[data-scene-preview="morning"]');
    await photo("removed");
    assert.equal(await frame.locator('button[data-inspect="fire_pit"],button[data-inspect="kettle"]').count(),0);
    assert.deepEqual(exceptions,[]);
    const feedback = await page.evaluate(() => window.siteDraw);
    const firstRemovalTrace=await page.evaluate(()=>window.siteTrace);
    assert(feedback.length>=2 && feedback.every(ms=>ms < 1200));
    if(stable){
      assert(await stable.evaluate(state=>{
        state.observer.disconnect();
        return state.kept.length>=4 && state.kept.every(el=>el?.isConnected) && !state.removed.length;
      }),"withdrawing gear should leave the tent, answer cards and thumbnail photographs mounted");
      await stable.dispose();
    }
    const motionProfile=await scene.evaluate(el=>({cores:navigator.hardwareConcurrency,quality:el.dataset.motionQuality||"original"}));
    const settledTaps=[];
    if(width===390){
      // Compare the same card on both revisions, and the direct control on
      // this revision. No other tap, scroll, image decode or screenshot may
      // intervene between the captured click and its second frame.
      for(const surface of version==="before"?["card"]:["card","world"]){
        for(const id of ["coffee","coffee","bonfire","bonfire","coffee","coffee","bonfire","bonfire"]){
          const input=surface==="card"?card(id):marker(id);
          await input.evaluate(el=>el.scrollIntoView({block:"center",behavior:"instant"}));
          await page.waitForTimeout(400);
          const count=await page.evaluate(()=>window.siteDraw.length);
          await activate(input);
          await page.waitForFunction(n=>window.siteDraw.length>n,count,{polling:20});
          const ms=await page.evaluate(n=>window.siteDraw[n],count);
          settledTaps.push({surface,id,selected:await input.getAttribute("aria-pressed")==="true",ms});
        }
      }
    }
    // Recreate the saved visit and tap twice while the morning view is being
    // restored. Keep screenshots and unrelated controls outside this interval.
    const restoredTaps=[];
    if(width===390&&engine==="webkit"){
      const cases=version==="before"?[["card","normal"]]:[
        ["card","normal"],["world","normal"],["world","light"],["world","withdrawal"],
        ["world","miniature"],["world","shadows"],["world","normal"]
      ];
      const comparisons={light:".studio-scene *,.studio-scene *::before,.studio-scene *::after{transition:none!important}",
        withdrawal:".world-frame [data-departing]{visibility:hidden!important}",
        miniature:".studio-mobile-feedback-preview{visibility:hidden!important}",
        shadows:".world-frame .world-object::before{visibility:hidden!important}"};
      for(const [surface,condition] of cases){
        await page.evaluate(saved=>localStorage.setItem("sotojitaku_camp_v1",JSON.stringify(saved)),planned);
        await page.reload();
        if(comparisons[condition])await page.addStyleTag({content:comparisons[condition]});
        await click('[data-scene-preview="morning"]');
        for(const id of ["coffee","bonfire"])await activate(surface==="card"?card(id):marker(id));
        await page.waitForFunction(()=>window.siteDraw.length===2,null,{polling:20});
        const trace=await page.evaluate(()=>window.siteTrace);
        assert.deepEqual(trace.map(t=>t.id),["coffee","bonfire"]);
        assert.equal(await card("bonfire").getAttribute("aria-pressed"),"false");
        restoredTaps.push({surface,condition,trace});
      }
    }
    if (version==="after" && width===390) {
      await page.emulateMedia({reducedMotion:"reduce"});
      await press("coffee");
      assert.equal(await frame.locator('[data-inspect="kettle"] img').evaluate(img=>img.getAnimations().length),0);
      await press("coffee");
      assert.equal(await frame.locator("[data-departing]").count(),0);
      await press("bonfire"); await activate(card("bbq")); await press("bonfire");
      assert.equal(await marker("bonfire").getAttribute("aria-pressed"),"false");
      assert.equal(await frame.locator('[data-inspect="fire_pit"]').count(),1,"BBQ still needs the shared fire pit");
      await activate(card("bbq"));
      assert.equal(await frame.locator('[data-inspect="fire_pit"]').count(),0);
      for(const chosen of await page.locator('.question-sheet [data-experience][aria-pressed="true"]').all())
        await activate(chosen);
      assert(await page.locator("[data-next]").isDisabled(),"empty multi-select blocks moving on");
      await activate(card("easy"));
      assert(await page.locator("[data-next]").isEnabled());
      await click("[data-back-question]"); await click("[data-back-question]");
      await click('[data-answer="daytrip"]'); await next(); await next();
      await activate(card("stargazing"));
      assert(await page.locator(".question-sheet > .note").isVisible(),"day trip must show its overnight warning");
      await activate(card("stargazing"));
      assert.equal(await page.locator(".question-sheet > .note").count(),0);
    }
    results.push({engine,width,version,twoFrameMs:feedback,firstRemovalTrace,settledTaps,restoredTaps,motionProfile,errors:exceptions});
  } finally { await browser.close(); }
}

async function testMotion(cores) {
  // Deterministic lab profiles. These numbers are capability hints, not
  // emulations of a physical phone's CPU, battery or thermal envelope.
  const browser=await freshBrowser();
  const context=await browser.newContext({viewport:{width:390,height:844},locale:"ja-JP",reducedMotion:"no-preference"});
  try {
    await context.route(/googletagmanager|google-analytics|fonts\.googleapis|fonts\.gstatic/,route=>route.abort());
    await context.addInitScript(cores=>{
      Object.defineProperty(navigator,"hardwareConcurrency",{get:()=>cores});
      Object.defineProperty(navigator,"deviceMemory",{get:()=>4});
    },cores);
    const page=await context.newPage();
    page.setDefaultTimeout(15000);
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
      const tent=button.closest(".world-frame").querySelector('[data-inspect="tent"]');
      const assembly=tent.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().duration===520);
      assembly.forEach(a=>a.pause());
      return assembly.length;
    });
    assert.equal(motion,cores===4?2:0,"photo and shadow share the adaptive assembly");
    if(motion){
      for(const part of [0,0.45,1]){
        const opacity=await frame.locator('[data-inspect="tent"]').evaluate(async(tent,part)=>{
          const assembly=tent.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().duration===520);
          assembly.forEach(a=>{a.currentTime=part*520;});
          await tent.querySelector("img").decode();
          return Number(getComputedStyle(tent).opacity);
        },part);
        if(part===0||part===1)assert.equal(opacity,part,"the tent shadow must appear with the fabric");
        await captureFrame(page,frame,out+"/"+engine+"-390-assembly-"+Math.round(part*100));
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
    results.push({engine,profile:cores===4?"regular-motion":"low-capability",tentAnimated:Boolean(motion)});
  } finally { await browser.close(); }
}

try {
  for (const width of [320,390,768,1024,1440]) {
    if (previous) await visit(previous,width,"before");
    await visit(candidate,width,"after");
  }
  await testMotion(4); await testMotion(2);
} finally {
  fs.writeFileSync(out+"/"+engine+"-placement.json", JSON.stringify(results,null,2)+"\n");
}
