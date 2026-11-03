import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const count = (text) => html.split(text).length - 1;

test('A8 creative keeps the exact supplied URL, banner and pixel once', () => {
  assert.equal(count('href="https://px.a8.net/svt/ejp?a8mat=4BGCF2+6HZHDM+4NJ4+609HT"'), 1);
  assert.equal(count('src="https://www22.a8.net/svt/bgt?aid=261103070393&wid=006&eno=01&mid=s00000021712001009000&mc=1"'), 1);
  assert.equal(count('src="https://www14.a8.net/0.gif?a8mat=4BGCF2+6HZHDM+4NJ4+609HT"'), 1);
  assert.match(html, /width="300" height="250" alt="" loading="lazy"/);
});
test('A8 banner is clearly disclosed and separate from the journeys', () => {
  assert.equal(count('id="soto-a8-home"'), 1);
  assert.equal(count('id="soto-a8-home-style"'), 1);
  assert.equal(count('広告｜A8.netアフィリエイト'), 1);
  assert.match(html, /rel="nofollow sponsored"/);
  assert.ok(html.indexOf('<section class="closing">') < html.indexOf('a8-sotojitaku-home-4NJ4'));
  assert.ok(html.indexOf('a8-sotojitaku-home-4NJ4') < html.indexOf('</main>'));
  for (const route of ['camp/', 'car-stay/', 'fishing/']) assert.ok(html.includes('href="' + route + '"'));
});
test('A8 click is segmented in GA4 and honors test and opt-out', () => {
  assert.match(html, /affiliate:'a8'/);
  assert.match(html, /ad_placement:'home_footer_banner'/);
  assert.match(html, /operator_test:window.SOTOJITAKU_ANALYTICS.operatorTest/);
  assert.match(html, /SOTOJITAKU_ANALYTICS\?\.optedOut/);
  assert.match(html, /addEventListener\('click',recordA8Click\)/);
  assert.match(html, /addEventListener\('auxclick',recordA8Click\)/);
});
test('no A8 ad appears in the three diagnostic entry HTML files', () => {
  for (const route of ['camp/index.html', 'car-stay/index.html', 'fishing/index.html']) {
    const page = readFileSync(new URL('../' + route, import.meta.url), 'utf8');
    assert.ok(!page.includes('4BGCF2+6HZHDM+4NJ4+609HT'), route);
  }
});
