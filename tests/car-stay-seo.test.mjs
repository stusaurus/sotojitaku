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


test('Sienta and FREED shade intent pages are substantive and Builder-attributed',()=>{
  const sitemap=read('sitemap.xml');
  const cases=[
    {slug:'sienta',vehicle:'toyota-sienta-10-15'},
    {slug:'freed',vehicle:'honda-freed-gt'}
  ];
  for(const x of cases){
    const p=read('car-stay/car/'+x.slug+'/shade/index.html');
    const parent=read('car-stay/car/'+x.slug+'/index.html');
    assert.ok(p.length>4700,x.slug+' shade page should not be thin');
    assert.match(p,/rel="canonical"/);
    assert.match(p,/FAQPage/);
    assert.ok(p.includes('vehicle='+x.vehicle));
    assert.ok(p.includes('entry='+x.slug+'-shade'));
    assert.ok(sitemap.includes('/car-stay/car/'+x.slug+'/shade/'));
    assert.ok(parent.includes('./shade/'));
  }
});


test('Hustler, N-VAN and Every shade intent pages are substantive and Builder-attributed',()=>{
  const sitemap=read('sitemap.xml');
  const cases=[
    {slug:'hustler',vehicle:'suzuki-hustler-mr52s-mr92s'},
    {slug:'n-van',vehicle:'honda-nvan-jj1-jj2'},
    {slug:'every',vehicle:'suzuki-every-da17v',also:'suzuki-every-da18v'}
  ];
  for(const x of cases){
    const p=read('car-stay/car/'+x.slug+'/shade/index.html');
    const parent=read('car-stay/car/'+x.slug+'/index.html');
    assert.ok(p.length>4700,x.slug+' shade page should not be thin');
    assert.match(p,/rel="canonical"/);
    assert.match(p,/FAQPage/);
    assert.ok(p.includes('vehicle='+x.vehicle));
    if(x.also)assert.ok(p.includes('vehicle='+x.also));
    assert.ok(p.includes('entry='+x.slug+'-shade'));
    assert.ok(sitemap.includes('/car-stay/car/'+x.slug+'/shade/'));
    assert.ok(parent.includes('./shade/'));
  }
});


test('Sienta, FREED, N-VAN and Hustler mat intent pages are substantive and Builder-attributed',()=>{
  const sitemap=read('sitemap.xml');
  const cases=[
    {slug:'sienta',vehicle:'toyota-sienta-10-15'},
    {slug:'freed',vehicle:'honda-freed-gt'},
    {slug:'n-van',vehicle:'honda-nvan-jj1-jj2'},
    {slug:'hustler',vehicle:'suzuki-hustler-mr52s-mr92s'}
  ];
  for(const x of cases){
    const p=read('car-stay/car/'+x.slug+'/mat/index.html');
    const parent=read('car-stay/car/'+x.slug+'/index.html');
    assert.ok(p.length>4300,x.slug+' mat page should not be thin');
    assert.match(p,/rel="canonical"/);
    assert.match(p,/FAQPage/);
    assert.match(p,/seo\.js/);
    assert.ok(p.includes('vehicle='+x.vehicle));
    assert.ok(p.includes('entry='+x.slug+'-mat'));
    assert.ok(sitemap.includes('/car-stay/car/'+x.slug+'/mat/'));
    assert.ok(parent.includes('./mat/'));
  }
});

test('CAR STAY sitemap has no literal escaped newline text',()=>{
  const sitemap=read('sitemap.xml');
  assert.equal(sitemap.includes('\\n  <url>'),false);
});

test('FREED SEO page reflects verified Honda 5-seat CROSSTAR measurements',()=>{
  const p=read('car-stay/car/freed/index.html');
  assert.match(p,/約197cm/);
  assert.match(p,/約2\.5cm/);
  assert.match(p,/CROSSTAR 5人乗り/);
  assert.match(p,/https:\/\/www\.honda\.co\.jp\/outdoor\/stay-car\/freed\.html/);
});


test('high-intent SEO pages share the verified-product renderer',()=>{
  for(const slug of slugs){
    for(const intent of ['mat','shade']){
      const p=read('car-stay/car/'+slug+'/'+intent+'/index.html');
      assert.match(p,/seo\.js/);
      assert.match(p,/class="builder-box"/);
    }
  }
  const js=read('car-stay/seo.js');
  assert.match(js,/seo_product_view/);
  assert.match(js,/seo_affiliate_click/);
  assert.match(js,/LIVE AUDITED PICKS/);
});

test('current live catalog is safe for direct SEO purchase cards',()=>{
  const data=JSON.parse(read('car-stay/data/audited-products.json'));
  for(const p of data.products||[]){
    assert.equal(p.audit?.status,'verified_live');
    assert.ok(Number.isFinite(p.price)&&p.price>0);
    assert.match(p.image||'',/^https:\/\//);
    const affiliate=new URL(p.affiliateUrl);
    assert.equal(affiliate.hostname,'hb.afl.rakuten.co.jp');
    const target=new URL(affiliate.searchParams.get('pc'));
    assert.equal(target.hostname,'item.rakuten.co.jp');
    assert.equal(target.pathname.replace(/\/+$/,'')+'/',new URL(p.itemUrl).pathname.replace(/\/+$/,'')+'/');
  }
});


test('N-BOX SEO copy treats Slope as a separate validation path',()=>{
  const pages=[
    read('car-stay/car/n-box/index.html'),
    read('car-stay/car/n-box/mat/index.html'),
    read('car-stay/car/n-box/shade/index.html')
  ];
  for(const page of pages){
    assert.match(page,/Slope/);
    assert.match(page,/(別検証|判定対象外|通常判定から除外|流用せず)/);
  }
  assert.ok(!pages[0].includes('通常・Custom・JOY・Slopeで用品適合が変わる'));
});


test('CAR STAY sitemap entries carry the current publish date',()=>{
  const sitemap=read('sitemap.xml');
  for(const line of sitemap.split('\n').filter(line=>line.includes('/car-stay/'))){
    assert.match(line,/<lastmod>2026-10-06<\/lastmod>/);
  }
});


test('SEO fit picker gates restricted products and carries the choice into Builder',()=>{
  const js=read('car-stay/seo.js');
  const app=read('car-stay/app.js');
  assert.match(js,/const SEO_CONFIGS=/);
  assert.match(js,/"sienta":\[/);
  assert.match(js,/"freed":\[/);
  assert.match(js,/seo_config_select/);
  assert.match(js,/searchParams\.set\("seatCount"/);
  assert.match(js,/searchParams\.set\("trim"/);
  assert.match(js,/違う乗車定員・グレードの商品を出さない/);
  assert.match(js,/楽天アフィリエイト/);
  assert.match(js,/recommendation_role/);
  assert.match(app,/presetSeatCount=qs\.get\("seatCount"\)/);
  assert.match(app,/presetTrim=qs\.get\("trim"\)/);
  assert.match(app,/seat_count:state\.config\.seatCount\|\|0/);
  assert.match(app,/trim:state\.config\.trim\|\|""/);
});


test('two-person CAR STAY SEO pages are substantive and preselect two people in Builder',()=>{
  const sitemap=read('sitemap.xml');
  const app=read('car-stay/app.js');
  for(const slug of slugs){
    const p=read('car-stay/car/'+slug+'/2people/index.html');
    const parent=read('car-stay/car/'+slug+'/index.html');
    assert.ok(p.length>5000,slug+' two-person page should not be thin');
    assert.match(p,/rel="canonical"/);
    assert.match(p,/FAQPage/);
    assert.match(p,/QUICK MEASURE/);
    assert.ok(p.includes('party=2'));
    assert.ok(p.includes('entry='+slug+'-2people'));
    assert.ok(parent.includes('./2people/'));
    assert.ok(sitemap.includes('/car-stay/car/'+slug+'/2people/'));
  }
  assert.match(app,/presetParty=Number\(qs\.get\("party"\)\)/);
  assert.match(app,/party_count:state\.people\.length/);
});

test('two-person pages do not claim vehicle-name-only approval',()=>{
  for(const slug of slugs){
    const p=read('car-stay/car/'+slug+'/2people/index.html');
    assert.match(p,/一番狭い/);
    assert.match(p,/110cm/);
    assert.match(p,/(断定しません|断定しない)/);
  }
});
