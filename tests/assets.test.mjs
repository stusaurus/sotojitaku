import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');const hash=f=>crypto.createHash('sha256').update(read(f)).digest('hex').slice(0,12);
test('Pages release fingerprints match actual JS and CSS bytes',()=>{const html=read('index.html'),app=read('app.js');for(const f of ['app.js','style.css'])assert(html.includes(f+'?v='+hash(f)));for(const f of ['engine.js','products.js'])assert(app.includes(f+'?v='+hash(f)));});


test('SEO guide pages and scheduled deploy stay in sync',()=>{
  for(const f of ['camp-guide/index.html','camp-guide/budget/index.html','camp-guide/family/index.html','camp-guide/sleep/index.html','camp-guide/cooking/index.html','camp-guide/bonfire/index.html','camp-guide/guide.css']) assert(fs.existsSync(new URL('../'+f,import.meta.url)),'missing '+f);
  const sitemap=read('sitemap.xml');
  for(const p of ['/camp-guide/','/camp-guide/budget/','/camp-guide/family/','/camp-guide/sleep/','/camp-guide/cooking/','/camp-guide/bonfire/']) assert(sitemap.includes('https://stusaurus.github.io/sotojitaku'+p),'sitemap missing '+p);
  const workflow=read('.github/workflows/refresh-products.yml');
  assert(workflow.includes('cp -r assets data camp-guide public/'));
});
