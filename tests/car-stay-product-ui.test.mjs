import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../car-stay/app.js',import.meta.url),'utf8');

test('CAR STAY result uses product-present trust copy and a distinct no-product state',()=>{
  assert.match(app,/eligibleProductCount>0/);
  assert.match(app,/表示しているのは、今の条件に合う確認済み商品だけ/);
  assert.match(app,/この条件で安全に出せる監査済み商品はまだありません/);
});

test('CAR STAY product cards distinguish the first recommendation',()=>{
  assert.match(app,/top-pick-badge/);
  assert.match(app,/まず見る/);
  assert.match(app,/index===0/);
});


test('CAR STAY asks for real electric blanket power instead of guessing capacity',()=>{
  assert.match(app,/data-power='blanketW'/);
  assert.match(app,/data-power='hours'/);
  assert.match(app,/容量を推測して商品は出しません/);
  assert.match(app,/必要容量の目安/);
});


test('CAR STAY records deduplicated five-step funnel views and completions',()=>{
  assert.match(app,/carstay_step_view/);
  assert.match(app,/carstay_step_complete/);
  assert.match(app,/FUNNEL_STEP_KEYS=\["vehicle","party","trip","environment","gear"\]/);
  assert.match(app,/viewedFunnelSteps\.has\(step\)/);
  assert.match(app,/completedFunnelSteps\.has\(step\)/);
  assert.match(app,/funnel_name:"car_stay_builder"/);
});
