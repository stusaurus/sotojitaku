import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';

const browser=await chromium.launch({headless:true});
mkdirSync('browser-proof/xebio-camp',{recursive:true});
try {
  for(const width of [320,390,1440]){
    const page=await browser.newPage({viewport:{width,height:900}});
    await page.route(/https:\/\/[^/]*a8\.net\/.*/, async route=>{
      const url=route.request().url();
      if(url.includes('/svt/bgt?')){
        await route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="728" height="90"><rect width="728" height="90" fill="#e7ede8"/></svg>'});
      } else {
        await route.fulfill({status:204,body:''});
      }
    });
    await page.route(/https:\/\/(?:www\.)?google-analytics\.com\/.*/,route=>route.abort());
    await page.route(/https:\/\/www\.googletagmanager\.com\/.*/,route=>route.abort());
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4173/camp/#store',{waitUntil:'domcontentloaded'});
    await page.locator('.soto-xebio-ad').waitFor({state:'visible',timeout:20000});
    const link=page.locator('.soto-xebio-ad a');
    assert.equal(await link.count(),1);
    assert.equal(await link.getAttribute('href'),'https://px.a8.net/svt/ejp?a8mat=4BGCF2+AM8F0A+4ABU+6J4I9');
    assert.equal(await page.locator('.soto-xebio-ad img[width="728"]').count(),1);
    const geometry=await page.evaluate(()=>{
      const ad=document.querySelector('.soto-xebio-ad');
      const banner=ad?.querySelector('img[width="728"]');
      return {scroll:document.documentElement.scrollWidth,viewport:innerWidth,
              adWidth:ad?.getBoundingClientRect().width,
              bannerWidth:banner?.getBoundingClientRect().width};
    });
    assert.ok(geometry.scroll<=geometry.viewport+2,JSON.stringify({width,geometry}));
    assert.ok(geometry.bannerWidth<=geometry.viewport,JSON.stringify({width,geometry}));
    await link.evaluate(a=>a.addEventListener('click',e=>e.preventDefault()));
    await link.click();
    const click=await page.evaluate(()=>{
      const analytics=window.SOTOJITAKU_ANALYTICS;
      const ev=(window.dataLayer||[]).filter(a=>a&&a[0]==='event'&&a[1]==='affiliate_click');
      return {optedOut:!!analytics?.optedOut,events:ev.map(x=>x[2])};
    });
    if(!click.optedOut){
      assert.ok(click.events.some(x=>x.affiliate==='a8'&&x.program==='super_sports_xebio'&&x.ad_creative==='banner_728x90'),JSON.stringify(click));
    }
    assert.deepEqual(errors,[]);
    await page.screenshot({path:'browser-proof/xebio-camp/'+width+'.png',fullPage:true});
    await page.close();
  }
} finally {
  await browser.close();
}
