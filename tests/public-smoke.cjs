// Public smoke tests: non-destructive and independent of production analytics.
// Run: node tests/public-smoke.cjs (Playwright + Chromium required).
const { chromium, request } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const BASE = process.env.SOTOJITAKU_BASE || 'https://stusaurus.github.io/sotojitaku/';
const pages = [
  { id:'home', path:'', ready:'.world[data-service="fishing"]', image:'.landscape-image img' },
  { id:'camp', path:'camp/', ready:'#main [data-start]', image:'.home-hero .scene-image' },
  { id:'car-stay', path:'car-stay/', ready:'#startBtn:enabled', image:'.hero-scene img' },
  { id:'fishing', path:'fishing/', ready:'#startBtn:enabled', image:'.hero-photo' },
];
const widths=[1440,390,320];
const proofDir='browser-proof/public';
fs.mkdirSync(proofDir,{recursive:true});
const report={checkedAt:new Date().toISOString(),base:BASE,pages:[],catalogs:[]};
async function main(){
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of widths){
   for(const spec of pages){
    const context=await browser.newContext({
      viewport:{width,height:900},deviceScaleFactor:width<=390?2:1,
      isMobile:width<=390,hasTouch:width<=390,reducedMotion:'reduce'
    });
    // Prevent real analytics traffic and production-user funnel pollution.
    await context.route(/https:\/\/(www\.)?(googletagmanager\.com|google-analytics\.com|region1\.google-analytics\.com)\//,
      route=>route.fulfill({status:200,body:''}));
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    try{
     const url=new URL(spec.path,BASE).href;
     const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
     assert.equal(response&&response.status(),200,spec.id+' HTTP status');
     await page.locator(spec.ready).first().waitFor({timeout:30000});
     assert.equal(await page.locator('main').count(),1,spec.id+' main landmark');
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,spec.id+' overflow '+width);
     const hero=page.locator(spec.image).first();
     await hero.waitFor({state:'attached'});
     const imageOk=await hero.evaluate(async img=>{
       if(img.complete&&img.naturalWidth>0)return true;
       try{await img.decode();return img.naturalWidth>0}catch{return false}
     });
     assert.equal(imageOk,true,spec.id+' broken hero image '+width);
     if(spec.id==='home'){
       const links=await page.locator('.world[data-service]').evaluateAll(nodes=>nodes.map(x=>({service:x.dataset.service,path:new URL(x.href).pathname})));
       assert.equal(links.length,3);
       for(const [service,path] of [['camp','camp/'],['car_stay','car-stay/'],['fishing','fishing/']]){
         assert.ok(links.some(x=>x.service===service&&x.path.endsWith('/sotojitaku/'+path)),service+' navigation');
       }
     }else{
       const start=spec.id==='camp'?'#main [data-start]':'#startBtn';
       await page.locator(start).first().click();
       const next=spec.id==='camp'?'#main .option, #main .stepper':spec.id==='car-stay'?'#builder:not([hidden]) #panel':'#planner:not([hidden]) #panel .choice';
       await page.locator(next).first().waitFor({timeout:15000});
       assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,spec.id+' started overflow '+width);
     }
     await page.screenshot({path:proofDir+'/'+spec.id+'-'+width+'.png',fullPage:false});
     assert.deepEqual(errors,[],spec.id+' page errors');
     report.pages.push({service:spec.id,width,status:'PASS',url});
     console.log('PASS '+spec.id+' '+width+'px');
    }catch(error){
     report.pages.push({service:spec.id,width,status:'FAIL',message:error.message});
     throw error;
    }finally{await context.close()}
   }
  }
  const client=await request.newContext({timeout:30000});
  try{
   for(const [service,path] of [
     ['camp','data/products.json'],
     ['car-stay','car-stay/data/audited-products.json'],
     ['fishing','fishing/data/audited-products.json']
   ]){
     const response=await client.get(new URL(path,BASE).href);
     assert.equal(response.status(),200,service+' catalog HTTP status');
     const data=await response.json();
     assert.ok(Array.isArray(data.products),service+' missing products array');
     const invalidLinks=data.products.filter(p=>{
       try{return new URL(p.affiliateUrl).hostname!=='hb.afl.rakuten.co.jp'}catch{return true}
     }).length;
     assert.equal(invalidLinks,0,service+' invalid affiliate links');
     const old=data.products.filter(p=>!Number.isFinite(Date.parse(p.verifiedAt))||
       Date.now()-Date.parse(p.verifiedAt)>7*86400000).length;
     report.catalogs.push({service,count:data.products.length,status:data.status||'unknown',staleOrUndated:old,invalidAffiliateLinks:invalidLinks});
     console.log('CATALOG '+service+' '+data.products.length+' items, stale/undated '+old);
   }
  }finally{await client.dispose()}
 }finally{
  await browser.close();
  fs.writeFileSync(proofDir+'/results.json',JSON.stringify(report,null,2));
 }
}
main().catch(error=>{console.error(error);process.exitCode=1});
