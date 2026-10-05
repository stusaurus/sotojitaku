import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const slugs=['n-box','sienta','freed','hustler','n-van','every'];

test('CAR STAY vehicle SEO hub is indexable and links all initial vehicles',()=>{
  const hub=read('car-stay/car/index.html');
  assert.ok(hub.length>1800);
  assert.match(hub,/rel="canonical"/);
  for(const slug of slugs)assert.ok(hub.includes('./'+slug+'/'),slug);
});

test('CAR STAY vehicle SEO pages are substantive, canonical and Builder-linked',()=>{
  const sitemap=read('sitemap.xml');
  for(const slug of slugs){
    const p=read('car-stay/car/'+slug+'/index.html');
    assert.ok(p.length>4300,slug+' page should not be thin');
    assert.match(p,/rel="canonical"/);
    assert.match(p,/FAQPage/);
    assert.match(p,/QUICK MEASURE/);
    assert.match(p,/\?vehicle=/);
    assert.ok(!/TODO|ダミー|lorem ipsum/i.test(p));
    assert.ok(sitemap.includes('/car-stay/car/'+slug+'/'));
  }
});

test('Every SEO entry never silently assumes DA17V',()=>{
  const p=read('car-stay/car/every/index.html');
  assert.ok(p.includes('vehicle=suzuki-every-da17v'));
  assert.ok(p.includes('vehicle=suzuki-every-da18v'));
});

test('SEO vehicle query can preselect Builder and is tracked separately',()=>{
  const app=read('car-stay/app.js');
  assert.match(app,/presetVehicle=qs\.get\("vehicle"\)/);
  assert.match(app,/seo_builder_entry/);
  assert.match(app,/db\.vehicles\.some\(v=>v\.vehicleId===presetVehicle\)/);
});


test('N-BOX high-intent SEO pages are substantive and connected to Builder',()=>{
  const sitemap=read('sitemap.xml');
  const parent=read('car-stay/car/n-box/index.html');
  for(const slug of ['mat','shade']){
    const p=read('car-stay/car/n-box/'+slug+'/index.html');
    assert.ok(p.length>4800,slug+' intent page should not be thin');
    assert.match(p,/rel="canonical"/);
    assert.match(p,/FAQPage/);
    assert.ok(p.includes('vehicle=honda-nbox-jf5-jf6'));
    assert.ok(p.includes('entry=n-box-'+slug));
    assert.ok(sitemap.includes('/car-stay/car/n-box/'+slug+'/'));
    assert.ok(parent.includes('./'+slug+'/'));
  }
});
