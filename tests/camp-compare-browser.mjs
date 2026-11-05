/** Real-browser CAMP comparison QA using *synthetic test-only* verified fixtures. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEFAULT} from '../engine.js';

const root='http://127.0.0.1:4173/';
const folder='browser-proof/camp-compare';
fs.mkdirSync(folder,{recursive:true});
const base=JSON.parse(fs.readFileSync(new URL('../data/products.json',import.meta.url),'utf8'))
 .products.find(p=>p.category==='sleeping_bag');
assert(base,'published base test fixture not available');
const fresh=new Date().toISOString();
const a={...structuredClone(base),family:'qa-distinct-a',verifiedAt:fresh};
const newUrl='https://item.rakuten.co.jp/testqa/98765010/';
const b={...structuredClone(base),
 name:'QA検証専用 シュラフ 2000034774 比較モデル',
 itemCode:'testqa:98765010',family:'qa-distinct-b',
 price:6990,referencePrice:6990,
 itemUrl:newUrl,
 affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/qa/?pc='+encodeURIComponent(newUrl),
 spec:{...base.spec,weight:1100},
 verifiedAt:fresh,
};
const state={version:1,answers:{...DEFAULT},gear:{},recipes:[],
 productPrefs:{sleeping_bag:'comfort'},selectedProducts:{},
 stage:'missing',q:6,finished:false};
const browser=await chromium.launch({headless:true});
const results=[];
try{
 for(const width of [320,390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',
   isMobile:width<500,hasTouch:width<500});
  await context.addInitScript(saved=>localStorage.setItem('sotojitaku_camp_v1',JSON.stringify(saved)),state);
  await context.route('**/data/products.json',route=>route.fulfill({
   status:200,contentType:'application/json',
   body:JSON.stringify({products:[a,b]})}));
  await context.route(/googletagmanager|google-analytics|fonts\.googleapis|fonts\.gstatic/,r=>r.abort());
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(root+'camp/?test=1#products');
  await page.locator('.category-options [data-product="sleeping_bag"]').click();
  await page.locator('.quick-compare-grid').waitFor();
  assert.equal(await page.locator('.quick-compare-item').count(),2,
    'two distinct test-only product families must be compared');
  assert.equal(await page.locator('#camp-product-details').evaluate(e=>e.open),false);
  assert.equal(await page.locator('#preference-adjustment').evaluate(e=>e.open),false);
  assert.equal(await page.locator('.quick-compare-item img.compare-thumbnail').count(),2);
  const choices=await page.locator('.quick-compare').boundingBox();
  const full=await page.locator('#camp-product-details').boundingBox();
  assert(choices.y<full.y,'verified comparison must appear before full product cards');
  if(width<600){
   const swipe=await page.locator('.quick-compare-grid').evaluate(e=>({
    scroll:e.scrollWidth,client:e.clientWidth,snap:getComputedStyle(e).scrollSnapType
   }));
   assert(swipe.scroll>swipe.client,'mobile offers are swipeable');
   assert.match(swipe.snap,/mandatory/);
  }
  const details=await page.locator('.quick-compare-grid').innerText();
  assert.match(details,/2点 ×/,'actual purchase units must be visible');
  assert.match(details,/¥10,980/,'quantity x source unit price only');
  assert.match(details,/¥13,980/,'second product quantity x unit price');
  assert.match(details,/1.4kg/,'manufacturer-evidenced weight displayed');
  assert.match(details,/1.1kg/,'alternative manufacturer-evidenced weight displayed');
  assert.equal(await page.locator('.match-score').count(),0,
    'heuristic fit score must not imply a scientific percentage');
  assert.equal(await page.locator('.quick-compare-item [data-affiliate]').count(),0,
    'comparison shortcuts should never trigger affiliate navigation');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,
    'comparison must not overflow viewport '+width);
  await page.screenshot({path:`${folder}/two-choices-${width}.png`,fullPage:true});

  // User action from the short comparison table must persist the selected offer.
  await page.locator('.quick-compare-item [data-select-product]').nth(1).click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('sotojitaku_camp_v1')));
  assert.equal(saved.selectedProducts.sleeping_bag,b.itemCode);
  assert.equal(await page.locator('.quick-compare-item.is-selected').count(),1);
  assert.equal(await page.locator('#camp-offer-1').count(),1);
  assert.equal(await page.locator('.quick-compare-item.is-selected [data-go="shopping"]').count(),1);
  await page.locator('.quick-compare-item.is-selected [data-go="shopping"]').click();
  await page.locator('.shopping-item').waitFor();
  assert.equal(page.url().split('#')[1],'shopping');
  assert.match(await page.locator('.shopping-total').innerText(),/¥13,980/);
  assert.equal(await page.locator('.shopping-item [data-affiliate]').count(),1);
  await page.locator('.shopping-item [data-product="sleeping_bag"]').click();
  await page.locator('.quick-compare-grid').waitFor();
  assert.equal(await page.locator('#camp-product-details').evaluate(e=>e.open),false);
  await page.locator('.quick-compare-item [data-jump-product="1"]').click();
  assert.equal(await page.locator('#camp-product-details').evaluate(e=>e.open),true);
  await page.waitForFunction(()=>{
   const r=document.getElementById('camp-offer-1')?.getBoundingClientRect();
   return r&&r.top<innerHeight&&r.bottom>0;
  },null,{timeout:3500});
  await page.screenshot({path:`${folder}/selected-${width}.png`,fullPage:true});
  assert.deepEqual(errors,[]);
  results.push({width,comparisons:2,quantityPrices:'PASS',
   makerEvidence:'PASS',selection:'PASS',detailJump:'PASS',overflow:'PASS'});
  await context.close();
 }
 // One eligible product is visibly explained as a single option, not a
 // fake two/three-choice comparison.
 const context=await browser.newContext({viewport:{width:390,height:850},reducedMotion:'reduce'});
 await context.addInitScript(saved=>localStorage.setItem('sotojitaku_camp_v1',JSON.stringify(saved)),state);
 await context.route('**/data/products.json',route=>route.fulfill({
  status:200,contentType:'application/json',body:JSON.stringify({products:[a]})}));
 await context.route(/googletagmanager|google-analytics|fonts\.googleapis|fonts\.gstatic/,r=>r.abort());
 const page=await context.newPage();
 await page.goto(root+'camp/?test=1#products');
 await page.locator('.category-options [data-product="sleeping_bag"]').click();
 assert.equal(await page.locator('.quick-compare-item').count(),1);
 assert.match(await page.locator('#quick-compare-title').innerText(),/現在1件/);
 assert.equal(await page.locator('.alternatives .product-card').count(),0);
 assert.equal(await page.locator('.match-score').count(),0);
 assert.equal(await page.locator('#camp-product-details').evaluate(e=>e.open),false);
 assert.equal(await page.locator('.quick-compare-item img.compare-thumbnail').count(),1);
 await page.locator('#preference-adjustment > summary').click();
 await page.locator('[data-product-pref="value"][data-category="sleeping_bag"]').click();
 assert.equal(await page.locator('#preference-adjustment').evaluate(e=>e.open),true);
 assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('sotojitaku_camp_v1')))).productPrefs.sleeping_bag,'value');
 await page.screenshot({path:`${folder}/one-choice-390.png`,fullPage:true});
 await context.close();
}finally{
 fs.writeFileSync(folder+'/results.json',JSON.stringify(results,null,2));
 await browser.close();
}
console.log('CAMP comparison browser QA:',JSON.stringify(results));
