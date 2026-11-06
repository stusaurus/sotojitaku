import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {purchaseSelectionContext,affiliateClickSource} from '../camp/purchase-intent.js';

test('only a real buy-intent category enters the purchase list',()=>{
 const plan=[
  {id:'tent',status:'buy'},
  {id:'mat',status:'owned'},
  {id:'chair',status:'rent'},
  {id:'table',status:'skip'},
  {id:'cooler',status:'undecided'}
 ];
 const buying=purchaseSelectionContext('tent',plan);
 assert.equal(buying.plannedBuy,true);
 assert.equal(buying.status,'buy');
 assert.match(buying.message,/今回そろえる道具/);
 for(const [id,status,phrase] of [
  ['mat','owned','持っている'],['chair','rent','借りる'],
  ['table','skip','次回でもOK'],['cooler','undecided','装備計画'],
  ['fire_pit','undecided','装備計画']
 ]){
  const result=purchaseSelectionContext(id,plan);
  assert.equal(result.plannedBuy,false);
  assert.equal(result.status,status);
  assert.match(result.message,new RegExp(phrase));
  assert.doesNotMatch(result.message,/買うものリストに追加しました/);
 }
});

test('missing plan and malformed identifiers never invent purchase membership',()=>{
 for(const [id,plan] of [[null,[]],['',[]],['tent',null],['tent',{}]]){
  const result=purchaseSelectionContext(id,plan);
  assert.equal(result.status,'unknown');
  assert.equal(result.plannedBuy,false);
 }
});

test('attribution reports the actual product-card or shopping-list click context',()=>{
 assert.equal(affiliateClickSource('products'),'camp_product_card');
 assert.equal(affiliateClickSource('shopping'),'camp_shopping_list');
 assert.equal(affiliateClickSource('home'),'camp_other');
 assert.equal(affiliateClickSource('missing'),'camp_other');
});

test('real UI obtains live purchase plan and uses correct event source without false success',()=>{
 const app=readFileSync(new URL('../camp/app.js',import.meta.url),'utf8');
 assert.match(app,/purchaseSelectionContext\(t\.dataset\.category,plan\(state,data\)\)/);
 assert.match(app,/toast\(selection\.message\)/);
 assert.match(app,/planned_buy:selection\.plannedBuy\?1:0/);
 assert.match(app,/conversion_source:affiliateClickSource\(route\)/);
 assert.doesNotMatch(app,/conversion_source:'camp_missing_gear'/);
 assert.doesNotMatch(app,/toast\('買うものリストに追加しました。'\)/);
 assert.match(app,/track\('affiliate_click'/);
 assert.match(app,/track\('product_select'/);
});
