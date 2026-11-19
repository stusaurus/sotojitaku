import test from "node:test";
import assert from "node:assert/strict";
import {projectWorld,resolveCampStudio,renderCampStudioScene} from "../camp/scene-studio.js";

const base={party_type:"couple",adults:2,children:0,season:"spring",stay:"one_night",transport:"car",experiences:["relax"]};
test("scene follows the existing seven questionnaire steps, without altering answers",()=>{
 const answers=structuredClone(base),before=JSON.stringify(answers);
 assert.equal(resolveCampStudio(answers,0).time,"morning");
 assert.equal(resolveCampStudio(answers,4).time,"evening");
 assert.equal(resolveCampStudio(answers,6).chips.includes("1泊2日"),true);
 assert.equal(JSON.stringify(answers),before);
});
test("bonfire keeps the same camera and exposes the planned fire pit",()=>{
 const a={...base,experiences:["bonfire","stargazing"]};
 const result=resolveCampStudio(a,5);
 assert.equal(result.variant,"bonfire");
 const gear=[{id:"fire_pit",quantity:1,status:"rent"}];
 const initial=renderCampStudioScene({answers:a,step:0,gear});
 const night=renderCampStudioScene({answers:a,step:5,gear});
 for(const html of [initial,night])assert.match(html,/world\/lake.webp/);
 assert.doesNotMatch(initial,/data-inspect="fire_pit"/);
 assert.match(night,/data-inspect="fire_pit"/);
 assert.equal(projectWorld(a,5,gear)[0].status,"レンタル予定・予約要確認");

});
test("a daytrip never enables the night preview or overnight fire scene",()=>{
 const a={...base,stay:"daytrip",experiences:["bonfire","stargazing"]};
 const view=resolveCampStudio(a,6,"night");
 assert.equal(view.time,"evening");
 assert.equal(view.nightDisabled,true);
 assert.notEqual(view.variant,"bonfire");
 assert.match(renderCampStudioScene({answers:a,step:6,previewTime:"night"}),/data-scene-preview="night" aria-pressed="false" disabled/);
});
test("preview is selectable independently of diagnosis, and does not persist",()=>{
 const a=structuredClone(base),original=JSON.stringify(a);
 const before=renderCampStudioScene({answers:a,step:2});
 const after=renderCampStudioScene({answers:a,step:2,previewTime:"night"});
 assert.match(before,/data-studio-time="morning"/);
 assert.match(after,/data-studio-time="night"/);
 assert.match(after,/時間帯の切替は診断・安全判定を変更しません/);
 assert.equal(JSON.stringify(a),original);
});
test("unknown or malformed selections cannot inject markup into scene",()=>{
 const html=renderCampStudioScene({answers:{party_type:'<img src=x>',experiences:["<script>","bbq"],adults:2,children:0},step:800,previewTime:"javascript:alert(1)"});
 assert.doesNotMatch(html,/<script>|<img src=x>|javascript:alert/);
 assert.match(html,/data-studio-time="evening"/);
 assert.match(html,/BBQ/);
});

test("four illustrated chairs have intentionally varied mirrored camera-stable poses",()=>{
 const a={...base,party_type:"family",adults:2,children:2};
 const gear=[{id:"chair",quantity:4,status:"owned"}];
 const chairs=projectWorld(a,5,gear,true).filter(item=>item.id==="chair");
 assert.equal(chairs.length,4);
 assert.equal(new Set(chairs.map(c=>c.chairPose)).size,4);
 const html=renderCampStudioScene({answers:a,step:5,gear,partyChosen:true});
 assert.match(html,/data-chair-pose="mirrored"/);
 assert.match(html,/data-chair-pose="mirrored-near"/);
});
test("night floor illumination is conditional on non-deferred planned fire and lantern",()=>{
 const a={...base,experiences:["bonfire"]};
 const fire={id:"fire_pit",quantity:1,status:"rent"};
 const lantern={id:"led_lantern",quantity:1,status:"buy"};
 const render=(gear)=>renderCampStudioScene({answers:a,step:5,previewTime:"night",gear});
 assert.match(render([fire,lantern]),/data-fire-glow="true" data-lantern-glow="true"/);
 assert.match(render([{...fire,status:"skip"},{...lantern,status:"undecided"}]),/data-fire-glow="false" data-lantern-glow="false"/);
 assert.match(render([fire]),/world-fire-spill/);
 assert.match(render([fire]),/world-lantern-spill/);
});

test("small gear retains world-relative size while exposing an independent hit target",()=>{
 const a={...base,experiences:["coffee"]};
 const gear=[{id:"kettle",quantity:1,status:"buy"},{id:"led_lantern",quantity:1,status:"owned"}];
 const html=renderCampStudioScene({answers:a,step:5,gear});
 for(const id of ["kettle","led_lantern"]){
   const button=html.match(new RegExp('<button class="world-object"[^>]*data-inspect="'+id+'"[^>]*>'))?.[0];
   assert(button,"expected "+id+" world object");
   assert.match(button,/--w:5%;--visual-width:5cqw/);
 }
});


test("inspection rows tie scene thumbnails to honest planned acquisition statuses",()=>{
 const a={...base,experiences:["bonfire","coffee"]};
 const gear=[
  {id:"tent",quantity:1,status:"rent",detail:"現地の受け取りを確認"},
  {id:"fire_pit",quantity:1,status:"buy",detail:"燃料は別途確認"},
  {id:"kettle",quantity:1,status:"skip",detail:"次回に回す"}
 ];
 const html=renderCampStudioScene({answers:a,step:5,gear});
 assert.match(html,/data-world-row="tent" data-world-status="rent"/);
 assert.match(html,/data-status="rent">レンタル予定・予約要確認/);
 assert.match(html,/data-world-row="fire_pit" data-world-status="buy"/);
 assert.match(html,/data-status="buy">購入予定・未購入/);
 assert.match(html,/data-world-row="kettle" data-world-status="skip"/);
 assert.match(html,/data-status="skip">今回は見送り/);
 assert.match(html,/<img src="\.\/world\/kettle\.webp" alt="" loading="lazy">/);
 assert.match(html,/未購入・レンタル未予約の道具は確保済みではありません/);
});
test("inspection notes are escaped even if unusual details enter the visual adapter",()=>{
 const html=renderCampStudioScene({answers:base,step:5,gear:[
  {id:"tent",quantity:1,status:"owned",detail:'<img src=x onerror="alert(1)">'}
 ]});
 assert.doesNotMatch(html,/onerror="alert\(1\)"/);
 assert.match(html,/&lt;img src=x/);
});
