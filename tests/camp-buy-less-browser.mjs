import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const dir='browser-proof/growth';
fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
try{
 for(const width of [320,390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},locale:'ja-JP',reducedMotion:'reduce'});
  await context.route(/googletagmanager|google-analytics/,r=>r.fulfill({status:200,body:''}));
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.CAMP_BASE || 'http://127.0.0.1:4173/')+'camp/?test=1',{waitUntil:'networkidle'});
  await page.locator('#main [data-start]').first().click();
  for(let step=0;step<7;step++)await page.locator('[data-next]').click();
  await page.locator('[data-go="owned"]').first().click();
  await page.locator('[data-owned="tent"]').click();
  await page.locator('[data-go="gear"]').first().click();
  const strip=page.locator('.purchase-insight');
  assert(await strip.isVisible());
  assert.match(await strip.innerText(),/手持ち1/);
  const row=page.locator('.gear-row').filter({has:page.locator('[data-status="tent"]')});
  assert.match(await row.locator('.gear-decision summary').innerText(),/手持ちを活用/);
  await row.locator('.gear-decision summary').click();
  assert.match(await row.locator('.gear-decision p').innerText(),/定員/);
  await page.locator('[data-status="tent"]').selectOption('rent');
  assert.match(await strip.innerText(),/レンタル1/);
  assert.match(await page.locator('.gear-row').filter({has:page.locator('[data-status="tent"]')}).locator('.gear-decision summary').innerText(),/未予約/);
  await page.locator('[data-status="mat"]').selectOption('skip');
  assert.match(await strip.innerText(),/必要な道具を見送っています/);
  const finished=await page.locator('[data-go="budget"]').count();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:dir+'/camp-buy-less-'+width+'.png',fullPage:true,animations:'disabled'});
  results.push({width,status:'PASS',ownedConfirmed:true,rentUnbooked:true,coreSkipWarning:true,overflow:false});
  await context.close();
 }
}finally{
 fs.writeFileSync(dir+'/camp-buy-less-results.json',JSON.stringify(results,null,2));
 await browser.close();
}
console.log('CAMP buy-less decisions:',JSON.stringify(results));
