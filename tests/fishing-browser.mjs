import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true});
fs.mkdirSync('browser-proof',{recursive:true});
const scenarios=[
 {name:'solo',values:['solo','easy_catch','okay','no','compact','low'],owned:[]},
 {name:'family',values:['family_child','easy_catch','low_mess','yes','normal','balanced'],owned:[]},
 {name:'pair',values:['pair','cast_wait','no_worm','yes','normal','balanced'],owned:[]},
 {name:'owned',values:['solo','cast_wait','okay','no','compact','balanced'],owned:['rod_reel']}
];
let count=0;
try{
 for(const width of [320,390,1440]){
  for(const scenario of scenarios){
   const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
   const page=await context.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://www.googletagmanager.com/**',r=>r.fulfill({status:200,body:''}));
   await page.goto('http://127.0.0.1:4173/fishing/');
   await page.locator('#startBtn:not([disabled])').waitFor();
   const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}/${scenario.name}: overflow`);
   await noOverflow();
   if(width===390&&scenario.name==='solo')await page.screenshot({path:'browser-proof/mobile-home.png'});
   if(width===1440&&scenario.name==='solo')await page.screenshot({path:'browser-proof/desktop-home.png'});
   await page.locator('#startBtn').click();
   if(width===1440&&scenario.name==='solo')await page.screenshot({path:'browser-proof/desktop-question.png'});
   await page.locator('.choice[data-value="'+scenario.values[0]+'"]').click();
   await page.locator('#nextBtn').click();
   await noOverflow();
   await page.reload();await page.locator('#savedBtn').click();
   assert.match(await page.locator('#panel h2').innerText(),/どんな釣り/);
   if(width===390&&scenario.name==='solo')await page.screenshot({path:'browser-proof/mobile-question.png',fullPage:true});
   for(let i=1;i<scenario.values.length;i++){
    await page.locator('.choice[data-value="'+scenario.values[i]+'"]').click();
    await noOverflow();await page.locator('#nextBtn').click();
   }
   for(const owned of scenario.owned)await page.locator('.choice[data-value="'+owned+'"]').click();
   await page.locator('#backBtn').click();assert.match(await page.locator('#panel h2').innerText(),/予算/);
   await page.locator('#nextBtn').click();await page.locator('#nextBtn').click();
   await page.locator('.result-hero').waitFor();await noOverflow();
   assert.ok(await page.locator('.buy').count()>0);
   if(scenario.name==='owned')assert.equal(await page.locator('.buy[data-category="rod_reel"]').count(),0);
   if(scenario.name==='family'){
    assert.equal(await page.locator('.buy[data-category="life_jacket_child"]').count(),0);
    await page.locator('[data-child-fit="m_all"]').click();
    assert.ok(await page.locator('.buy[data-category="life_jacket_child"]').count()>0);
   }
   assert.equal(await page.evaluate(()=>{
    const safety=document.querySelector('.safety-box').getBoundingClientRect();
    const product=document.querySelector('.product-card').getBoundingClientRect();
    return safety.top<product.top;
   }),true);
   if(width===390&&scenario.name==='solo')await page.screenshot({path:'browser-proof/mobile-result.png',fullPage:true});
   if(width===1440&&scenario.name==='solo')await page.screenshot({path:'browser-proof/desktop-result.png',fullPage:true});
   await page.locator('#rulesCheck').check();await noOverflow();
   await page.reload();await page.locator('#savedBtn').click();await page.locator('.result-hero').waitFor();
   assert.equal(await page.locator('#rulesCheck').isChecked(),false,'safety confirmation must not persist across visits');
   const before=await page.evaluate(()=>window.dataLayer.filter(x=>x[0]==='event'&&x[1]==='fishing_diagnosis_complete').length);
   await page.locator('#rulesCheck').check();
   assert.equal(await page.evaluate(()=>window.dataLayer.filter(x=>x[0]==='event'&&x[1]==='fishing_diagnosis_complete').length),before);
   const affiliate=page.locator('.buy').first();assert.match(await affiliate.getAttribute('href'),/^https:\/\/hb.afl.rakuten.co.jp\//);
   await context.route('https://hb.afl.rakuten.co.jp/**',r=>r.fulfill({status:200,body:'Affiliate navigation test'}));
   const popupPromise=page.waitForEvent('popup');await affiliate.click();const popup=await popupPromise;await popup.close();
   const events=await page.evaluate(()=>window.dataLayer.filter(x=>x[0]==='event').map(x=>({name:x[1],params:x[2]})));
   for(const name of ['affiliate_click','product_select']){
    const e=events.find(x=>x.name===name);assert.ok(e,name+' missing');assert.equal(e.params.conversion_source,'fishing');
   }
   await page.locator('#shareBtn').click();
   const shared=await page.evaluate(()=>navigator.clipboard.readText());assert.match(shared,/#plan=/);
   await page.goto(shared);await page.locator('.result-hero').waitFor();await noOverflow();
   await page.locator('#saveBtn').click();assert.match(await page.locator('#saveBtn').innerText(),/保存しました/);
   await page.reload();await page.locator('#savedBtn').click();await page.locator('.result-hero').waitFor();
   await page.locator('#againBtn').click();assert.match(await page.locator('#panel h2').innerText(),/だれと/);
   assert.equal(await page.locator('.result-hero').count(),0);await noOverflow();
   assert.deepEqual(errors,[]);count++;console.log(`PASS ${width}px ${scenario.name}`);await context.close();
  }
 }
 console.log(`All ${count} browser journeys passed.`);
}finally{await browser.close()}
