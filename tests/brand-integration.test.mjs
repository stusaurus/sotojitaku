import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

test('approved main/mini logo and existing favicon bytes are unchanged', () => {
  for (const [path, expected] of [
    ['assets/brand/sotojitaku/main-horizontal-original-white.png', '59ccc839f6ebaa6c862de4085d13e90b3e1405001d5da3b72de9f78cf2f57430'],
    ['assets/brand/sotojitaku/mini-64.png', 'd873d6caf86452286de59cea40200478f927d8bc6f496b581fbd89080edf706e'],
    ['assets/favicon.svg', '91875ad729fd979fad0e8032aec565c54261067b648ed938f4865e335a82c8a0'],
  ]) assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), expected, path);
});

test('all four brand entrances retain SEO, images, keyboard entry and shared header styling', () => {
  for (const path of ['index.html','camp/index.html','car-stay/index.html','fishing/index.html']) {
    const html = readFileSync(path, 'utf8');
    for (const pattern of [/brand-shell/, /brand-header\.css/, /rel="canonical"/, /name="description"/, /property="og:image"/, /rel="icon"/, /class="skip-link"/, /id="main"/]) assert.match(html, pattern, path);
  }
  assert.match(readFileSync('index.html','utf8'), /main-horizontal-original-white\.png/);
});

test('compact navigation remains native and keyboard accessible without logo transformations', () => {
  for (const path of ['index.html','car-stay/index.html','fishing/index.html']) {
    const html=readFileSync(path,'utf8');
    assert.match(html, /<details[^>]*data-brand-menu/);
    assert.match(html, /<summary/);
    assert.match(html, /brand-navigation\.js/);
  }
  const script=readFileSync('assets/brand/brand-navigation.js','utf8');
  assert.match(script, /Escape/);
  assert.match(script, /\.focus\(/);
});
