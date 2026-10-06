import test from "node:test";
import assert from "node:assert/strict";
import {selectPlan,buildGearChecklist,evaluateReadiness,resultHeadline} from "../fishing/engine.js";

const plans={
  tie_breaker:["sabiki","choi_nage"],
  methods:[
    {id:"sabiki",name:"サビキ",headline:"",targets:[],base_score:40,scoring:[
      {question:"fun",value:"easy_catch",delta:35},
      {question:"fun",value:"choose_for_me",delta:20},
      {question:"party",value:"family_child",delta:20}
    ],variants:{
      low_mess:{when:{bait:"low_mess"},modifier:"tube_chum"},
      standard:{when:{bait:["okay","no_worm"]},modifier:"standard"}
    }},
    {id:"choi_nage",name:"ちょい投げ",headline:"",targets:[],base_score:35,scoring:[
      {question:"fun",value:"cast_wait",delta:40},
      {question:"party",value:"solo",delta:10}
    ],variants:{
      artificial_bait:{when:{bait:["no_worm","low_mess"]},modifier:"artificial_bait"},
      standard:{when:{bait:"okay"},modifier:"standard"}
    }}
  ]
};

const gear={categories:[
  {id:"rod_reel",label:"竿・リール",required:["sabiki","choi_nage"],owned_key:"rod_reel"},
  {id:"life_jacket",label:"ライフジャケット",required:["sabiki","choi_nage"],owned_key:"life_jacket"},
  {id:"bucket",label:"バケツ",required:["sabiki"],owned_key:"bucket"},
  {id:"cooler",label:"クーラー",required_when:{take_home:["yes","undecided"]},owned_key:"cooler"}
]};

test("family easy-catch low-mess selects sabiki",()=>{
  const plan=selectPlan({party:"family_child",fun:"easy_catch",bait:"low_mess"},plans);
  assert.equal(plan.methodId,"sabiki");
  assert.equal(plan.variantKey,"low_mess");
});

test("solo cast-and-wait with no worms selects choi-nage artificial bait",()=>{
  const plan=selectPlan({party:"solo",fun:"cast_wait",bait:"no_worm"},plans);
  assert.equal(plan.methodId,"choi_nage");
  assert.equal(plan.variantKey,"artificial_bait");
});

test("owned items are removed from needed state",()=>{
  const input={party:"family_child",fun:"easy_catch",bait:"low_mess",take_home:"yes",owned:["life_jacket","cooler"]};
  const plan=selectPlan(input,plans);
  const list=buildGearChecklist(input,plan,gear);
  assert.equal(list.find(x=>x.id==="life_jacket").state,"owned");
  assert.equal(list.find(x=>x.id==="cooler").state,"owned");
  assert.equal(list.find(x=>x.id==="rod_reel").state,"needed");
});

test("no take-home means cooler is not required",()=>{
  const input={party:"solo",fun:"cast_wait",bait:"okay",take_home:"no",owned:[]};
  const plan=selectPlan(input,plans);
  const list=buildGearChecklist(input,plan,gear);
  assert.equal(list.some(x=>x.id==="cooler"),false);
});

test("unconfirmed local rules prevents READY",()=>{
  const input={party:"solo",fun:"cast_wait",bait:"okay",take_home:"no",owned:["rod_reel","life_jacket"]};
  const plan=selectPlan(input,plans);
  const result=evaluateReadiness({input,plan,gearData:gear,context:{localRulesConfirmed:false}});
  assert.equal(result.status,"CHALLENGE");
});

test("unsafe context forces CHANGE_PLAN",()=>{
  const input={party:"solo",fun:"cast_wait",bait:"okay",take_home:"no",owned:["rod_reel","life_jacket"]};
  const plan=selectPlan(input,plans);
  const result=evaluateReadiness({input,plan,gearData:gear,context:{localRulesConfirmed:true,unsafeContext:true}});
  assert.equal(result.status,"CHANGE_PLAN");
  assert.equal(resultHeadline(result),"今回は、道具より条件を変えましょう。");
});

test("missing required gear is ALMOST_READY after rules confirmed",()=>{
  const input={party:"solo",fun:"cast_wait",bait:"okay",take_home:"no",owned:["rod_reel"]};
  const plan=selectPlan(input,plans);
  const result=evaluateReadiness({input,plan,gearData:gear,context:{localRulesConfirmed:true}});
  assert.equal(result.status,"ALMOST_READY");
  assert.equal(result.missing.some(x=>x.id==="life_jacket"),true);
});

test("child PFD becomes monetizable only after a supported fit band is chosen",()=>{
  const localGear={categories:[{
    id:"life_jacket_child",
    label:"子ども用",
    required_when:{party:["family_child"]},
    monetizable:false,
    monetizable_when:{child_fit:["m_all","l_all"]},
    owned_key:"life_jacket_child",
    fit_sensitive:true
  }]};
  const plan={methodId:"sabiki"};

  const unknown=buildGearChecklist({party:"family_child",child_fit:"unknown_mixed",owned:[]},plan,localGear);
  assert.equal(unknown[0].monetizable,false);
  assert.equal(unknown[0].state,"needed");

  const m=buildGearChecklist({party:"family_child",child_fit:"m_all",owned:[]},plan,localGear);
  assert.equal(m[0].monetizable,true);

  const l=buildGearChecklist({party:"family_child",child_fit:"l_all",owned:[]},plan,localGear);
  assert.equal(l[0].monetizable,true);
});
