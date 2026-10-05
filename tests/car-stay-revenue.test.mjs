import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('CAR STAY carries SEO entry attribution into GA4 events',()=>{
  const app=read('car-stay/app.js');
  assert.match(app,/entrySource=\(qs\.get\("from"\)\|\|"direct"\)/);
  assert.match(app,/entryKey=\(qs\.get\("entry"\)\|\|""\)/);
  assert.match(app,/entry_source:entrySource/);
  assert.match(app,/entry_key:entryKey/);
});

test('CAR STAY measures gaps, free solutions, product views and exact affiliate clicks',()=>{
  const app=read('car-stay/app.js');
  for(const event of ['gap_generated','free_solution_view','product_view','affiliate_click','no_purchase_complete','builder_completed']){
    assert.ok(app.includes('"'+event+'"'),event);
  }
  assert.match(app,/data-gap=/);
  assert.match(app,/data-price=/);
  assert.match(app,/data-role=/);
  assert.match(app,/eligible_product_count/);
});

test('all vehicle SEO CTAs carry an entry key',()=>{
  for(const slug of ['n-box','sienta','freed','hustler','n-van','every']){
    const page=read('car-stay/car/'+slug+'/index.html');
    assert.ok(page.includes('&from=seo&entry='+slug),slug);
  }
});
