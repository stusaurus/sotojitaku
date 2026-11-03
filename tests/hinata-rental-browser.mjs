// Local-only Chromium QA. All affiliate, GA4 and third-party requests are blocked.
// The original BUY=300x250, RENT=600x500 assignment is checked in real CAMP UI.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE='http://127.0.0.1:4173/';
const CODES = {
  buy: {
    href:'https://px.a8.net/svt/ejp?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL',
    banner:'https://www23.a8.net/svt/bgt?aid=261103070370&wid=006&eno=01&mid=s00000022571002027000&mc=1',
    pixel:'https://www16.a8.net/0.gif?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL',
    width:'300', height:'250', program:'hinata_purchase'
  },
  rent: {
    href:'https://px.a8.net/svt/ejp?a8mat=4BGCF2+64VY2I+4U5Q+62ENL',
    banner:'https://www24.a8.net/svt/bgt?aid=261103070371&wid=006&eno=01&mid=s00000022571001019000&mc=1',
    pixel:'https://www16.a8.net/0.gif?a8mat=4BGCF2+64VY2I+4U5Q+62ENL',
    width:'600', height:'500', program:'hinata_rental'
  }
};
const DIR='browser-proof/hinata-rental';
fs.mkdirSync(DIR,{recursive:true});
const report=[];
const browser=await chromium.launch({headless:true});

async function checkAd(page, kind, placement) {
  const spec=CODES[kind];
  const card=page.locator('[data-hinata-choice="'+kind+'"]');
  assert.equal(await card.count(),1,'Missing '+kind+' card');
  assert.equal(await page.locator('[data-hinata-choice]').count(),1,'Only one context ad should appear');
  assert.equal(await card.getAttribute('data-hinata-placement'),placement);
  assert.match(await card.innerText(),/広告｜A8.netアフィリエイト/);
  const a=card.locator('a[href^="https://px.a8.net"]');
  assert.equal(await a.getAttribute('href'),spec.href);
  assert.equal(await a.getAttribute('rel'),'nofollow');
  assert.match(await a.getAttribute('aria-label'),kind==='buy'?/購入/:/レンタル/);
  const img=a.locator('img');
  assert.equal(await img.getAttribute('src'),spec.banner);
  assert.equal(await img.getAttribute('width'),spec.width);
  assert.equal(await img.getAttribute('height'),spec.height);
  assert.equal(await img.getAttribute('alt'),'');
  assert.equal(await card.locator('img[width="1"]').getAttribute('src'),spec.pixel);
  return a;
}

async function clickWithoutNavigation(page, a, kind, placement) {
  const countBefore=await page.evaluate(()=>Array.from(window.dataLayer||[]).filter(x=>x[0]==='event'&&x[1]==='affiliate_click'&&x[2].affiliate==='a8').length);
  await a.evaluate(link=>{
    link.addEventListener('click',event=>event.preventDefault(),{once:true});
    link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
  });
  const hits=await page.evaluate(()=>Array.from(window.dataLayer||[]).filter(x=>x[0]==='event'&&x[1]==='affiliate_click'&&x[2].affiliate==='a8'));
  assert.equal(hits.length,countBefore+1);
  const ev=hits.at(-1)[2];
  assert.equal(ev.program,CODES[kind].program);
  assert.equal(ev.conversion_source,kind==='buy'?'camp_gear_buy':'camp_gear_rental');
  assert.equal(ev.ad_creative,kind==='buy'?'banner_300x250':'banner_600x500');
  assert.equal(ev.click_position,placement);
  assert.equal(ev.operator_test,'1');
}

try {
 for(const width of [320,390,1440]){
   const context=await browser.newContext({viewport:{width,height:920},reducedMotion:'reduce',locale:'ja-JP'});
   await context.route('**/*',route=>{
     const requestUrl=new URL(route.request().url());
     if(requestUrl.origin===new URL(BASE).origin)return route.continue();
     return route.abort();
   });
   const page=await context.newPage();
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   try {
     const response=await page.goto(BASE+'camp/?test=1',{waitUntil:'networkidle',timeout:45000});
     assert.equal(response.status(),200);
     await page.locator('#main [data-start]').first().waitFor({timeout:20000});
     assert.equal(await page.locator('[data-hinata-choice]').count(),0,'No ad before a gear plan');
     await page.locator('#main [data-start]').first().click();
     for(let step=0;step<7;step++){
       if(step===5){
         const relax=page.locator('[data-experience="relax"]');
         if(await relax.getAttribute('aria-pressed')!=='true')await relax.click();
       }
       await page.locator('[data-next]').click();
     }
     await page.locator('#main [data-go="owned"]').click();
     await page.locator('#main [data-go="gear"]').click();
     // Default, non-rented gear is purchase-oriented.
     await clickWithoutNavigation(page,await checkAd(page,'buy','gear'),'buy','gear');
     await page.locator('.gear-status').first().selectOption('rent');
     await clickWithoutNavigation(page,await checkAd(page,'rent','gear'),'rent','gear');
     await page.screenshot({path:DIR+'/camp-rent-gear-'+width+'.png',fullPage:true});
     await page.locator('.gear-status').first().selectOption('buy');
     await checkAd(page,'buy','gear');
     await page.evaluate(()=>{
       history.pushState({},'',location.pathname+location.search+'#missing');
       window.dispatchEvent(new PopStateEvent('popstate'));
     });
     await clickWithoutNavigation(page,await checkAd(page,'buy','missing'),'buy','missing');
     await page.locator('[data-gear-tab="rent"]').click();
     assert.equal(await page.locator('[data-hinata-choice]').count(),0,'No rent choice means no rental ad');
     await page.locator('[data-gear-tab="buy"]').click();
     await page.locator('[data-go="gear"]').first().click().catch(()=>{});
     // Use browser history to return to planning screen and choose rental.
     await page.evaluate(()=>{
       history.pushState({},'',location.pathname+location.search+'#gear');
       window.dispatchEvent(new PopStateEvent('popstate'));
     });
     await page.locator('.gear-status').first().selectOption('rent');
     await page.evaluate(()=>{
       history.pushState({},'',location.pathname+location.search+'#missing');
       window.dispatchEvent(new PopStateEvent('popstate'));
     });
     await page.locator('[data-gear-tab="rent"]').click();
     await clickWithoutNavigation(page,await checkAd(page,'rent','missing'),'rent','missing');
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'horizontal overflow '+width);
     assert.deepEqual(errors,[],'page errors '+width);
     await page.screenshot({path:DIR+'/camp-rent-missing-'+width+'.png',fullPage:true});
     report.push({width,buyBanner:'300x250',rentBanner:'600x500',ga4Attribution:true,overflow:false,errors});
   } finally {await context.close();}
 }
 fs.writeFileSync(DIR+'/report.json',JSON.stringify({report},null,2));
 console.log(JSON.stringify(report));
} finally {await browser.close();}
