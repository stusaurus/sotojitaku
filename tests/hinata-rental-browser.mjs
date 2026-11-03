// Local-only browser QA. All A8, analytics, fonts and third-party requests are blocked.
// Validates a real CAMP journey at 320, 390, 1440 pixels; never visits an A8 URL.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE='http://127.0.0.1:4173/';
const A8_HREF='https://px.a8.net/svt/ejp?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL';
const A8_BANNER='https://www23.a8.net/svt/bgt?aid=261103070370&wid=006&eno=01&mid=s00000022571002027000&mc=1';
const A8_PIXEL='https://www16.a8.net/0.gif?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL';
const DIR='browser-proof/hinata-rental';
fs.mkdirSync(DIR,{recursive:true});
const report=[];
const browser=await chromium.launch({headless:true});
try {
  for (const width of [320,390,1440]) {
    const context=await browser.newContext({viewport:{width,height:920},reducedMotion:'reduce',locale:'ja-JP'});
    await context.route('**/*',route=>{
      const u=new URL(route.request().url());
      if (u.origin===new URL(BASE).origin) return route.continue();
      return route.abort();
    });
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    try {
      const response=await page.goto(BASE+'camp/?test=1',{waitUntil:'networkidle',timeout:45000});
      assert.equal(response.status(),200);
      await page.locator('#main [data-start]').first().waitFor({timeout:20000});
      assert.equal(await page.locator('[data-hinata-rental]').count(),0,'No ad before plan');
      await page.locator('#main [data-start]').first().click();
      for(let step=0;step<7;step++){
        if(step===5){
          const experience=page.locator('[data-experience="relax"]');
          if(await experience.getAttribute('aria-pressed')!=='true')await experience.click();
        }
        await page.locator('[data-next]').click();
      }
      await page.locator('#main [data-go="owned"]').click();
      await page.locator('#main [data-go="gear"]').click();
      assert.equal(await page.locator('[data-hinata-rental]').count(),0,'No rent selected means no A8');
      const select=page.locator('.gear-status').first();
      await select.selectOption('rent');
      const card=page.locator('[data-hinata-rental]');
      assert.equal(await card.count(),1);
      assert.match(await card.innerText(),/広告｜A8.netアフィリエイト/);
      assert.match(await card.innerText(),/配送代金/);
      const link=card.locator('a[href^="https://px.a8.net"]');
      assert.equal(await link.getAttribute('href'),A8_HREF);
      assert.equal(await link.getAttribute('rel'),'nofollow');
      assert.equal(await link.getAttribute('aria-label'),'hinataレンタルの公式サイトを見る（広告）');
      assert.equal(await card.locator('a img[width="300"]').getAttribute('src'),A8_BANNER);
      assert.equal(await card.locator('img[width="1"]').getAttribute('src'),A8_PIXEL);
      // Synthetic, navigation-cancelled DOM event; no A8 request leaves the browser.
      await link.evaluate(a=>{
        a.addEventListener('click',e=>e.preventDefault(),{once:true});
        a.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
      });
      const first=await page.evaluate(()=>Array.from(window.dataLayer||[]).filter(x=>x[0]==='event'&&x[1]==='affiliate_click'&&x[2].affiliate==='a8'));
      assert.equal(first.length,1);
      assert.equal(first[0][2].program,'hinata_rental');
      assert.equal(first[0][2].click_position,'gear');
      assert.equal(first[0][2].operator_test,'1');
      await page.screenshot({path:DIR+'/camp-rental-gear-'+width+'.png',fullPage:true});
      // A 'buy' selection removes the advertiser entirely rather than upselling.
      await page.locator('.gear-status').first().selectOption('buy');
      assert.equal(await page.locator('[data-hinata-rental]').count(),0);
      await page.locator('.gear-status').first().selectOption('rent');
      await page.evaluate(()=>{
        history.pushState({},'',location.pathname+location.search+'#missing');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      assert.equal(await page.locator('[data-hinata-rental]').count(),0,'Do not show ad in buy tab');
      await page.locator('[data-gear-tab="rent"]').click();
      assert.equal(await page.locator('[data-hinata-rental]').count(),1);
      assert.equal(await page.locator('[data-hinata-rental]').getAttribute('data-hinata-placement'),'missing');
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
      assert.equal(overflow,false,'Horizontal overflow at '+width);
      assert.deepEqual(errors,[],'Runtime errors at '+width);
      await page.screenshot({path:DIR+'/camp-rental-missing-'+width+'.png',fullPage:true});
      report.push({width,ad_before_rent:false,rendered:true,ad_in_rent_tab:true,ga4_test_click:true,overflow:false,errors});
    } finally {await context.close();}
  }
  fs.writeFileSync(DIR+'/report.json',JSON.stringify({date:'2026-11-03',report},null,2));
  console.log(JSON.stringify(report));
} finally {await browser.close();}
