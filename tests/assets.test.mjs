import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');const hash=f=>crypto.createHash('sha256').update(read(f)).digest('hex').slice(0,12);
test('Pages release fingerprints match actual JS and CSS bytes',()=>{const html=read('camp/index.html'),app=read('camp/app.js');for(const f of ['app.js','style.css'])assert(html.includes(f+'?v='+hash(f==='app.js'?'camp/app.js':f)));for(const f of ['engine.js','products.js'])assert(app.includes(f+'?v='+hash(f==='app.js'?'camp/app.js':f)));});

test('HOME stylesheet fingerprint matches its content',()=>assert(read('index.html').includes('home.css?v='+hash('home.css'))));

test('CAMP Scene Studio references follow the real JS and CSS bytes',()=>{
  assert(read('camp/app.js').includes('scene-studio.js?v='+hash('camp/scene-studio.js')));
  assert(read('camp/index.html').includes('studio.css?v='+hash('camp/studio.css')));
});
