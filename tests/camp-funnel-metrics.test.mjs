import test from 'node:test';
import assert from 'node:assert/strict';
import {createCAMPVisitGate} from '../camp/funnel-metrics.js';

test('initial CAMP screen is one page_view and repeated redraw never creates another',()=>{
 const visit=createCAMPVisitGate();
 assert.deepEqual(visit({route:'home'}),{
  pageView:true,categoryView:false,comparisonView:false,gapView:false,shoppingView:false});
 for(const change of [{route:'home'},{route:'home',resultCount:3},{route:'home'}]){
  assert.equal(visit(change).pageView,false);
 }
 assert.equal(visit({route:'question'}).pageView,true);
 for(let step=0;step<7;step++)assert.equal(visit({route:'question'}).pageView,false,
  'each answer step should be measured by journey_step_view, not extra page views');
 assert.equal(visit({route:'provisional'}).pageView,true);
});
test('category views are counted once despite preference toggles and product selection rerenders',()=>{
 const visit=createCAMPVisitGate();
 assert.equal(visit({route:'store'}).pageView,true);
 const first=visit({route:'products',category:'sleeping_bag',resultCount:2});
 assert.deepEqual(first,{
  pageView:true,categoryView:true,comparisonView:true,gapView:false,shoppingView:false});
 for(const rerender of [
  {route:'products',category:'sleeping_bag',resultCount:2},
  {route:'products',category:'sleeping_bag',resultCount:1},
  {route:'products',category:'sleeping_bag',resultCount:2}
 ]){
  assert.deepEqual(visit(rerender),{
   pageView:false,categoryView:false,comparisonView:false,gapView:false,shoppingView:false});
 }
 const second=visit({route:'products',category:'mat',resultCount:0});
 assert.equal(second.pageView,false,'switching categories is not a new page');
 assert.equal(second.categoryView,true);
 assert.equal(second.comparisonView,false);
 assert.equal(second.gapView,true);
});
test('real exit and reentry is counted, shopping list view only on page entry',()=>{
 const visit=createCAMPVisitGate();
 visit({route:'products',category:'mat',resultCount:0});
 const shopping=visit({route:'shopping'});
 assert.equal(shopping.shoppingView,true);
 assert.equal(shopping.pageView,true);
 assert.equal(visit({route:'shopping'}).shoppingView,false);
 const back=visit({route:'products',category:'mat',resultCount:2});
 assert.equal(back.pageView,true);
 assert.equal(back.categoryView,true);
 assert.equal(back.comparisonView,true);
 assert.equal(back.gapView,false);
 assert.equal(visit({route:'shopping'}).shoppingView,true);
});
test('malformed category and route inputs never pretend a real item exposure',()=>{
 const visit=createCAMPVisitGate();
 for(const category of [null,'','スパム','camp/mat','foo bar',123]){
  const obs=visit({route:'products',category,resultCount:2});
  assert.equal(obs.categoryView,false);
  assert.equal(obs.comparisonView,false);
  assert.equal(obs.gapView,false);
 }
 assert.equal(visit({route:'',category:'mat'}).pageView,false);
 assert.equal(visit({route:'X'.repeat(120),category:'mat'}).categoryView,false);
 assert.equal(visit({route:'products',category:'mat',resultCount:-1}).gapView,true,
 'invalid counts fail closed as no confirmed eligible offer');
});
test('SPA measurement contract tracks category-level product_view and never invents purchases',async()=>{
 const {readFileSync}=await import('node:fs');
 const app=readFileSync(new URL('../camp/app.js',import.meta.url),'utf8');
 assert.match(app,/createCAMPVisitGate\(\)/);
 assert.match(app,/if\(observation\.pageView\)/);
 assert.match(app,/if\(observation\.categoryView\)/);
 assert.match(app,/product_comparison_view/);
 assert.match(app,/product_supply_gap/);
 assert.match(app,/shopping_list_view/);
 assert.match(app,/presentedProductCount=recs\.length/);
 assert.doesNotMatch(app,/track\('product_view',\{category_id:c\.id/);
 assert.match(app,/if\(state\.selectedProducts\?\.\[id\]===code\)/);
 assert.doesNotMatch(app,/purchase_complete|purchase_success|revenue_confirmed/);
});
