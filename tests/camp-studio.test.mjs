import test from "node:test";
import assert from "node:assert/strict";
import {resolveCampStudio,renderCampStudioScene} from "../camp/scene-studio.js";

const base={party_type:"couple",adults:2,children:0,season:"spring",stay:"one_night",transport:"car",experiences:["relax"]};
test("scene follows the existing seven questionnaire steps, without altering answers",()=>{
 const answers=structuredClone(base),before=JSON.stringify(answers);
 assert.equal(resolveCampStudio(answers,0).time,"morning");
 assert.equal(resolveCampStudio(answers,4).time,"evening");
 assert.equal(resolveCampStudio(answers,6).chips.includes("1泊2日"),true);
 assert.equal(JSON.stringify(answers),before);
});
test("chosen bonfire selects verified illustration asset, not product state",()=>{
 const a={...base,experiences:["bonfire","stargazing"]};
 const result=resolveCampStudio(a,5);
 assert.equal(result.variant,"bonfire");
 assert.equal(result.photo.desktop,"scene-bonfire-hd.webp");
 assert.equal(result.photo.mobile,"evening-bonfire-portrait.webp");
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
