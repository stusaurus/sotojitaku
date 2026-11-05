/** Real-browser regression for missing verified product supply. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEFAULT} from '../engine.js';

const base=process.env.CAMP_TEST_BASE||'http://127.0.0.1:4173/';
const folder='browser-proof/camp-supply';
fs.mkdirSync(folder,{recursive:true});
const state={
 version:1,
 answers:{...DEFAULT,party_type:'solo',adults:1,children:0,
          season:'autumn',stay:'one_night',transport:'no_car',experiences:['easy']},
 gear:{},recipes:[],selectedProducts:{},productPrefs:{},
 stage:'missing',q:6,finished:false,
};
const results=[];
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,390,1440]){
  const context=await browser.newContext({
   viewport:{width,height:860},reducedMotion:'reduce',
   isMobile:width<=390,hasTouch:width<=390,
  });
  await context.addInitScript(saved=>{
   localStorage.setItem('sotojitaku_camp_v1',JSON.stringify(saved));
  },state);
  await context.route('**/data/products.json',route=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({products:[]}),
  }));
  await context.route(/googletagmanager|google-analytics|fonts\.googleapis|fonts\.gstatic/,r=>r.abort());
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'camp/?test=1#missing');
  await page.locator('.purchase-progress').waitFor();
  assert.match(await page.locator('.purchase-progress').innerText(),/現在案内できない/);
  assert.match(await page.locator('.supply-attention').first().innerText(),/商品候補を案内できません/);
  assert.equal(await page.locator('#main [data-affiliate]').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'missing overflow '+width);
  await page.screenshot({path:`${folder}/missing-${width}.png`,fullPage:true});

  const mat=page.locator('#main [data-product="mat"]').first();
  await mat.click();
  await page.locator('#supply-empty-title').waitFor();
  assert.match(await page.locator('#supply-empty-title').innerText(),/案内できる商品はまだありません/);
  assert.equal(await page.locator('#main [data-affiliate]').count(),0);
  assert.equal(await page.locator('[data-supply-status="rent"][data-category="mat"]').count(),1);
  await page.screenshot({path:`${folder}/mat-no-offer-${width}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'product overflow '+width);

  await page.locator('[data-supply-status="rent"][data-category="mat"]').click();
  await page.locator('.purchase-progress').waitFor();
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('sotojitaku_camp_v1')));
  assert.equal(stored.gear.mat,'rent','click must actually change the gear plan');
  assert.match(await page.locator('#main').innerText(),/貸出条件・料金・在庫は未確認/);
  assert.equal(await page.locator('#main [data-affiliate]').count(),0);

  await page.goto(base+'camp/?test=1#shopping');
  await page.locator('.shopping-total').waitFor();
  assert.match(await page.locator('.shopping-total').innerText(),/参考小計/);
  assert.match(await page.locator('.shopping-total').innerText(),/未集計/);
  assert.doesNotMatch(await page.locator('.shopping-total').innerText(),/¥0/);
  assert.match(await page.locator('.supply-attention').first().innerText(),/まだ商品を案内できない道具/);
  assert.equal(await page.locator('#main [data-affiliate]').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'shopping overflow '+width);
  await page.screenshot({path:`${folder}/shopping-pending-${width}.png`,fullPage:true});

  // When a category isn't in the buy plan, its alternative controls must
  // offer a real route to planning instead of inert "rent" actions.
  await page.goto(base+'camp/?test=1#products');
  await page.locator('.category-options [data-product="fire_pit"]').click();
  await page.locator('#supply-empty-title').waitFor();
  assert.equal(await page.locator('[data-supply-status="rent"][data-category="fire_pit"]').count(),0);
  assert.equal(await page.locator('.supply-next [data-go="gear"]').count(),1);
  assert.deepEqual(errors,[]);
  results.push({width,missing:'PASS',safeNoOffers:'PASS',rentAction:'PASS',
    shopping:'PASS',noInertAction:'PASS',overflow:'PASS'});
  await context.close();
 }
}finally{
 fs.writeFileSync(folder+'/results.json',JSON.stringify(results,null,2));
 await browser.close();
}
console.log('CAMP supply browser QA:',JSON.stringify(results));
