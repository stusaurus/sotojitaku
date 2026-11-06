import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {eligibleChoiceCopy} from '../camp/choice-presentation.js';

test('no listings never pretend that products can be compared',()=>{
  const copy=eligibleChoiceCopy(0);
  assert.equal(copy.status,'empty');
  assert.equal(copy.showPreferences,false);
  assert.equal(copy.title,'');
});

test('one eligible listing does not imply best or allow ineffective preferences',()=>{
  const copy=eligibleChoiceCopy(1);
  assert.equal(copy.status,'single');
  assert.equal(copy.showPreferences,false);
  assert.match(copy.note,/比較できる別の掲載候補がない/);
  assert.match(copy.note,/最安・最適とは断定せず/);
  assert.doesNotMatch(copy.title,/まずこれ|最安|1位/);
});

test('meaningful two or three eligible candidates preserve preference controls',()=>{
  for (const count of [2,3]) {
    const copy=eligibleChoiceCopy(count);
    assert.equal(copy.status,'compare');
    assert.equal(copy.showPreferences,true);
    assert.equal(copy.note,'');
  }
});

test('invalid counts fail closed',()=>{
  for (const count of [-1,1.5,NaN,Infinity,4,'2',null]) {
    assert.equal(eligibleChoiceCopy(count).showPreferences,false);
  }
});

test('CAMP live renderer uses actual recommendation count and hides misleading rank',()=>{
  const code=readFileSync(new URL('../camp/app.js',import.meta.url),'utf8');
  assert.match(code,/eligibleChoiceCopy\(recs\.length\)/);
  assert.match(code,/choice\.showPreferences\?preferenceSelector\(c\):''/);
  assert.match(code,/data-choice-single/);
  assert.match(code,/productCard\(recs\[0\],c,0,choice\.status==='single'\)/);
  assert.match(code,/hero&&!single/);
  assert.match(code,/single\?'確認できた掲載候補1件'/);
  assert.match(code,/recs=recommend\(data\.products\.products/);
  assert.match(code,/if\(!recs\.length\)|recs\.length\?/);
  assert.doesNotMatch(code,/const choice=eligibleChoiceCopy\(data\.products\.products\.length\)/);
});
