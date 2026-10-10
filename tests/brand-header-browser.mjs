import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=(process.env.BRAND_BASE||'http://127.0.0.1:4173/').replace(/\/?$/,'/');
const browser=await chromium.launch({headless:true});
const results=[];
await fs.mkdir('browser-proof/brand',{recursive:true});
try{
 for(const width of [1440,1024,768,390,375,360,320])for(const path of ['','camp/','car-stay/','fishing/']){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.route(/https:\/\/(www\.googletagmanager\.com|.*google-analytics\.com)\//,r=>r.fulfill({status:200,body:''}));
  const page=await context.newPage(),errors=[],bad=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)bad.push(r.url())});
  await page.goto(base+path+'?test=1');
  if(path==='camp/')await page.locator('main .hero').waitFor();
  const img=page.locator('.home-main-header .official-brand__main:visible, header .official-brand__symbol:visible');await img.waitFor();
  await img.evaluate(async e=>{await e.decode()});
  const state=await page.evaluate(()=>{const img=[...document.querySelectorAll('header .official-brand__main,header .official-brand__symbol')].find(e=>e.getClientRects().length);const r=img.getBoundingClientRect();const b=document.querySelector('header .brand').getBoundingClientRect();return {width:r.width,height:r.height,brandRight:b.right,overflow:document.documentElement.scrollWidth>innerWidth,logo:img.currentSrc,alt:img.alt,anchorName:document.querySelector('header .brand').getAttribute('aria-label')||document.querySelector('header .brand').textContent.trim(),nav:[...document.querySelectorAll('header nav a')].filter(e=>e.getBoundingClientRect().width).map(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right}))}});
  assert.equal(state.overflow,false,`overflow ${path} ${width}`);const usesMain=path==='';assert.equal(state.logo.endsWith(usesMain?'/main-horizontal-original-white.png':'/mini-64.png'),true);assert.ok(Math.abs(state.width-(usesMain?(width>800?240:Math.min(196,Math.max(174,width*.48))):(width>800?40:32)))<1);assert.ok(Math.abs(state.height-(usesMain?state.width*94/368:state.width))<1);assert.equal(state.alt,'');assert.match(state.anchorName,/SOTOJITAKU/);
  for(const nav of state.nav){assert.ok(nav.left>=state.brandRight,`brand overlaps navigation ${path} ${width}`);assert.ok(nav.right<=width,`navigation outside viewport ${path} ${width}`)}
  assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
  assert.equal(await page.locator('header').evaluate(e=>e.getBoundingClientRect().height),width>800?80:72);
  assert.equal(await page.locator('header .brand').getAttribute('href'),path?'../':'./');
  const skip=page.locator('.skip-link');await skip.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('main').evaluate(e=>e===document.activeElement),true);
  if(path!=='camp/'&&width<=800){
   const menu=page.locator('[data-brand-menu]'),summary=menu.locator('summary');
   assert.equal(await menu.evaluate(e=>e.open),false);await summary.focus();await page.keyboard.press('Enter');assert.equal(await menu.evaluate(e=>e.open),true);
   for(const link of await menu.locator('a').all()){const r=await link.boundingBox();assert.ok(r.height>=44&&r.x>=0&&r.x+r.width<=width);assert.ok(Number.parseFloat(await link.evaluate(e=>getComputedStyle(e).fontSize))>=12)}
   await page.screenshot({path:`browser-proof/brand/${path.replace('/','')||'home'}-menu-${width}.png`});
   await page.keyboard.press('Escape');assert.equal(await menu.evaluate(e=>e.open),false);assert.equal(await summary.evaluate(e=>e===document.activeElement),true);
   await summary.click();await page.mouse.click(4,400);assert.equal(await menu.evaluate(e=>e.open),false);
  }
  if(path==='camp/'){
   if(width<=768){await page.locator('.menu-toggle').click();await page.locator('#menu').waitFor({state:'visible'});assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'true');await page.locator('.menu-toggle').click();}
   await page.locator('main [data-start]').first().click();
   await page.screenshot({path:`browser-proof/brand/camp-question-${width}.png`});
   for(let q=0;q<7;q++){
    await page.locator('[data-next]').waitFor();
    const singles=page.locator('[data-answer]');if(await singles.count()){const overnight=page.locator('[data-answer="one_night"]');await (await overnight.count()?overnight:singles.first()).click();}
    if(await page.locator('[data-experience]').count()){const relax=page.locator('[data-experience="relax"]');if(await relax.getAttribute('aria-pressed')!=='true')await relax.click();}
    await page.locator('[data-next]').click();
    if(q===0){await page.locator('[data-back-question]').click();await page.locator('[data-next]').click()}
   }
   await page.locator('[data-go="owned"]').click();await page.locator('[data-go="gear"]').click();
   const gear=page.locator('[data-status]');for(let n=0;n<await gear.count();n++)await gear.nth(n).selectOption('owned');
   await page.locator('[data-go="cooking"]').click();await page.locator('[data-go="budget"]').click();
   const budgetGear=page.locator('[data-status]');for(let n=0;n<await budgetGear.count();n++)await budgetGear.nth(n).selectOption('owned');
   await page.locator('[data-complete]:enabled').click();await page.locator('[data-export]').waitFor();
   await page.screenshot({path:`browser-proof/brand/camp-result-${width}.png`,fullPage:true});
   assert.ok(await page.evaluate(()=>window.dataLayer.some(e=>e[0]==='event'&&e[1]==='simulator_complete')));
   const download=page.waitForEvent('download');await page.locator('[data-export]').click();assert.match((await download).suggestedFilename(),/SOTOJITAKU/);
   await page.reload();await page.locator('[data-export]').waitFor();await img.evaluate(e=>e.decode());
   await page.goto(base+'camp/?test=1#store');await page.locator('[data-dept]').first().click();
   const affiliate=page.locator('[data-affiliate]').first();await affiliate.waitFor();assert.match(await affiliate.getAttribute('href'),/^https:\/\/hb\.afl\.rakuten\.co\.jp\//);
   await page.screenshot({path:`browser-proof/brand/camp-products-${width}.png`,fullPage:true});
   await affiliate.evaluate(el=>{el.addEventListener('click',e=>e.preventDefault(),{once:true});el.click()});
   assert.ok(await page.evaluate(()=>window.dataLayer.some(e=>e[0]==='event'&&e[1]==='affiliate_click'&&e[2].product_id)));
   assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);state.campFlow='complete, export, saved restore, store affiliate';
  }
  results.push({path:path||'HOME',width,...state});await context.close();console.log('PASS',path||'HOME',width);
 }
 for(const path of ['','car-stay/','fishing/']){
  const context=await browser.newContext({viewport:{width:320,height:900},javaScriptEnabled:false});
  const page=await context.newPage();await page.goto(base+path+'?test=1');
  const menu=page.locator('[data-brand-menu]');await menu.locator('summary').click();
  assert.equal(await menu.evaluate(e=>e.open),true);assert.ok(await menu.locator('a').first().isVisible());
  await context.close();console.log('PASS native menu without JavaScript',path||'HOME');
 }
 await fs.mkdir('browser-proof/brand',{recursive:true});await fs.writeFile('browser-proof/brand/results.json',JSON.stringify(results,null,2));
}finally{await browser.close()}
