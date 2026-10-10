// Read-only audit: never changes catalog rankings, safety rules, or deployed files.
import fs from 'node:fs';
import path from 'node:path';
import {recommend} from '../products.js';
import {DEFAULT} from '../engine.js';
import {selectPlan,buildGearChecklist} from '../fishing/engine.js';
import {buildProductRecommendations} from '../fishing/products.js';
const root=path.resolve(import.meta.dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const errors=[],warnings=[],checks=[],catalogs=[],bias=[];
const report={checkedAt:new Date().toISOString(),mode:process.argv.includes('--network')?'network':'offline',errors,warnings,checks,catalogs,bias};
const must=(ok,message)=>{if(!ok)errors.push(message);};
const base='https://stusaurus.github.io/sotojitaku/';
for(const [file,url] of [['index.html',base],['camp/index.html',base+'camp/'],['car-stay/index.html',base+'car-stay/'],['fishing/index.html',base+'fishing/']]){
 const html=read(file);
 must(/<title>[^<]+<\/title>/.test(html),file+': missing title');
 must(/name="description" content="[^"]{20,}"/.test(html),file+': missing description');
 must(html.includes('rel="canonical" href="'+url+'"'),file+': canonical mismatch');
 must(!/name="robots"[^>]*noindex/.test(html),file+': unexpected noindex');
 must(html.includes('G-6STQ5HXRDH'),file+': GA ID missing');
 must(html.includes('analytics-context.js'),file+': shared exclusions missing');
 for(const raw of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))try{JSON.parse(raw[1])}catch{errors.push(file+': invalid structured data')}
 checks.push({file,url,title:html.match(/<title>(.*?)<\/title>/)?.[1]});
}
const sitemap=read('sitemap.xml');
const urls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(x=>x[1]);
must(new Set(urls).size===urls.length,'sitemap: duplicate URLs');
for(const url of urls){
 must(url.startsWith(base)&&!url.includes('?')&&!url.includes('#'),'sitemap: bad URL '+url);
 const local=url.slice(base.length).replace(/\/$/,'');
 const file=(local?local+'/':'')+'index.html';
 must(fs.existsSync(path.join(root,file)),'sitemap: missing target '+file);
 if(fs.existsSync(path.join(root,file)))must(read(file).includes('rel="canonical" href="'+url+'"'),'sitemap: canonical mismatch '+file);
}
for(const entry of ['camp/','car-stay/','fishing/'])must(urls.includes(base+entry),'sitemap: missing service '+entry);
// Project-level robots.txt is only a readiness check; crawlers use the host-root robots.txt.
must(read('robots.txt').includes('Sitemap: '+base+'sitemap.xml'),'robots: sitemap declaration missing');
const allProducts=[];
for(const [service,file] of [['camp','data/products.json'],['car_stay','car-stay/data/audited-products.json'],['fishing','fishing/data/audited-products.json']]){
 const catalog=json(file),products=catalog.products;
 must(Array.isArray(products)&&products.length>0,service+': empty catalog');
 const ids=new Set();let stale=0;
 for(const p of products||[]){
  const id=p.productId||p.itemCode;must(!!id&&!ids.has(id),service+': missing/duplicate ID '+id);ids.add(id);
  must(p.name&&Number.isFinite(p.price)&&p.price>0,service+': missing name/price '+id);
  if(!Number.isFinite(Date.parse(p.verifiedAt))||Date.now()-Date.parse(p.verifiedAt)>7*86400000)stale++;
  try{
   const item=new URL(p.itemUrl),affiliate=new URL(p.affiliateUrl),target=new URL(affiliate.searchParams.get('pc'));
   must(item.protocol==='https:'&&item.hostname==='item.rakuten.co.jp',service+': invalid item URL '+id);
   must(affiliate.protocol==='https:'&&affiliate.hostname==='hb.afl.rakuten.co.jp'&&affiliate.pathname.startsWith('/hgc/'),service+': invalid affiliate URL '+id);
   must(target.href.replace(/\/$/,'')===item.href.replace(/\/$/,''),service+': wrong affiliate destination '+id);
  }catch{errors.push(service+': malformed URLs '+id)}
 }
 must(stale===0,service+': stale/undated catalog entries '+stale);
 if(catalog.status!=='ok')warnings.push(service+': catalog status '+catalog.status+'; omitted products require review');
 catalogs.push({service,count:products?.length||0,stale,status:catalog.status,updatedAt:catalog.updatedAt});
 allProducts.push(...(products||[]));
}
for(const [file,events] of [['camp/app.js',['journey_start','journey_complete','journey_step_view','journey_step_complete','result_view','product_view','affiliate_click','plan_save']],['car-stay/app.js',['journey_start','journey_complete','journey_step_view','journey_step_complete','result_view','product_view','affiliate_click']],['fishing/app.js',['journey_start','journey_complete','journey_step_view','journey_step_complete','result_view','product_view','affiliate_click','plan_save','plan_share']]]){
 const code=read(file);for(const event of events)must(code.includes(event),file+': event missing '+event);
 must(!code.includes('G-GFVSZ8YDQ5'),file+': legacy stream present');
}
// Bias is a diagnostic signal, never a reason to rotate less suitable items.
const equipment=json('data/equipment.json'),rules=json('data/recommendation-rules.json'),camp=json('data/products.json').products;
for(const category of equipment.categories){
 const first={},eligibleFirst={},missing=[];let n=0,multi=0;
 for(const adults of [1,2,4])for(const season of ['spring','summer','autumn'])for(const stay of ['daytrip','one_night'])for(const transport of ['car','no_car'])for(const preference of ['balanced','easy','comfort','compact','value']){
  const input={...DEFAULT,adults,children:0,season,stay,transport,experiences:['relax']};
  const recs=recommend(camp,category.id,input,equipment,rules,{preference});n++;
  if(!recs.length){missing.push({adults,season,stay,transport,preference});continue}
  first[recs[0].family]=(first[recs[0].family]||0)+1;
  if(recs.length>1){multi++;eligibleFirst[recs[0].family]=(eligibleFirst[recs[0].family]||0)+1}
 }
 const dominant=Object.entries(eligibleFirst).sort((a,b)=>b[1]-a[1])[0];
 const share=multi&&dominant?dominant[1]/multi:0;
 bias.push({service:'camp',category:category.id,scenarios:n,empty:missing.length,emptyExamples:missing.slice(0,3),firstChoices:first,multiChoiceScenarios:multi,dominantShare:share});
 if(missing.length)warnings.push('camp/'+category.id+': '+missing.length+'/'+n+' contexts have no eligible offer (fail-closed; never fill with mismatched goods)');
 if(multi>=20&&share>.9)warnings.push('camp/'+category.id+': same model ranks first in '+Math.round(share*100)+'% of multi-choice contexts; review fit scores');
}
const fishingCatalog=json('fishing/data/audited-products.json').products,plans=json('fishing/data/plans.json'),gear=json('fishing/data/gear.json');
const counts={};let fishN=0;
for(const party of ['solo','pair','family_child','group'])for(const fun of ['easy_catch','cast_wait','choose_for_me'])for(const bait of ['okay','no_worm','low_mess'])for(const budget of ['low','balanced','long_term']){
 const input={party,fun,bait,budget,take_home:'yes',carry:'normal',owned:[]};const plan=selectPlan(input,plans),checklist=buildGearChecklist(input,plan,gear);
 const recs=buildProductRecommendations(fishingCatalog,{input,plan,checklist,now:Date.now()});fishN++;
 for(const p of recs.selected||[])counts[p.productId]=(counts[p.productId]||0)+1;
}
bias.push({service:'fishing',scenarios:fishN,selectedCounts:counts,note:'Selection frequency differs by role; child-fit questions must stay. Not a first-place rotation rule.'});
if(process.argv.includes('--network')){
 const destinations=[...new Set(allProducts.map(p=>p.itemUrl))];const links=[];report.links=links;
 let cursor=0;
 await Promise.all(Array.from({length:4},async()=>{while(cursor<destinations.length){const url=destinations[cursor++];try{
  const r=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:'follow'});
  await r.body?.cancel();links.push({url,status:r.status,finalUrl:r.url});
  if([404,410].includes(r.status))errors.push('item destination unavailable: '+r.status+' '+url);
  else if(r.status!==200)warnings.push('item health inconclusive: HTTP '+r.status+' '+url);
 }catch(e){links.push({url,status:'inconclusive',error:e.message});warnings.push('item health inconclusive: '+url)}}}));
}
const out=process.env.GROWTH_AUDIT_OUT||'browser-proof/growth/audit.json';fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify({catalogs,seoPages:urls.length,errors,warnings,report:out},null,2));if(errors.length)process.exitCode=1;
