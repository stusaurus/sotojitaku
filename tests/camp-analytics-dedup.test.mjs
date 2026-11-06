import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCAMPVisitGate} from '../camp/funnel-metrics.js';

test('CAMP SPA redraws do not increase page views',()=>{
  const observe=createCAMPVisitGate();
  assert.equal(observe({route:'home'}).pageView,true);
  for(let n=0;n<5;n++)
    assert.equal(observe({route:'home'}).pageView,false);
  assert.equal(observe({route:'question'}).pageView,true);
  for(let step=0;step<10;step++)
    assert.equal(observe({route:'question'}).pageView,false);
  assert.equal(observe({route:'gear'}).pageView,true);
  assert.equal(observe({route:'gear'}).pageView,false);
  assert.equal(observe({route:'home'}).pageView,true);
});

test('product_view is a category visit, not a recommendation rerender',()=>{
  const observe=createCAMPVisitGate();
  observe({route:'home'});
  let first=observe({route:'products',category:'tent',resultCount:2});
  assert.equal(first.pageView,true);
  assert.equal(first.categoryView,true);
  assert.equal(first.comparisonView,true);
  for(const count of [2,1,0,2]){
    let same=observe({route:'products',category:'tent',resultCount:count});
    assert.equal(same.pageView,false);
    assert.equal(same.categoryView,false);
  }
  let other=observe({route:'products',category:'led_lantern',resultCount:0});
  assert.equal(other.pageView,false);
  assert.equal(other.categoryView,true);
  assert.equal(other.gapView,true);
  observe({route:'shopping'});
  let revisit=observe({route:'products',category:'tent',resultCount:1});
  assert.equal(revisit.pageView,true);
  assert.equal(revisit.categoryView,true);
  assert.equal(revisit.comparisonView,false);
});

test('invalid category values never count as product category views',()=>{
  const observe=createCAMPVisitGate();
  for(const cat of [null,'', 'wrong/path', 'x'.repeat(70)]){
    const result=observe({route:'products',category:cat,resultCount:0});
    assert.equal(result.categoryView,false);
  }
});

test('live app gates page_view and category-level product_view after rendering',()=>{
  const app=readFileSync(new URL('../camp/app.js',import.meta.url),'utf8');
  assert.match(app,/createCAMPVisitGate\(\)/);
  assert.match(app,/if\(observation\.pageView\)track\('page_view'/);
  assert.match(app,/if\(observation\.categoryView\)track\('product_view'/);
  assert.match(app,/presentedProductCount=recs\.length/);
  const from=app.indexOf('function productsPage()');
  const to=app.indexOf('function shopping()',from);
  assert.ok(from>=0&&to>from);
  assert.doesNotMatch(app.slice(from,to),/track\('product_view'/);
  assert.equal((app.match(/track\('page_view'/g)||[]).length,1);
  assert.equal((app.match(/track\('product_view'/g)||[]).length,1);
  assert.match(app,/track\('affiliate_click'/);
  assert.match(app,/track\('product_select'/);
});
