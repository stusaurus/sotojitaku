const DAY=86400000;

const arrayify=v=>Array.isArray(v)?v:[v];
const conditionMatches=(value,expected)=>arrayify(expected).includes(value);

export function scoreMethods(input,plansData){
  return (plansData?.methods||[]).map(method=>{
    let score=Number(method.base_score)||0;
    for(const rule of method.scoring||[]){
      if(conditionMatches(input?.[rule.question],rule.value))score+=Number(rule.delta)||0;
    }
    return {method,score};
  }).sort((a,b)=>b.score-a.score);
}

export function selectPlan(input,plansData){
  const ranked=scoreMethods(input,plansData);
  if(!ranked.length)return null;
  const bestScore=ranked[0].score;
  const tied=ranked.filter(x=>x.score===bestScore);
  let selected=tied[0];
  if(tied.length>1){
    const order=plansData?.tie_breaker||[];
    selected=tied.sort((a,b)=>order.indexOf(a.method.id)-order.indexOf(b.method.id))[0];
  }
  const method=selected.method;
  let variantKey="standard";
  for(const [key,variant] of Object.entries(method.variants||{})){
    const when=variant.when||{};
    const ok=Object.entries(when).every(([q,expected])=>conditionMatches(input?.[q],expected));
    if(ok){variantKey=key;break;}
  }
  return {
    methodId:method.id,
    methodName:method.name,
    headline:method.headline,
    targets:method.targets||[],
    score:selected.score,
    variantKey,
    variant:method.variants?.[variantKey]||null
  };
}

function ruleMatches(input,rule){
  return Object.entries(rule||{}).every(([key,expected])=>conditionMatches(input?.[key],expected));
}

export function buildGearChecklist(input,plan,gearData){
  if(!plan)return [];
  const owned=new Set(input?.owned||[]);
  return (gearData?.categories||[]).flatMap(category=>{
    const requiredByMethod=Array.isArray(category.required)&&category.required.includes(plan.methodId);
    const requiredByCondition=category.required_when?ruleMatches(input,category.required_when):false;
    const optionalByCondition=category.optional_when?ruleMatches(input,category.optional_when):false;
    if(!requiredByMethod&&!requiredByCondition&&!optionalByCondition)return [];
    const isOwned=category.owned_key?owned.has(category.owned_key):false;
    const priority=(requiredByMethod||requiredByCondition)?"required":"optional";
    return [{
      ...category,
      priority,
      state:isOwned?"owned":priority==="required"?"needed":"optional"
    }];
  });
}

export function evaluateReadiness({input,plan,gearData,context={}}){
  if(context.unsafeContext){
    return {
      status:"CHANGE_PLAN",
      issues:[{id:"unsafe_context",level:"block",title:"今回は、場所か条件を変えましょう。"}],
      checklist:buildGearChecklist(input,plan,gearData)
    };
  }
  const checklist=buildGearChecklist(input,plan,gearData);
  const missing=checklist.filter(x=>x.priority==="required"&&x.state!=="owned");
  const issues=[];
  let challenge=false;
  if(context.localRulesConfirmed!==true){
    challenge=true;
    issues.push({
      id:"local_rules",
      level:"challenge",
      title:"釣り場のルール確認が必要です",
      text:"釣り禁止区域・利用時間・採捕ルールなどを現地の公式情報で確認してください。"
    });
  }
  if(context.weatherUnsafe===true){
    return {
      status:"CHANGE_PLAN",
      issues:[...issues,{id:"weather",level:"block",title:"荒天時は釣行を延期してください。"}],
      checklist,
      missing
    };
  }
  if(challenge)return {status:"CHALLENGE",issues,checklist,missing};
  if(missing.length)return {status:"ALMOST_READY",issues,checklist,missing};
  return {status:"READY",issues,checklist,missing:[]};
}

export function resultHeadline(result){
  if(result.status==="READY")return "これで、最初の一匹へ。";
  if(result.status==="ALMOST_READY")return "あと"+Math.max(1,result.missing?.length||0)+"つ整えれば、釣りに行けます。";
  if(result.status==="CHALLENGE")return "できそう。でも、出発前に確認があります。";
  return "今回は、道具より条件を変えましょう。";
}

function canonicalRakutenItem(value){
  try{
    let u=new URL(value);
    if(u.hostname==="hb.afl.rakuten.co.jp"){
      const pc=u.searchParams.get("pc");
      if(!pc)return "";
      u=new URL(pc);
    }
    if(u.protocol!=="https:"||u.hostname!=="item.rakuten.co.jp")return "";
    return u.origin+u.pathname.replace(/\/+$/,"")+"/";
  }catch{return "";}
}

function safeAffiliate(product){
  try{
    const u=new URL(product.affiliateUrl||"");
    if(u.protocol!=="https:"||u.hostname!=="hb.afl.rakuten.co.jp")return false;
    return canonicalRakutenItem(product.affiliateUrl)===canonicalRakutenItem(product.itemUrl);
  }catch{return false;}
}

export function productEligible(product,{methodId,categoryId,budgetTier,audience=null,baitPreference=null,now=Date.now()}){
  if(product?.audit?.status!=="verified_live")return false;
  if(!product.verifiedAt||!Number.isFinite(Date.parse(product.verifiedAt)))return false;
  if(now-Date.parse(product.verifiedAt)>7*DAY)return false;
  if(product.categoryId!==categoryId)return false;
  if(Array.isArray(product.methodIds)&&!product.methodIds.includes(methodId))return false;
  if(Array.isArray(product.budgetTiers)&&!product.budgetTiers.includes(budgetTier))return false;
  if(audience&&Array.isArray(product.audiences)&&!product.audiences.includes(audience))return false;
  if(categoryId==="bait"&&["no_worm","low_mess"].includes(baitPreference)){
    if(!Array.isArray(product.preferenceTags)||!product.preferenceTags.includes(baitPreference))return false;
  }
  if(!Number.isFinite(product.price)||product.price<=0)return false;
  if(typeof product.image!=="string"||!product.image.startsWith("https://"))return false;
  if(!safeAffiliate(product))return false;
  return true;
}

export function rankEligibleProducts(products,criteria){
  const eligible=(products||[]).filter(p=>productEligible(p,criteria));
  return eligible.sort((a,b)=>{
    const ar=Number(a.recommendationScore)||0;
    const br=Number(b.recommendationScore)||0;
    if(br!==ar)return br-ar;
    return a.price-b.price;
  });
}
