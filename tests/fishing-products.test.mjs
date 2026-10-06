import test from "node:test";
import assert from "node:assert/strict";
import {buildProductRecommendations,applyProductCoverage} from "../fishing/products.js";

const now=Date.parse("2026-10-05T12:00:00Z");
const aff=item=>"https://hb.afl.rakuten.co.jp/hgc/test/?pc="+encodeURIComponent(item);
const p=(x)=>({
  audit:{status:"verified_live"},verifiedAt:"2026-10-05T10:00:00Z",
  itemUrl:x.itemUrl||"https://item.rakuten.co.jp/test/"+x.productId+"/",
  affiliateUrl:aff(x.itemUrl||"https://item.rakuten.co.jp/test/"+x.productId+"/"),
  image:"https://example.com/a.jpg",price:5000,score:80,
  methodIds:["sabiki"],budgetTiers:["balanced"],audiences:["family","adult"],
  ...x
});

test("complete starter set suppresses categories it already covers",()=>{
  const products=[
    p({productId:"complete",categoryId:"rod_reel",score:90,recommendationRole:"beginner_default",coverCategoryIds:["rod_reel","rig","bait","bucket","fish_grip"]}),
    p({productId:"rod",categoryId:"rod_reel",score:95,coverCategoryIds:["rod_reel"]}),
    p({productId:"rig",categoryId:"rig",coverCategoryIds:["rig"]}),
    p({productId:"bait",categoryId:"bait",coverCategoryIds:["bait"]})
  ];
  const checklist=["rod_reel","rig","bait","bucket","fish_grip"].map(id=>({id,monetizable:true,state:"needed",priority:"required"}));
  const result=buildProductRecommendations(products,{input:{budget:"balanced",bait:"okay"},plan:{methodId:"sabiki"},checklist,now});
  assert.equal(result.recommendations.rod_reel.primary.productId,"complete");
  assert.deepEqual(new Set(result.coveredCategoryIds),new Set(["rod_reel","rig","bait","bucket","fish_grip"]));
  assert.equal(result.selected.length,1);
});

test("child life jacket never receives adult product",()=>{
  const child=p({productId:"kid",categoryId:"life_jacket_child",audiences:["child"],score:90,coverCategoryIds:["life_jacket_child"]});
  const adult=p({productId:"adult",categoryId:"life_jacket_child",audiences:["adult"],score:99,coverCategoryIds:["life_jacket_child"]});
  const checklist=[{id:"life_jacket_child",monetizable:true,state:"needed",priority:"required"}];
  const result=buildProductRecommendations([adult,child],{input:{budget:"balanced",bait:"okay"},plan:{methodId:"sabiki"},checklist,now});
  assert.equal(result.recommendations.life_jacket_child.primary.productId,"kid");
});

test("bundle coverage changes checklist state",()=>{
  const checklist=[
    {id:"rod_reel",state:"needed"},
    {id:"rig",state:"needed"},
    {id:"life_jacket_adult",state:"needed"}
  ];
  const out=applyProductCoverage(checklist,[{categoryId:"rod_reel",coverCategoryIds:["rod_reel","rig"]}]);
  assert.equal(out.find(x=>x.id==="rod_reel").state,"covered_by_product");
  assert.equal(out.find(x=>x.id==="rig").state,"covered_by_product");
  assert.equal(out.find(x=>x.id==="life_jacket_adult").state,"needed");
});


test("strict bait preference keeps bundle bait unresolved and recommends a matching bait",()=>{
  const complete=p({
    productId:"complete",
    categoryId:"rod_reel",
    score:96,
    recommendationRole:"beginner_default",
    coverCategoryIds:["rod_reel","rig","bait","bucket","fish_grip"],
    preferenceTags:[]
  });
  const lowMessBait=p({
    productId:"ami",
    categoryId:"bait",
    score:97,
    coverCategoryIds:["bait"],
    preferenceTags:["low_mess","no_worm"]
  });
  const checklist=["rod_reel","rig","bait","bucket","fish_grip"].map(id=>({
    id,monetizable:true,state:"needed",priority:"required"
  }));
  const result=buildProductRecommendations(
    [complete,lowMessBait],
    {input:{budget:"balanced",bait:"low_mess"},plan:{methodId:"sabiki"},checklist,now}
  );
  assert.equal(result.recommendations.rod_reel.primary.productId,"complete");
  assert.equal(result.recommendations.bait.primary.productId,"ami");
  assert.equal(result.recommendations.rod_reel.primary.effectiveCoverCategoryIds.includes("bait"),false);
  assert.equal(result.coveredCategoryIds.includes("bait"),true);
  assert.equal(result.selected.length,2);
});

test("normal bait preference lets a complete set cover bait",()=>{
  const complete=p({
    productId:"complete",
    categoryId:"rod_reel",
    score:96,
    recommendationRole:"beginner_default",
    coverCategoryIds:["rod_reel","rig","bait","bucket","fish_grip"],
    preferenceTags:[]
  });
  const checklist=["rod_reel","rig","bait","bucket","fish_grip"].map(id=>({
    id,monetizable:true,state:"needed",priority:"required"
  }));
  const result=buildProductRecommendations(
    [complete],
    {input:{budget:"balanced",bait:"okay"},plan:{methodId:"sabiki"},checklist,now}
  );
  assert.equal(result.selected.length,1);
  assert.equal(result.coveredCategoryIds.includes("bait"),true);
});


test("Ami Hime bundle title satisfies low-mess without an extra bait purchase",()=>{
  const complete=p({
    productId:"sabiki-complete",
    name:"サビキ完全セット アミ姫 付き",
    categoryId:"rod_reel",
    score:96,
    recommendationRole:"beginner_default",
    coverCategoryIds:["rod_reel","rig","bait","bucket","fish_grip"],
    preferenceTags:[]
  });
  const spare=p({
    productId:"extra-bait",
    categoryId:"bait",
    score:99,
    coverCategoryIds:["bait"],
    preferenceTags:["low_mess","no_worm"]
  });
  const checklist=["rod_reel","rig","bait","bucket","fish_grip"].map(id=>({
    id,monetizable:true,state:"needed",priority:"required"
  }));
  const result=buildProductRecommendations(
    [complete,spare],
    {input:{budget:"balanced",bait:"low_mess"},plan:{methodId:"sabiki"},checklist,now}
  );
  assert.equal(result.selected.length,1);
  assert.equal(result.selected[0].productId,"sabiki-complete");
  assert.equal(result.selected[0].effectiveCoverCategoryIds.includes("bait"),true);
});

test("Power Isome bundle title satisfies no-worm without an extra bait purchase",()=>{
  const complete=p({
    productId:"choi-complete",
    name:"ちょい投げ完全セット パワーミニイソメ 付き",
    categoryId:"rod_reel",
    methodIds:["choi_nage"],
    score:97,
    recommendationRole:"beginner_default",
    coverCategoryIds:["rod_reel","rig","bait","fish_grip"],
    preferenceTags:[]
  });
  const spare=p({
    productId:"extra-worm",
    categoryId:"bait",
    methodIds:["choi_nage"],
    score:99,
    coverCategoryIds:["bait"],
    preferenceTags:["no_worm","low_mess"]
  });
  const checklist=["rod_reel","rig","bait","fish_grip"].map(id=>({
    id,monetizable:true,state:"needed",priority:"required"
  }));
  const result=buildProductRecommendations(
    [complete,spare],
    {input:{budget:"balanced",bait:"no_worm"},plan:{methodId:"choi_nage"},checklist,now}
  );
  assert.equal(result.selected.length,1);
  assert.equal(result.selected[0].productId,"choi-complete");
  assert.equal(result.selected[0].effectiveCoverCategoryIds.includes("bait"),true);
});
