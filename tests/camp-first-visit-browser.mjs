/**
 * CAMP first-visit product audit: novice flows from public landing to schedule.
 * Browser automation is evidence for flow and copy, not a human usability study.
 * Isolated from the existing regression tests and does not modify persisted data.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import {chromium} from "playwright";

const root=process.env.CAMP_BASE||"http://127.0.0.1:4173/";
const out=process.env.PROOF_DIR||"browser-proof/first-visit";
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const cases=[
  {id:"solo-daytrip-mobile",width:390,party:"solo",season:"spring",stay:"daytrip",transport:"no_car",experience:"relax",budget:"30000"},
  {id:"family-overnight-desktop",width:1440,party:"family",season:"autumn",stay:"one_night",transport:"car",experience:"bonfire",budget:"50000"}
];
const reports=[];
try{
 for(const persona of cases){
  const context=await browser.newContext({viewport:{width:persona.width,height:844},locale:"ja-JP",reducedMotion:"reduce"});
  await context.route(/google-analytics|googletagmanager|fonts.googleapis|fonts.gstatic/,route=>route.abort());
  const page=await context.newPage();
  page.setDefaultTimeout(10000);
  const exceptions=[];
  page.on("pageerror",e=>exceptions.push(e.message));
  const select=selector=>page.locator(selector).first().click();
  const snap=async label=>{
   await page.screenshot({path:out+"/"+persona.id+"-"+label+".jpg",quality:80,fullPage:label==="complete"||label==="budget"});
  };
  try{
   await page.goto(root+"camp/?test=1",{waitUntil:"domcontentloaded"});
   await page.locator("#main [data-start]").first().waitFor();
   const landing=await page.locator("#main").innerText();
   assert.match(landing,/7つの質問/,"landing must explain what happens");
   await snap("landing");
   assert.equal(await page.evaluate(()=>localStorage.getItem("sotojitaku_camp_v1")),null);
   await select("#main [data-start]");
   await page.locator(".studio-scene").waitFor();
   assert.equal(await page.locator(".world-object").count(),0,"empty scene should not begin with purchased props");
   await snap("empty-lake");
   // 7 questions in the exact public order.
   await select('[data-answer="'+persona.party+'"]');await select('[data-next]');
   assert.match(await page.locator(".question-title").innerText(),/何人で行く/);
   await select("[data-next]");
   await select('[data-answer="'+persona.season+'"]');await select("[data-next]");
   await select('[data-answer="'+persona.stay+'"]');await select("[data-next]");
   assert.equal(await page.locator('.world-object[data-inspect="tent"]').count(),persona.stay==="daytrip"?0:1);
   if(persona.stay==="daytrip")assert(await page.locator('[data-scene-preview="night"]').isDisabled());
   await select('[data-answer="'+persona.transport+'"]');await select("[data-next]");
   const experiences=page.locator('[data-experience="'+persona.experience+'"]');
   if(await experiences.getAttribute("aria-pressed")!=="true")await experiences.click();
   assert(await page.locator(".studio-scene").isVisible());
   await snap("experience");
   await select("[data-next]");
   await select('[data-answer="'+persona.budget+'"]');
   await select("[data-next]");
   assert.match(await page.locator("#main").innerText(),/持っている道具を選ぶ/);
   await snap("provisional");
   await select('[data-go="owned"]');
   if(persona.party==="family")await select('[data-owned="tent"]');
   await select('[data-go="gear"]');
   if(persona.party==="family"){
    await page.locator('[data-status="tent"]').selectOption("rent");
    await page.locator('[data-status="mat"]').selectOption("skip");
   }
   await select('[data-go="cooking"]');
   await select('[data-go="budget"]');
   if(persona.party==="family"){
    assert(await page.locator("[data-complete]").isDisabled(),"required sleeping mat cannot be skipped");
    assert.match(await page.locator("#main").innerText(),/宿泊の基本がまだそろっていません/);
    await page.locator('[data-status="mat"]').selectOption("buy");
   }
   assert(await page.locator("[data-complete]").isEnabled(),"user can complete the *plan*");
   const budgetCopy=await page.locator("#main").innerText();
   assert.match(budgetCopy,/目安|実売価格/);
   assert.match(await page.locator("[data-complete]").innerText(),/キャンプ計画を完成/);
   await snap("budget");
   await select("[data-complete]");
   const header=await page.locator(".finished-copy h1").innerText();
   assert.match(header,/キャンプ計画/,"success screen must call the outcome a plan");
   const reality=await page.locator(".completion-reality").innerText();
   assert.match(reality,/出発準備の完了ではありません/,"never certify real-world readiness");
   assert.match(reality,/現地の天気|安全/);
   assert.match(reality,/購入予定|持ち物の数量/);
   const overBudget=page.locator(".completion-budget-warning");
   if(persona.party==="family"){
     assert(await overBudget.isVisible(),"family plan above 50,000 yen must show prominent over-budget warning");
     assert.match(await overBudget.innerText(),/道具予算を¥[0-9,]+超える見込み/);
     assert.equal(await overBudget.locator('[data-go="gear"]').count(),1,"warning needs a usable gear-review action");
   }else{
     assert.equal(await overBudget.count(),0,"within-budget day trip needs no warning");
   }
   assert(await page.locator(".finished-world .studio-scene").isVisible());
   await snap("complete");
   await page.reload();
   assert.match(await page.locator(".finished-copy h1").innerText(),/キャンプ計画/,"completed plan restores");
   await select('[data-go="schedule"]');
   assert.match(await page.locator("#main").innerText(),/荒天や強風なら延期・中止/);
   assert.match(await page.locator("#main").innerText(),/購入・レンタル予約・安全確認が完了したことを示しません/);
   await snap("schedule");
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,"horizontal overflow");
   assert.deepEqual(exceptions,[],"runtime exceptions");
   reports.push({persona:persona.id,status:"PASS",steps:7,finishedPlan:true,departureReadinessNotClaimed:true,disabledCoreSkip:persona.party==="family",noOverflow:true});
  }finally{await context.close();}
 }
}finally{
 fs.writeFileSync(out+"/audit.json",JSON.stringify(reports,null,2)+"\n");
 await browser.close();
}
console.log("CAMP first-visit journey audit:",JSON.stringify(reports));
