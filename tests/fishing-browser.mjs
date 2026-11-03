import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true});
const base=process.env.FISHING_BASE||'http://127.0.0.1:4173/fishing/';
fs.mkdirSync('browser-proof',{recursive:true});
const scenarios=[
 {name:'solo',values:['solo','easy_catch','okay','no','compact','low'],owned:[]},
 {name:'family',values:['family_child','easy_catch','low_mess','yes','normal','balanced'],owned:[]},
 {name:'pair',values:['pair','cast_wait','no_worm','yes','normal','balanced'],owned:[]},
 {name:'owned',values:['solo','cast_wait','okay','no','compact','balanced'],owned:['rod_reel']}
];
// Browser-only synthetic products: never stored in a live product catalog.
// Ensures affiliate/GA4 regression coverage when real listings have expired.
function testOnlyProducts(){
 const verifiedAt=new Date().toISOString();
 const create=(id,category,cover,tags=[],audiences=["adult"])=>{
  const itemUrl="https://item.rakuten.co.jp/test-fixture/"+id+"/";
  return {
   productId:id,categoryId:category,name:"TEST FIXTURE "+id,
   itemUrl,affiliateUrl:"https://hb.afl.rakuten.co.jp/hgc/test-fixture/?pc="+encodeURIComponent(itemUrl),
   image:"https://example.com/test-fixture.jpg",price:5000,
   audit:{status:"verified_live"},verifiedAt,score:90,recommendationRole:"beginner_default",
   methodIds:["sabiki","choi_nage"],budgetTiers:["low","balanced","long_term"],
   audiences,preferenceTags:tags,coverCategoryIds:cover
  };
 };
 return [
  create("browser-rod","rod_reel",["rod_reel","rig","bait","bucket","fish_grip","scissors"],["low_mess","no_worm"]),
  create("browser-adult-pfd","life_jacket_adult",["life_jacket_adult"]),
  create("browser-child-m-pfd","life_jacket_child",["life_jacket_child"],["child_m"],["child"])
 ];
}
let count=0;
try{
 for(const width of (process.env.FISHING_WIDTHS?process.env.FISHING_WIDTHS.split(',').map(Number):[1440,1024,768,390,375,320])){
  for(const scenario of scenarios){
   const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
   const page=await context.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://www.googletagmanager.com/**',r=>r.fulfill({status:200,body:''}));
   const mockCatalog=width===390 && ["solo","family"].includes(scenario.name);
   const partialCatalog=width===320 && scenario.name==="pair";
   if(mockCatalog||partialCatalog){
    const products=partialCatalog?testOnlyProducts().filter(p=>p.categoryId!=="rod_reel"):testOnlyProducts();
    await page.route('**/fishing/data/audited-products.json',route=>route.fulfill({
      status:200,contentType:'application/json',
      body:JSON.stringify({updatedAt:new Date().toISOString(),products,status:"test_fixture"})
    }));
   }
   await page.goto(base+'?test=1',{waitUntil:'domcontentloaded',timeout:45000});
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
   await page.reload({waitUntil:'domcontentloaded',timeout:45000});await page.locator('#savedBtn').click();
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
   const initialOfferCount=await page.locator('.buy').count();
   if(!initialOfferCount){
    assert.equal(await page.locator('.product-card').count(),0,'expired products must not produce purchase cards');
    assert.match((await page.locator('.empty-products').allInnerTexts()).join(' '),/確認済みの候補がありません|確認済み商品がありません/);
   }
   if(mockCatalog){
    assert.ok(initialOfferCount>0,'isolated synthetic catalog must cover affiliate UI');
    // Products listed as "これで揃う" must never also appear under
    // "販売確認済みの候補がありません" after partial or full coverage.
    const coveredLabels=await page.locator('.product-card .coverage-row:not(.overlap) b').allInnerTexts();
    assert.ok(coveredLabels.length>0,'synthetic fixture should cover required gear');
    const missingText=(await page.locator('.empty-products[role="status"]').allInnerTexts()).join(' ');
    for(const label of coveredLabels){
     assert.ok(!missingText.includes(label),
       width+'/'+scenario.name+': verified product covers '+label+' but is falsely labelled missing');
    }
   }
   if(partialCatalog){
    assert.ok(initialOfferCount>0,'valid partial basket retains valid purchase links');
    assert.equal(await page.locator('.buy[data-category="rod_reel"]').count(),0,'missing rod must never have an invented buy link');
    assert.match((await page.locator('.empty-products[role="status"]').allInnerTexts()).join(' '),/竿・リール/);
    assert.match(await page.locator('.basket-summary').innerText(),/必要な商品すべての総額ではありません/);
    assert.match((await page.locator('.section-title').allInnerTexts()).join(' '),/まだ不足する必須品/);
   }
   if(scenario.name==='owned')assert.equal(await page.locator('.buy[data-category="rod_reel"]').count(),0);
   if(scenario.name==='family'){
    assert.equal(await page.locator('.buy[data-category="life_jacket_child"]').count(),0);
    await page.locator('[data-child-fit="m_all"]').click();
    const childOfferCount=await page.locator('.buy[data-category="life_jacket_child"]').count();
    if(mockCatalog)assert.ok(childOfferCount>0,'verified fixture child PFD must respect the selected fit');
    else if(!childOfferCount){
      assert.match(await page.locator('.child-fit-warning').last().innerText(),/販売確認済みの候補がありません/);
    }
   }
   assert.equal(await page.evaluate(()=>{
    const safety=document.querySelector('.safety-box')?.getBoundingClientRect();
    const product=document.querySelector('.product-card, .empty-products')?.getBoundingClientRect();
    return Boolean(safety&&product&&safety.top<product.top);
   }),true,'safety guidance must precede purchase choices or the no-product explanation');
   if(width===390&&scenario.name==='solo')await page.screenshot({path:'browser-proof/mobile-result.png',fullPage:true});
   if(width===1440&&scenario.name==='solo')await page.screenshot({path:'browser-proof/desktop-result.png',fullPage:true});
   await page.locator('#rulesCheck').check();await noOverflow();
   await page.reload({waitUntil:'domcontentloaded',timeout:45000});await page.locator('#savedBtn').click();await page.locator('.result-hero').waitFor();
   assert.equal(await page.locator('#rulesCheck').isChecked(),false,'safety confirmation must not persist across visits');
   const before=await page.evaluate(()=>window.dataLayer.filter(x=>x[0]==='event'&&x[1]==='fishing_diagnosis_complete').length);
   await page.locator('#rulesCheck').check();
   assert.equal(await page.evaluate(()=>window.dataLayer.filter(x=>x[0]==='event'&&x[1]==='fishing_diagnosis_complete').length),before);
   const affiliate=page.locator('.buy').first();
   if(await affiliate.count()){
    assert.match(await affiliate.getAttribute('href'),/^https:\/\/hb.afl.rakuten.co.jp\//);
    await context.route('https://hb.afl.rakuten.co.jp/**',r=>r.fulfill({status:200,body:'Affiliate navigation test'}));
    const popupPromise=page.waitForEvent('popup');await affiliate.click();const popup=await popupPromise;await popup.close();
    const events=await page.evaluate(()=>window.dataLayer.filter(x=>x[0]==='event').map(x=>({name:x[1],params:x[2]})));
    for(const name of ['affiliate_click','product_select']){
     const e=events.find(x=>x.name===name);assert.ok(e,name+' missing');assert.equal(e.params.conversion_source,'fishing');
    }
   }else{
    const events=await page.evaluate(()=>window.dataLayer.filter(x=>x[0]==='event').map(x=>x[1]));
    assert.ok(!events.includes('affiliate_click')&&!events.includes('product_select'),
      'no valid seller means no purchasable link and no fake conversion event');
   }
   await page.locator('#shareBtn').click();
   const shared=await page.evaluate(()=>navigator.clipboard.readText());assert.match(shared,/#plan=/);
   await page.goto('about:blank');await page.goto(shared,{waitUntil:'domcontentloaded',timeout:45000});await page.locator('.result-hero').waitFor();await noOverflow();
   await page.locator('#saveBtn').click();assert.match(await page.locator('#saveBtn').innerText(),/保存しました/);
   await page.goto(base+'?test=1',{waitUntil:'domcontentloaded',timeout:45000});await page.locator('#savedBtn').click();await page.locator('.result-hero').waitFor();
   await page.locator('#againBtn').click();assert.match(await page.locator('#panel h2').innerText(),/だれと/);
   assert.equal(await page.locator('.result-hero').count(),0);await noOverflow();
   assert.deepEqual(errors,[]);count++;console.log(`PASS ${width}px ${scenario.name}`);await context.close();
  }
 }
 console.log(`All ${count} browser journeys passed.`);
}finally{await browser.close()}
