// Local-only, real-browser proof for CAMP's "rent" recommendation path.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root=path.resolve('.');
const evidence=path.join(root,'browser-proof','hinata-rental');
const A8='https://px.a8.net/svt/ejp?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL';
const BANNER='https://www23.a8.net/svt/bgt?aid=261103070370&wid=006&eno=01&mid=s00000022571002027000&mc=1';
const PIXEL='https://www16.a8.net/0.gif?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL';

function serve() {
  const server=http.createServer((req,res)=>{
    const u=new URL(req.url,'http://localhost');
    const rel=decodeURIComponent(u.pathname).replace(/^\/sotojitaku\//,'');
    const file=path.resolve(root,rel.endsWith('/')?rel+'index.html':rel);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
    const ext=path.extname(file);
    const type=({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'})[ext]||'text/plain';
    res.setHeader('Content-Type',type);
    res.end(fs.readFileSync(file));
  });
  return server;
}

(async()=>{
  fs.mkdirSync(evidence,{recursive:true});
  const server=serve();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  const observations=[];
  try {
    for(const width of [320,390,1440]){
      const context=await browser.newContext({viewport:{width,height:900},locale:'ja-JP'});
      // Block A8 banner/image/pixel and GA4 calls. Never create a fake affiliate visit.
      await context.route('**/*',route=>{
        const requested=new URL(route.request().url());
        return requested.origin===origin?route.continue():route.abort();
      });
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      const url=origin+'/sotojitaku/camp/?test=1#gear';
      const response=await page.goto(url,{waitUntil:'networkidle'});
      assert.equal(response.status(),200);
      assert.equal(await page.locator('#hinata-rental-ad').count(),0,'No ad before choosing rental');
      await page.locator('select[data-status="tent"]').selectOption('rent');
      const card=page.locator('#hinata-rental-ad');
      assert.equal(await card.count(),1);
      assert.match(await card.innerText(),/広告｜A8.netアフィリエイト/);
      assert.match(await card.innerText(),/計画用概算/);
      const ad=card.locator('a[href^="https://px.a8.net"]');
      assert.equal(await ad.getAttribute('href'),A8);
      assert.equal(await ad.getAttribute('rel'),'nofollow');
      assert.match(await ad.getAttribute('aria-label'),/hinataレンタル/);
      assert.equal(await ad.locator('img').getAttribute('src'),BANNER);
      assert.equal(await ad.locator('img').getAttribute('width'),'300');
      assert.equal(await ad.locator('img').getAttribute('height'),'250');
      assert.equal(await card.locator('img[src*="0.gif"]').getAttribute('src'),PIXEL);
      assert.equal(await card.locator('img[src*="0.gif"]').getAttribute('width'),'1');

      const before=await page.evaluate(()=>{
        window.__hinataEvents=[];
        const old=window.gtag;
        window.gtag=(...args)=>{window.__hinataEvents.push(args);old?.(...args);};
        const link=document.querySelector('#hinata-rental-ad a[href^="https://px.a8.net"]');
        link.addEventListener('click',e=>e.preventDefault(),{once:true});
        link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
        return window.__hinataEvents;
      });
      const hits=before.filter(x=>x[0]==='event'&&x[1]==='affiliate_click');
      assert.equal(hits.length,1);
      assert.equal(hits[0][2].affiliate,'a8');
      assert.equal(hits[0][2].program,'hinata_rental');
      assert.equal(hits[0][2].operator_test,'1');
      assert.equal(hits[0][2].conversion_source,'camp_rental_plan');
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
      assert.equal(overflow,false,'Horizontal overflow at '+width);
      assert.deepEqual(errors,[]);
      await page.screenshot({path:path.join(evidence,'gear-'+width+'.png'),fullPage:true});

      await page.goto(origin+'/sotojitaku/camp/?test=1#budget',{waitUntil:'networkidle'});
      assert.equal(await page.locator('#hinata-rental-ad').count(),1,'Renting gear also shows alternative in budget');
      await page.locator('select[data-status="tent"]').selectOption('buy');
      assert.equal(await page.locator('#hinata-rental-ad').count(),0,'Ad disappears after removing only rental');
      await page.screenshot({path:path.join(evidence,'budget-no-rent-'+width+'.png'),fullPage:true});
      observations.push({width,noRentHasNoAd:true,rentHasOneAd:true,budgetHasAd:true,tracking:true,overflow:false,pageErrors:errors});
      await context.close();
    }
    fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(observations,null,2));
    console.log(JSON.stringify(observations));
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
