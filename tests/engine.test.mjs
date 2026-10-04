import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {DEFAULT,plan,readiness,costs,adjust,schedule,validateStored} from '../engine.js';
import {reject,recommend,safeUrl,defaultPreference} from '../products.js';
const data=Object.fromEntries(['questions','equipment','abilities','recipes','recommendation-rules'].map(k=>[k==='recommendation-rules'?'rules':k,JSON.parse(fs.readFileSync(new URL(`../data/${k}.json`,import.meta.url)))]));
const state=a=>({version:1,answers:{...structuredClone(DEFAULT),...a},gear:{},recipes:[]});
const A=()=>state({party_type:'couple',experiences:['bbq'],budget:'50000'});
const B=()=>state({party_type:'family',adults:2,children:2,season:'autumn',experiences:['bbq','bonfire','coffee'],budget:'100000'});
const C=()=>state({party_type:'solo',adults:1,season:'summer',stay:'daytrip',transport:'no_car',experiences:['easy'],budget:'30000'});
test('A: couple BBQ, overnight basics, no forced bonfire',()=>{const s=A();s.recipes=['bbq'];const p=plan(s,data);for(const id of ['tent','sleeping_bag','mat','led_lantern','headlight','cooler','fire_sheet'])assert(p.some(g=>g.id===id));assert(readiness(s,data).unlocked.includes('bbq'));assert(!readiness(s,data).unlocked.includes('bonfire'));assert(schedule(s,data).some(m=>m.title.includes('BBQ')));assert(!schedule(s,data).some(m=>m.title.includes('焚き火')));assert.equal(p.find(g=>g.id==='sleeping_bag').quantity,2);assert(costs(adjust(s,data),data).rent>0);});
test('B: family BBQ, bonfire and coffee remain unlocked',()=>{const s=B();s.recipes=['bbq'];const p=plan(s,data);assert.equal(p.find(g=>g.id==='chair').quantity,4);for(const id of ['heat_gloves','extinguish_water','fire_tongs','kettle'])assert(p.some(g=>g.id===id));const r=readiness(s,data);for(const id of ['bbq','bonfire','coffee','shelter','sleep','walk_night'])assert(r.unlocked.includes(id));assert(r.canComplete);assert(schedule(s,data).some(m=>m.title.includes('朝コーヒー')));});
test('C: daytrip solo no car no cooking: no tent sleeping cooking cooler forced',()=>{const s=C();s.recipes=['no_cook'];for(const id of ['tent','sleeping_bag','mat','burner','cooler','fire_pit'])assert(!plan(s,data).some(g=>g.id===id));assert(readiness(s,data).canComplete);assert(!schedule(s,data).some(m=>m.time.startsWith('翌')));});
test('D: owned tent excludes purchase cost, retains shelter ability',()=>{const s=B();s.answers.budget='50000';const before=costs(s,data).buy;s.gear.tent='owned';assert.equal(before-costs(s,data).buy,18000);assert(readiness(s,data).unlocked.includes('shelter'));assert(!plan(s,data).some(g=>g.id==='tent'&&g.status==='buy'));const a=adjust(s,data);assert.equal(a.gear.tent,'owned');assert(readiness(a,data).canComplete);});
test('safety core cannot be skipped into completion',()=>{const s=A();s.gear.mat='skip';assert(!readiness(s,data).canComplete);assert(!readiness(s,data).unlocked.includes('sleep'));});
test('bonfire blocked when supporting items deferred',()=>{const s=B();s.gear.heat_gloves='skip';assert(!readiness(s,data).unlocked.includes('bonfire'));assert(!schedule(s,data).some(m=>m.title.includes('焚き火')));});
test('recipe adds cooking vessels, fuel and refrigerated food',()=>{const s=C();s.recipes=['pancake'];s.answers.stay='one_night';for(const id of ['burner','frying_pan','cooler','fuel'])assert(plan(s,data).some(g=>g.id===id));});
test('valid storage survives; corrupted answers rejected',()=>{const s=B();s.gear.tent='owned';assert.deepEqual(validateStored(structuredClone(s),data),s);assert.equal(validateStored({...s,answers:{...s.answers,adults:-1}},data),null);assert.equal(validateStored({...s,version:9},data),null);});
const now=Date.now();const product=(category='tent')=>{const c=data.equipment.categories.find(x=>x.id===category);return {category,name:c.include_any[0]+' 初心者 本体',itemCode:'test:1',family:'test-one',audited:true,bodyConfirmed:true,condition:'new',fixedVariant:true,available:true,quantityPerListing:1,itemUrl:'https://item.rakuten.co.jp/test/1/',affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/test/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Ftest%2F1%2F',image:'https://thumbnail.image.rakuten.co.jp/test.jpg',verifiedAt:new Date(now).toISOString(),price:20000,referencePrice:25000,priceAudit:true,childStable:true,spec:{capacity:4,weight:2000,packed_size:'40 x 20 cm',comfort_temperature:0,table_size:'100 x 60',table_capacity:4,heat_source:'direct_flame',capacity_l:40,fuel_type:'CB',ignition_type:'piezo'},scores:{fit:.9,beginner:.8,comfort:.8,portability:.8,value:.8,trust:.8},evidence:{listing:'https://item.rakuten.co.jp/test/1/',specification:'https://manufacturer.example/spec',fields:Object.fromEntries(c.required_fields.map(f=>[f,'documented in audit']))}};};
test('valid audited four person tent passes then two person rejects',()=>{const p=product();assert.equal(reject(p,'tent',B().answers,data.equipment,now),null);p.spec.capacity=2;assert.equal(reject(p,'tent',B().answers,data.equipment,now),'capacity');});
for(const [label,id,modify,reason] of [['unknown sleeping temperature','sleeping_bag',p=>delete p.spec.comfort_temperature,'missing_critical_field'],['electric hot sandwich','hot_sandwich_maker',p=>p.spec.heat_source='electric','heat_source'],['accessory fire pit','fire_pit',p=>p.name='焚き火台 収納ケース','excluded'],['lantern stand only','led_lantern',p=>p.name='LEDランタン スタンド','excluded'],['variable price','tent',p=>p.fixedVariant=false,'listing_conditions'],['rental','tent',p=>p.name+=' レンタル','excluded'],['unknown category','wrong',()=>{},'unknown_category']])test(label,()=>{const p=product(id==='wrong'?'tent':id);modify(p);assert.equal(reject(p,id,B().answers,data.equipment,now),reason);});
test('old listings fail closed and extreme low price not ranked',()=>{const p=product();p.verifiedAt=new Date(now-8*86400000).toISOString();assert.equal(reject(p,'tent',B().answers,data.equipment,now),'stale');p.verifiedAt=new Date(now).toISOString();p.price=50;assert.equal(reject(p,'tent',B().answers,data.equipment,now),'price_audit');});
test('zero products has zero recommendations; no invented cards',()=>assert.deepEqual(recommend([],'tent',B().answers,data.equipment,data.rules,now),[]));
test('same URL tracking and same family deduplicated, max three products',()=>{const p=product();const arr=Array.from({length:6},(_,i)=>({...p,itemCode:'test:'+i,itemUrl:`https://item.rakuten.co.jp/test/${i}/`,affiliateUrl:`https://hb.afl.rakuten.co.jp/hgc/x/?pc=${encodeURIComponent('https://item.rakuten.co.jp/test/'+i+'/')}`,family:'family-'+Math.floor(i/2)}));const r=recommend(arr,'tent',B().answers,data.equipment,data.rules,now);assert.equal(r.length,3);assert.equal(new Set(r.map(p=>p.family)).size,3);assert.equal(recommend([p,{...p,affiliateUrl:p.affiliateUrl+'&x=2'}],'tent',B().answers,data.equipment,data.rules,now).length,1);});
test('no car rejects heavyweight even cheap',()=>{const p=product();p.spec.weight=15000;assert.equal(reject(p,'tent',C().answers,data.equipment,now),'portability');});
test('malicious external affiliate destination rejected',()=>assert(!safeUrl('https://hb.afl.rakuten.co.jp/hgc/x/?pc=https://example.com','affiliate')));
test('wrong affiliate item is rejected even on Rakuten',()=>{const p=product();p.affiliateUrl='https://hb.afl.rakuten.co.jp/hgc/x/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Ftest%2Fother%2F';assert.equal(reject(p,'tent',A().answers,data.equipment,now),'wrong_affiliate_destination');});
test('deferred recipe equipment produces a simple alternative meal',()=>{const s=A();s.recipes=['bbq'];s.gear.fire_pit='skip';assert(!schedule(s,data).some(m=>m.title.includes('BBQ')));assert(schedule(s,data).some(m=>m.title==='気楽なごはんの時間'));});
test('live audited catalog has safe exact links and each listing fits a baseline solo car profile',()=>{const catalog=JSON.parse(fs.readFileSync(new URL('../data/products.json',import.meta.url)));const solo=state({party_type:'solo',adults:1,children:0,season:'spring',stay:'one_night',transport:'car',experiences:['relax'],budget:'comfort'}).answers;for(const p of catalog.products){assert.equal(reject(p,p.category,solo,data.equipment,now),null,`${p.category}:${p.model}`);assert.equal(new URL(new URL(p.affiliateUrl).searchParams.get('pc')).pathname,new URL(p.itemUrl).pathname);}});

test('D baseline owned tent stays within 50k by renting family chairs',()=>{const s=state({party_type:'family',adults:2,children:2,season:'autumn',budget:'50000',experiences:['relax']});s.gear.tent='owned';s.recipes=['no_cook'];const a=adjust(s,data);assert.equal(a.gear.tent,'owned');assert.equal(a.gear.chair,'rent');assert(costs(a,data).total<=50000);assert(readiness(a,data).canComplete);});

test('preference inference prioritizes transport and explicit comfort',()=>{assert.equal(defaultPreference('tent',C().answers),'compact');const a=B().answers;a.budget='comfort';assert.equal(defaultPreference('tent',a),'comfort');});
test('personalized recommendation can change top pick and calculates quantity total',()=>{const base=product('sleeping_bag');const comfy={...structuredClone(base),itemCode:'test:comfort',itemUrl:'https://item.rakuten.co.jp/test/comfort/',affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/x/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Ftest%2Fcomfort%2F',family:'comfort-family',price:9000,referencePrice:10000,scores:{fit:.92,beginner:.8,comfort:.99,portability:.35,value:.45,trust:.9}};const value={...structuredClone(base),itemCode:'test:value',itemUrl:'https://item.rakuten.co.jp/test/value/',affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/x/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Ftest%2Fvalue%2F',family:'value-family',price:4500,referencePrice:10000,scores:{fit:.9,beginner:.85,comfort:.6,portability:.7,value:.99,trust:.9}};const a=A().answers;const comfort=recommend([comfy,value],'sleeping_bag',a,data.equipment,data.rules,{preference:'comfort',quantity:2,targetBudget:0},now);const cheap=recommend([comfy,value],'sleeping_bag',a,data.equipment,data.rules,{preference:'value',quantity:2,targetBudget:10000},now);assert.equal(comfort[0].itemCode,'test:comfort');assert.equal(cheap[0].itemCode,'test:value');assert.equal(cheap[0].totalPrice,9000);});

test('real catalog covers core profiles and preference choices',()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../data/products.json',import.meta.url)));
  const profiles=[
    ['solo-car',{...structuredClone(DEFAULT),party_type:'solo',adults:1,children:0,season:'spring',stay:'one_night',transport:'car',experiences:['easy'],budget:'50000'}],
    ['solo-no-car',{...structuredClone(DEFAULT),party_type:'solo',adults:1,children:0,season:'spring',stay:'one_night',transport:'no_car',experiences:['easy'],budget:'50000'}],
    ['family-four',{...structuredClone(DEFAULT),party_type:'family',adults:2,children:2,season:'autumn',stay:'one_night',transport:'car',experiences:['bbq','bonfire','coffee'],budget:'100000'}]
  ];
  const preferences=['easy','comfort','compact','value'];
  for(const [profile,answers] of profiles){
    const quantity=Number(answers.adults)+Number(answers.children);
    for(const category of data.equipment.categories.map(x=>x.id)){
      for(const preference of preferences){
        const picks=recommend(catalog.products,category,answers,data.equipment,data.rules,{preference,quantity,targetBudget:50000},Date.now());
        assert.ok(picks.length>0,profile+':'+category+':'+preference);
        assert.equal(picks[0].badge,'あなたなら、まずこれ');
        assert.ok(picks[0].matchReasons.length>=2);
      }
    }
  }
});

test('family tent preference choices produce distinct top picks',()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../data/products.json',import.meta.url)));
  const answers={...structuredClone(DEFAULT),party_type:'family',adults:2,children:2,season:'autumn',stay:'one_night',transport:'car',experiences:['bbq','bonfire','coffee'],budget:'100000'};
  const expected={easy:'2000036439',comfort:'2000039087',compact:'2185614',value:'2000038429'};
  const tops={};
  for(const preference of Object.keys(expected)){
    const picks=recommend(catalog.products,'tent',answers,data.equipment,data.rules,{preference,quantity:1,targetBudget:25000},Date.now());
    assert.ok(picks.length>0,'tent:'+preference);
    tops[preference]=picks[0].model;
    assert.equal(tops[preference],expected[preference],preference);
  }
  assert.equal(new Set(Object.values(tops)).size,4);
});
