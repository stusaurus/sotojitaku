// Inspect PR-preview and published HOME editorial links without real GA4 traffic.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const base=process.env.HOME_BASE||'http://127.0.0.1:4173/';
const urls=[
  'guides/','guides/gear/','guides/budget/',
  'car-stay/car/','car-stay/car/n-box/mat/','car-stay/car/sienta/2people/','car-stay/power/',
  'fishing/guides/','fishing/guides/gear/','fishing/guides/kids/'
];
const widths=[1440,390,320];
const browserPromise=chromium.launch({headless:true});
(async()=>{
  const browser=await browserPromise;
  fs.mkdirSync('browser-proof/public',{recursive:true});
  try {
    for(const width of widths){
      const context=await browser.newContext({
        viewport:{width,height:900},deviceScaleFactor:width<=390?2:1,
        isMobile:width<=390,hasTouch:width<=390,reducedMotion:'reduce'
      });
      await context.route(/https:\/\/(www\.)?(googletagmanager\.com|google-analytics\.com|region1\.google-analytics\.com)\//,
        route=>route.fulfill({status:200,body:''}));
      const page=await context.newPage();
      const home=await page.goto(new URL('?test=1',base).href,{waitUntil:'domcontentloaded',timeout:45000});
      assert.equal(home?.status(),200,'HOME HTTP status '+width);
      // Detect a stale HTML cache key even if the CSS and links look right in
      // one browser cache. This catches an old Pages branch-build takeover.
      const stylesheet=await page.locator('link[rel="stylesheet"][href^="home.css?v="]').getAttribute('href');
      assert.ok(stylesheet,'HOME needs its versioned content stylesheet');
      const cssResponse=await page.request.get(new URL('home.css',base).href);
      assert.equal(cssResponse.status(),200,'HOME stylesheet HTTP status');
      const css=await cssResponse.body();
      const actualVersion=crypto.createHash('sha256').update(css).digest('hex').slice(0,12);
      assert.equal(new URL(stylesheet,base).searchParams.get('v'),actualVersion,
        'HOME stylesheet fingerprint does not match served CSS; stale deployment/cache');
      await page.locator('.pathways-card').first().waitFor({timeout:15000});
      assert.equal(await page.locator('.pathways-card').count(),3,'one guide card per service');
      const links=await page.locator('.pathways-card li a[href]').evaluateAll(nodes=>
        nodes.map(node=>({
          href:node.href,text:node.textContent.trim(),
          rect:node.getBoundingClientRect().toJSON()
        }))
      );
      assert.equal(links.length,urls.length,'must link to all existing guide and tool entries');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'HOME overflow '+width);
      for(const path of urls){
        const href=new URL(path,base).href;
        const link=links.find(item=>item.href===href);
        assert.ok(link&&link.text.length>8,'missing descriptive anchor '+path);
        assert.ok(link.rect.width>0&&link.rect.height>0,'invisible guide link '+path);
        assert.ok(link.rect.left>=-1&&link.rect.right<=width+1,'guide link out of viewport '+path+' '+width);
      }
      await page.screenshot({path:'browser-proof/public/home-guide-links-'+width+'.png',fullPage:true});
      // Exercise one real editorial navigation per width/service, without clicks
      // on any affiliate destination.
      const destination=width===1440?'guides/':width===390?'car-stay/car/':'fishing/guides/';
      await page.locator('.pathways-card a[href="'+destination+'"]').click();
      await page.waitForURL(new URL(destination,base).href,{timeout:15000});
      await page.locator('h1').first().waitFor();
      console.log('PASS HOME guide links',width,'px; navigation to',destination);
      await context.close();
    }
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
