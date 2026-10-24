import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../assets/analytics-context.js',import.meta.url),'utf8');
function boot(search='',data=new Map(),blocked=false){
 const window={};const storage={getItem:k=>{if(blocked)throw Error('unavailable');return data.get(k)??null},setItem:(k,v)=>{if(blocked)throw Error('unavailable');data.set(k,v)}};
 vm.runInNewContext(source,{window,location:{search},URLSearchParams,localStorage:storage});return {ctx:window.SOTOJITAKU_ANALYTICS,window,data};
}
test('operator context survives cross-service navigation and test=0 clears it',()=>{
 const first=boot('?test=1');assert.equal(first.ctx.operatorTest,true);
 assert.equal(boot('',first.data).ctx.operatorTest,true);
 assert.equal(boot('?test=0',first.data).ctx.operatorTest,false);
 assert.equal(boot('',first.data).ctx.operatorTest,false);
});
test('both legacy opt-out keys disable the active stream; re-enable clears both',()=>{
 for(const key of ['sotojitaku_analytics_off','sotojitaku_analytics_optout']){
  const state=boot('',new Map([[key,'1']]));assert.equal(state.window['ga-disable-G-6STQ5HXRDH'],true);
  state.ctx.setEnabled(true);assert.equal(state.window['ga-disable-G-6STQ5HXRDH'],false);
  assert.equal(boot('',state.data).ctx.optedOut,false);
  state.ctx.setEnabled(false);assert.equal(boot('',state.data).ctx.optedOut,true);
 }
});
test('blocked storage still preserves explicit operator context and does not break the app',()=>{
 assert.equal(boot('?test=1',new Map(),true).ctx.operatorTest,true);
 assert.equal(boot('?test=0',new Map(),true).ctx.operatorTest,false);
});

test('operator QA suppresses production GA4 without changing opt-out preferences',()=>{
 const state=boot('?test=1');
 const flag='ga-disable-G-6STQ5HXRDH';
 assert.equal(state.ctx.operatorTest,true);
 assert.equal(state.ctx.optedOut,false);
 assert.equal(state.window[flag],true,'test=1 must disable GA4 before scripts run');
 state.ctx.setEnabled(true);
 assert.equal(state.ctx.optedOut,false,'QA isolation must not silently change privacy choice');
 assert.equal(state.window[flag],true,'analytics toggle must not re-enable GA4 during QA');
 assert.equal(boot('',state.data).window[flag],true,'subpage QA navigation stays isolated');
 const normal=boot('?test=0',state.data);
 assert.equal(normal.ctx.operatorTest,false);
 assert.equal(normal.window[flag],false,'ordinary visits must remain measurable');
});
