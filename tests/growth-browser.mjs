import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true});
const dir='browser-proof/growth';fs.mkdirSync(dir,{recursive:true});const proof=[];
const base='http://127.0.0.1:4173/';
try{
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.route(/googletagmanager|google-analytics/,r=>r.fulfill({status:200,body:''}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'?test=1');
  await page.locator('.world[data-service="camp"]').click();
  await page.locator('#main [data-start]').first().waitFor();
  assert.equal(await page.evaluate(()=>window.SOTOJITAKU_ANALYTICS.operatorTest),true,'test context lost on navigation');
  assert.equal(await page.evaluate(()=>window['ga-disable-G-6STQ5HXRDH']),true,'operator test must suppress GA4 sends');
  await page.locator('#main [data-start]').first().click();
  // Default answers are intentional in CAMP; choose a valid experience at the multi step.
  for(let step=0;step<7;step++){
   if(step===5&&await page.locator('[data-experience="relax"]').getAttribute('aria-pressed')!=='true')await page.locator('[data-experience="relax"]').click();
   await page.locator('[data-next]').click();
  }
  await page.locator('[data-go="owned"]').first().waitFor();
  const events=await page.evaluate(()=>window.dataLayer.filter(x=>x[0]==='event').map(x=>({name:x[1],params:x[2]})));
  assert(events.some(e=>e.name==='journey_start'));
  assert.equal(events.filter(e=>e.name==='journey_step_complete').length,7);
  assert.equal(events.filter(e=>e.name==='journey_step_view').length,7);
  assert(events.every(e=>e.params.operator_test==='1'));
  const configs=await page.evaluate(()=>window.dataLayer.filter(x=>x[0]==='config').map(x=>x[1]));
  assert.deepEqual(configs,['G-6STQ5HXRDH'],'CAMP must configure only one stream');
  for(const path of ['','car-stay/','fishing/']){
   await page.goto(base+path);if(path)await page.locator('#startBtn:enabled').waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,path+' overflow '+width);
   const config=await page.evaluate(()=>window.dataLayer.find(x=>x[0]==='config'));
   assert.equal(config[2].operator_test,'1',path+' automatic page_view lacks operator exclusion');
   await page.screenshot({path:dir+'/'+(path.replace('/','')||'home')+'-'+width+'.png',fullPage:true});
  }
  // Opt-out from an existing key must stop page and custom events across services.
  await page.evaluate(()=>localStorage.setItem('sotojitaku_analytics_optout','1'));
  await page.goto(base+'camp/?test=0');await page.locator('#main [data-start]').first().waitFor();
  assert.equal(await page.evaluate(()=>window['ga-disable-G-6STQ5HXRDH']),true);
  await page.locator('#main [data-start]').first().click();
  assert.equal(await page.evaluate(()=>window.dataLayer.filter(x=>x[0]==='event').length),0,'CAMP custom events ignore common opt-out');
  assert.equal(await page.evaluate(()=>window.SOTOJITAKU_ANALYTICS.operatorTest),false);
  await page.evaluate(()=>window.SOTOJITAKU_ANALYTICS.setEnabled(true));
  assert.equal(await page.evaluate(()=>window['ga-disable-G-6STQ5HXRDH']),false,'normal visitor must remain measurable after test=0');
  assert.deepEqual(errors,[]);proof.push({width,status:'PASS',campQuestions:7,operatorCrossService:true,optOut:true});
  await context.close();
 }
}finally{fs.writeFileSync(dir+'/browser-results.json',JSON.stringify(proof,null,2));await browser.close()}
console.log('Growth browser verification:',JSON.stringify(proof));
