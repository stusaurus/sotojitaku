const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.HOME_CHROME?{executablePath:process.env.HOME_CHROME,args:['--no-sandbox']}: {})});
 const base=process.env.HOME_BASE||'http://127.0.0.1:4173/';
 fs.mkdirSync('browser-proof/home',{recursive:true});
 const results=[];
 try{for(const width of [1440,1280,1024,390,375,360]){
  const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:width<800?3:1,isMobile:width<800,hasTouch:width<800,reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[],bad=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)bad.push(r.url())});
  // QA never sends operator clicks to production analytics.
  await page.route('https://www.googletagmanager.com/**',r=>r.fulfill({status:200,body:''}));
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,body:''}));
  await page.goto(base,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+': horizontal overflow');
  const proof=await page.evaluate(()=>{
   const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom}};
   return {image:{loaded:document.querySelector('.landscape-image img').complete,width:document.querySelector('.landscape-image img').naturalWidth,src:document.querySelector('.landscape-image img').currentSrc},landscape:rect(document.querySelector('.landscape')),worlds:[...document.querySelectorAll('.world')].map(e=>({r:rect(e),copy:rect(e.querySelector('.world-copy')),radius:getComputedStyle(e).borderRadius})),canonical:document.querySelector('[rel=canonical]').href};
  });
  assert(proof.image.loaded&&proof.image.width>0,'image failed');assert.equal(proof.canonical,'https://stusaurus.github.io/sotojitaku/');
  assert(proof.image.src.includes(width<=800?'mobile':'desktop'));
  for(let i=0;i<3;i++){let w=proof.worlds[i];assert.equal(w.radius,'0px');assert(w.copy.x>=w.r.x&&w.copy.x+w.copy.w<=w.r.x+w.r.w+1);assert(w.copy.y>=w.r.y&&w.copy.b<=w.r.b+1);if(i>0){let prev=proof.worlds[i-1].r;assert(Math.abs(width<=800?w.r.y-prev.b:w.r.x-(prev.x+prev.w))<.1,'gap at boundary')}}
  await page.screenshot({path:`browser-proof/home/${width}.png`,fullPage:true});
  for(const [service,path] of [['camp','camp/'],['car_stay','car-stay/'],['fishing','fishing/']]){
   // Capture the synchronous analytics queue without preventing real navigation.
   await page.evaluate(()=>{window.__events=[];const original=window.gtag;window.gtag=function(){window.__events.push(Array.from(arguments));original.apply(this,arguments)};window.addEventListener('pagehide',()=>sessionStorage.setItem('home-qa-events',JSON.stringify(window.__events)))});
   await page.locator(`.world[data-service="${service}"]`).click();await page.waitForURL(new URL(path,base).href);await page.locator(service==='camp'?'#main [data-start]':'#startBtn:enabled').first().waitFor();await page.goBack({waitUntil:'networkidle'});
   const events=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('home-qa-events')||'[]'));
   assert(events.some(e=>e[0]==='event'&&e[1]==='service_select'&&e[2].service===service),'missing event '+service);
  }
  assert.deepEqual(bad,[]);assert.deepEqual(errors,[]);results.push({width,pass:true,image:proof.image.src});await context.close();
 }
 fs.writeFileSync('browser-proof/home/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
