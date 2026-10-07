import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.CAR_STAY_BASE||'http://127.0.0.1:4173/car-stay/';
const browser=await chromium.launch({headless:true});
await fs.mkdir('browser-proof/car-stay',{recursive:true});
const seed={version:1,step:5,vehicleId:'honda-nvan-jj1-jj2',config:{},people:[{type:'adult',height:171}],tripStyle:'sleep_only',date:'2026-10-17',region:'山梨県',placeType:'rv_park',weather:{status:'known',minC:12,maxC:20},ownedGear:['blanket','privacy_full'],devices:[],powerUse:{},floorObservation:'flat',measurements:{lengthMm:2300,widthMm:1200},sleepEngineOn:false,openFlameInside:false};
for(const width of [1440,760,430,390,320]){
 const context=await browser.newContext({viewport:{width,height:width>760?960:844}});
 await context.route('**/*',route=>/googletagmanager|google-analytics/.test(route.request().url())?route.fulfill({status:200,body:''}):route.continue());
 await context.addInitScript(()=>{window.dataLayer=[];window.gtag=(...x)=>window.dataLayer.push(x);});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'?test=1');await page.locator('#startBtn:enabled').waitFor();
 await page.screenshot({path:`browser-proof/car-stay/hero-${width}.png`});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'hero overflow '+width);
 await page.locator('#startBtn').click();await page.locator('[data-vehicle="honda-nvan-jj1-jj2"]').click();await page.locator('[data-next]').click();
 await page.locator('[data-count="1"]').click();await page.locator('[data-next]').click();
 await page.locator('[data-trip="sleep_only"]').click();await page.locator('[data-back]').click();assert.match(await page.locator('#stepLabel').innerText(),/STEP 2/);await page.locator('[data-next]').click();await page.locator('[data-next]').click();
 await page.locator('[data-env="placeType"]').selectOption('rv_park');await page.locator('[data-env="minC"]').fill('12');await page.locator('[data-env="maxC"]').fill('20');await page.locator('[data-next]').click();
 await page.locator('[data-gear="blanket"]').click();await page.locator('[data-gear="privacy_full"]').click();await page.locator('[data-floor="flat"]').click();
 await page.locator('[data-device="electric_blanket"]').check();await page.locator('[data-power="blanketW"]').waitFor();await page.locator('[data-power="blanketW"]').fill('50');await page.locator('[data-power="hours"]').fill('8');
 await page.screenshot({path:`browser-proof/car-stay/gear-${width}.png`,fullPage:true});
 await page.locator('[data-gear="portable_power"]').click();await page.locator('[data-power="ownedWh"]').fill('512');await page.locator('[data-power="ownedOutputW"]').fill('500');await page.locator('[data-next]').click();
 assert.match(await page.locator('.status').innerText(),/READY/);
 await page.screenshot({path:`browser-proof/car-stay/result-${width}.png`,fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'result overflow '+width);
 await page.reload();assert.match(await page.locator('.status').innerText(),/READY/);
 const events=await page.evaluate(()=>window.dataLayer.filter(x=>x[0]==='event').map(x=>x[1]));assert.ok(events.includes('builder_completed'));
 for(const [name,patch,status] of [['engine',{sleepEngineOn:true},'CHANGE PLAN'],['flame',{openFlameInside:true},'CHANGE PLAN'],['heat',{weather:{status:'known',minC:26,maxC:36}},'CHANGE PLAN'],['unknown-weather',{weather:{status:'unknown'}},'CHECK FIRST'],['place',{placeType:'road_station'},'CHECK FIRST'],['ready',{},'READY'],['gap',{ownedGear:[]},'ALMOST READY']]){
  await page.evaluate(state=>localStorage.setItem('sotojitaku_car_stay_v1',JSON.stringify(state)),{...seed,...patch});await page.reload();await page.locator('.status').waitFor();assert.equal(await page.locator('.status').innerText(),status,name+' '+width);
  if(status==='CHANGE PLAN')assert.equal(await page.locator('[data-product]').count(),0);
 }
 await page.evaluate(state=>localStorage.setItem('sotojitaku_car_stay_v1',JSON.stringify(state)),{...seed,vehicleId:'suzuki-hustler-mr52s-mr92s',measurements:{},ownedGear:[]});await page.reload();await page.locator('[data-measure="lengthMm"]').fill('2000');await page.locator('[data-measure="widthMm"]').fill('1200');await page.locator('[data-recalc]').click();assert.equal(await page.locator('.measure-card').count(),0);
 const cards=page.locator('[data-product]');if(await cards.count()){
  const first=cards.first(),href=await first.getAttribute('href');assert.ok(href.startsWith('https://hb.afl.rakuten.co.jp/'));
  assert.equal(await page.evaluate(()=>document.querySelector('.gap-list').getBoundingClientRect().top<document.querySelector('.needed-products').getBoundingClientRect().top),true);
  await first.evaluate(el=>{el.addEventListener('click',e=>e.preventDefault());el.click();});
  const click=await page.evaluate(()=>window.dataLayer.findLast(x=>x[1]==='affiliate_click'));assert.equal(click[2].operator_test,1);assert.ok(click[2].product_id&&click[2].gap_id&&click[2].conversion_source);
  await page.screenshot({path:`browser-proof/car-stay/products-${width}.png`,fullPage:true});
 }
 await page.locator('[data-edit]').click();await page.locator('[data-safety="sleepEngineOn"]').check();await page.locator('[data-next]').click();await page.locator('[data-next]').click();assert.equal(await page.locator('.status').innerText(),'CHANGE PLAN');
 assert.deepEqual(errors,[]);await context.close();console.log('PASS',width,'flow, restore, safety, power, measurement, commerce, telemetry');
}
// Failed images never block the functional flow; presets retain attribution.
const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();await page.route('**/assets/**',r=>r.abort());await page.goto(base+'?vehicle=toyota-sienta-10-15&seatCount=5&party=1&from=seo&entry=sienta&test=1');await page.locator('[data-next]:enabled').waitFor();assert.match(await page.locator('#vehicleMini').innerText(),/シエンタ/);await page.locator('[data-next]').click();assert.match(await page.locator('#stepLabel').innerText(),/STEP 2/);await browser.close();console.log('PASS broken image fallback and SEO preset');
