import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const GA_ID = 'G-6STQ5HXRDH';

test('HOME and three services reference the same GA4 measurement ID', () => {
  for (const path of ['index.html','camp/index.html','car-stay/index.html','fishing/index.html']) {
    assert.ok(read(path).includes(GA_ID), path + ' must use GA4 measurement ID');
  }
});
test('HOME uses a stable service_id while preserving the legacy service field', () => {
  const home = read('index.html');
  assert.ok(home.includes("gtag('event','service_select'"));
  assert.ok(home.includes('service:this.dataset.service'));
  assert.ok(home.includes('service_id:this.dataset.service'));
  assert.ok(home.includes('operator_test:window.SOTOJITAKU_ANALYTICS.operatorTest'));
  assert.ok(home.indexOf('analytics-context.js')<home.indexOf("gtag('config'"));
});
test('all services preserve legacy events and expose shared journey and product events', () => {
  for (const app of ['camp/app.js','car-stay/app.js','fishing/app.js']) {
    const code = read(app);
    for (const event of ['journey_start','journey_complete','product_view','affiliate_click','service_id','operator_test']) {
      assert.ok(code.includes(event), app + ' missing ' + event);
    }
  }
});
test('FISHING cache fingerprint changes along with its operator-test tracking', () => {
  const html = read('fishing/index.html');
  const code = read('fishing/app.js');
  assert.match(html,/app\.js\?v=[a-f0-9]{12}/);
  assert.ok(code.includes('window.SOTOJITAKU_ANALYTICS?.operatorTest'));
});

test('CAMP keeps local QA event assertions while the production GA4 tag is blocked',()=>{
  const app=read('camp/app.js');
  assert.match(app,/function analyticsDisabled\(\)\{return window\.SOTOJITAKU_ANALYTICS\?\.optedOut/);
  assert.match(app,/export function track\(name,params=\{\}\)/);
});
