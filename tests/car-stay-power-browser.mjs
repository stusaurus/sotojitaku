import {chromium} from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const base=process.env.CAR_STAY_POWER_BASE||"http://127.0.0.1:4173/car-stay/power/";
const widths=(process.env.CAR_STAY_POWER_WIDTHS||"320,390,1440").split(",").map(Number);
await fs.mkdir("browser-proof/car-stay/power",{recursive:true});
const browser=await chromium.launch({headless:true});
try{
  for(const width of widths){
    const ctx=await browser.newContext({viewport:{width,height:width<450?844:960}});
    await ctx.route("**/*",route=>/googletagmanager|google-analytics/.test(route.request().url())
      ?route.fulfill({status:200,body:""}):route.continue());
    await ctx.addInitScript(()=>{window.dataLayer=[];window.gtag=(...args)=>window.dataLayer.push(args);});
    const page=await ctx.newPage();
    const errors=[];page.on("pageerror",e=>errors.push(e.message));
    const response=await page.goto(base+"?test=1",{waitUntil:"domcontentloaded",timeout:45000});
    assert.equal(response.status(),200,"calculator not served: "+width);
    await page.waitForFunction(()=>!document.getElementById("powerResult").hidden);
    assert.match(await page.locator("h1").innerText(),/ポータブル電源/);
    assert.equal((await page.locator("#requiredWh").innerText()).replace(/\s/g,""),"125Wh");
    assert.equal((await page.locator("#outputW").innerText()).replace(/\s/g,""),"50W");
    assert.match(await page.locator("#ownedAssessment").innerText(),/判定できません/);

    await page.locator("#ownedWh").fill("512");
    await page.locator("#ownedOutput").fill("500");
    await page.locator("#powerForm button[type=submit]").click();
    assert.match(await page.locator("#ownedAssessment").innerText(),/目安を満たしています/);

    await page.locator("#count").selectOption("2");
    await page.locator("#hours").fill("8");
    await page.locator("#powerForm button[type=submit]").click();
    assert.equal((await page.locator("#requiredWh").innerText()).replace(/\s/g,""),"1,000Wh");
    assert.equal((await page.locator("#outputW").innerText()).replace(/\s/g,""),"100W");
    assert.match(await page.locator("#ownedAssessment").innerText(),/下回ります/);

    await page.locator("#ownedOutput").fill("");
    await page.locator("#powerForm button[type=submit]").click();
    assert.match(await page.locator("#ownedAssessment").innerText(),/判定できません/);

    await page.locator("#watts").fill("0");
    await page.locator("#powerForm button[type=submit]").click();
    assert.equal(await page.locator("#powerResult").isHidden(),true);
    assert.equal(await page.locator("#powerError").isVisible(),true);

    await page.locator("#watts").fill("55");
    await page.locator("#hours").fill("2");
    await page.locator("#count").selectOption("1");
    await page.locator("#powerForm button[type=submit]").click();
    assert.equal((await page.locator("#requiredWh").innerText()).replace(/\s/g,""),"138Wh");
    assert.equal(await page.locator("#powerError").isHidden(),true);

    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,"horizontal overflow "+width);
    assert.equal(await page.locator('a[href^="https://hb.afl.rakuten.co.jp/"]').count(),0,"no fabricated offers");
    assert.equal(await page.locator('a[href^="../?from=power-calculator"]').count(),2);
    const qaEvents=await page.evaluate(()=>window.dataLayer.filter(args=>args[0]==="event"&&args[1]==="car_stay_power_calculation"));
    assert.ok(qaEvents.length>0);
    assert.ok(qaEvents.every(args=>args[2].operator_test==="1"));
    assert.deepEqual(errors,[]);
    await page.screenshot({path:`browser-proof/car-stay/power/wh-${width}.png`,fullPage:true});
    console.log("PASS",width,"power math, unknown-owned, blocked input, safety and attribution");
    await ctx.close();
  }
}finally{
  await browser.close();
}
