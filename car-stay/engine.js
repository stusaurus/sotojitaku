export const DEFAULT_RULES={heatBlockMinC:25,heatBlockMaxC:35,coldChallengeC:5,coldSevereC:0,lengthComfortMarginMm:100,adultWidthMm:550,childWidthMm:450};

const hasCapability=(gear,capability)=>gear.some(g=>Array.isArray(g.capabilities)&&g.capabilities.includes(capability));

function profileMatches(profile,config={}){
  const when=profile?.when||{};
  if(when.seatCount!==undefined&&Number(config.seatCount)!==Number(when.seatCount))return false;
  if(when.trim!==undefined&&config.trim!==when.trim)return false;
  if(Array.isArray(when.seatCounts)&&!when.seatCounts.includes(Number(config.seatCount)))return false;
  if(Array.isArray(when.trims)&&!when.trims.includes(config.trim))return false;
  return true;
}
export function resolvedVehicleProfile(vehicle,config={}){
  const profile=(vehicle.sleepProfiles||[]).find(p=>profileMatches(p,config))||null;
  return {
    geometry:{...(vehicle.geometry||{}),...(profile?.geometry||{})},
    floorGrade:profile?.floorGrade||vehicle.floorGrade||"unknown",
    floorStepMm:profile?.floorStepMm??vehicle.floorStepMm??null,
    source:profile?.source||vehicle.source||null
  };
}

export function sleepAssessment({vehicle,people,measurements={},config={},rules=DEFAULT_RULES}){
  const profile=resolvedVehicleProfile(vehicle,config);
  const adults=people.filter(p=>p.type!=="child");
  const children=people.filter(p=>p.type==="child");
  const tallest=Math.max(0,...people.map(p=>(Number(p.height)||0)*10));
  const length=Number(measurements.lengthMm)||profile.geometry?.usableLengthMm||null;
  const width=Number(measurements.widthMm)||profile.geometry?.usableWidthMm||null;
  const targetWidth=adults.length*rules.adultWidthMm+children.length*rules.childWidthMm;
  const needs=[];let lengthState="unknown",widthState="unknown";
  if(!length)needs.push("length");
  else if(length>=tallest+rules.lengthComfortMarginMm)lengthState="comfort";
  else if(length>=tallest)lengthState="ok";
  else if(length>=tallest-100)lengthState="tight";
  else lengthState="short";
  if(people.length>=2&&!width)needs.push("width");
  else if(width){const ratio=width/Math.max(1,targetWidth);widthState=ratio>=1?"just_right":ratio>=.85?"snug":"not_recommended";}
  else if(people.length===1)widthState="solo_unchecked";
  return {tallest,length,width,targetWidth,lengthState,widthState,needsQuickMeasure:needs,profile};
}

export function evaluate(input,vehicle,rules=DEFAULT_RULES){
  const gear=input.gear||[];
  const sleep=sleepAssessment({vehicle,people:input.people||[],measurements:input.measurements,config:input.config||{},rules});
  const issues=[],gaps=[],resolved=[],notNeeded=[];let blocked=false,challenge=false;

  if(input.sleepEngineOn){
    issues.push({id:"engine",level:"block",title:"就寝中のアイドリングは前提にしません",text:"エンジンを止めて成立する計画に変えてください。"});blocked=true;
  }
  if(input.openFlameInside){
    issues.push({id:"flame",level:"block",title:"車内で火器を使う計画は止めます",text:"調理や燃焼器具は車外の許可された場所で。"});blocked=true;
  }

  const place=input.placeType;
  if(!["rv_park","auto_camp","authorized_private"].includes(place)){
    if(["road_station","sa_pa"].includes(place)){
      issues.push({id:"place",level:"challenge",title:"ここは宿泊施設として扱いません",text:"休憩・仮眠の範囲として扱い、各施設のルールを確認してください。"});
      challenge=true;
      gaps.push({id:"authorized_place_unconfirmed",severity:"must",free:"RVパークやオートキャンプ場など、車中泊が認められた場所へ変更する。"});
    }else{
      issues.push({id:"place",level:"challenge",title:"泊まる場所のルール確認が必要です",text:"許可が確認できるまではREADYにしません。"});
      challenge=true;
      gaps.push({id:"authorized_place_unconfirmed",severity:"must",free:"車中泊が認められた施設を選ぶ。"});
    }
  }

  const w=input.weather||{};
  if(w.status==="known"){
    if(Number(w.minC)>=rules.heatBlockMinC||Number(w.maxC)>=rules.heatBlockMaxC){
      issues.push({id:"heat",level:"block",title:"今回は暑さ条件を変えましょう",text:"扇風機や網戸だけではこの判定を解除しません。日程・標高・宿泊方法を変えてください。"});
      blocked=true;
    }else if(Number(w.minC)<=rules.coldSevereC&&!hasCapability(gear,"strong_warmth")){
      issues.push({id:"cold",level:"challenge",title:"氷点下の初泊は防寒性能の確認が必要です",text:"現在の手持ち品だけでは暖かさを保証できません。"});
      challenge=true;
      gaps.push({id:"thermal_unknown",severity:"must",free:"低温対応の寝具性能を確認するか、より暖かい日程へ変更する。"});
    }else if(Number(w.minC)<=rules.coldChallengeC&&!hasCapability(gear,"warmth")){
      gaps.push({id:"thermal_warmth",severity:"should",free:"家の掛け布団や毛布を追加し、現地の最低気温を再確認する。"});
    }
  }else{
    issues.push({id:"weather",level:"challenge",title:"夜の気温がまだ確認できません",text:"天気予報が取れない場合は、出発前に最低気温を確認してください。"});
    challenge=true;
    gaps.push({id:"thermal_unknown",severity:"should",free:"出発前に最新の最低気温・警報を確認する。"});
  }

  if(sleep.needsQuickMeasure.length){
    challenge=true;
    const names=[];
    if(sleep.needsQuickMeasure.includes("length"))names.push("寝床の長さ");
    if(sleep.needsQuickMeasure.includes("width"))names.push("一番狭い幅");
    issues.push({id:"measure",level:"challenge",title:"あと少し測れば断定できます",text:names.join("と")+"を測ってください。"});
  }

  if(sleep.lengthState==="short"||sleep.widthState==="not_recommended"){
    challenge=true;
    gaps.push({id:"sleep_space",severity:"must",free:"別レイアウト・人数変更・より広い車両を検討する。"});
  }else if(sleep.lengthState==="tight"||sleep.widthState==="snug"){
    gaps.push({id:"sleep_comfort",severity:"should",free:"枕位置や荷物位置を先に自宅で試しておく。"});
  }

  const floor=sleep.profile?.floorGrade||vehicle.floorGrade||"unknown";
  const floorObservation=input.floorObservation||"unknown";
  let floorState="unknown";
  const floorNeedsFix=["C","D"].includes(floor)||["noticeable","large"].includes(floorObservation);
  if(floorNeedsFix){
    if(hasCapability(gear,"floor_step_full")){resolved.push("floor");floorState="resolved_product";}
    else if(hasCapability(gear,"gap_fill")&&hasCapability(gear,"padding")){resolved.push("floor_free");floorState="resolved_free";}
    else{
      floorState="needs_fix";
      gaps.push({id:"floor_step",severity:"should",free:"まずタオル・衣類・毛布などで段差やすき間を埋め、上から手持ちの敷物を重ねて自宅で寝心地を試す。"});
    }
  }else if(floorObservation==="flat"){
    resolved.push("floor");
    floorState="flat";
  }

  const hasSleepPadding=hasCapability(gear,"padding")||hasCapability(gear,"floor_step_full");
  const hasFloorGap=gaps.some(g=>g.id==="floor_step");
  if(!hasSleepPadding&&!hasFloorGap){
    gaps.push({
      id:"sleep_surface",
      severity:"should",
      free:"まず家の敷布団・厚手の毛布・キャンプマットなど、身体の下に敷けるものを使って寝心地を試す。"
    });
  }else if(hasSleepPadding){
    resolved.push("sleep_surface");
  }

  if(hasCapability(gear,"privacy_full"))resolved.push("privacy");
  else gaps.push({id:"privacy_full",severity:"must",free:"専用品がなくても、外から見えず運転操作を妨げない安全な目隠しを用意する。"});

  const wantsBlanket=(input.devices||[]).includes("electric_blanket");
  const powerUse=input.powerUse||{};
  const blanketW=Number(powerUse.blanketW)||0;
  const blanketHours=Number(powerUse.hours)||0;
  const requiredWh=blanketW>0&&blanketHours>0?Math.ceil(blanketW*blanketHours*1.25):null;
  const requiredOutputW=blanketW>0?blanketW:null;
  const ownsPortablePower=hasCapability(gear,"portable_power");
  const ownedWh=Number(powerUse.ownedWh)||0;
  const ownedOutputW=Number(powerUse.ownedOutputW)||0;
  let powerState="not_needed";
  if(wantsBlanket){
    if(!requiredWh){
      powerState="needs_specs";
      gaps.push({id:"power_capacity",severity:"should",requiredWh:null,requiredOutputW:requiredOutputW||null,free:"電気毛布の製品ラベルで消費電力(W)を確認し、使う時間を入力してください。容量が分からないまま電源はおすすめしません。"});
    }else if(ownsPortablePower&&ownedWh>=requiredWh&&ownedOutputW>=requiredOutputW){
      powerState="owned_sufficient";
      resolved.push("power_capacity");
    }else{
      powerState=ownsPortablePower?"owned_insufficient":"needs_power";
      gaps.push({id:"power_capacity",severity:"should",requiredWh,requiredOutputW,free:ownsPortablePower?"手持ち電源の容量・定格出力が必要量に足りるか確認してください。足りなければ電気毛布を使わない寝具構成へ変更できます。":"電気毛布を使わない寝具構成へ変えれば、ポータブル電源を買わずに済みます。"});
    }
  }else if(hasCapability(gear,"usb_power"))notNeeded.push("ポータブル電源");

  if(input.tripStyle==="onsen"||input.tripStyle==="sleep_only")notNeeded.push("車内調理器具","大型テーブル");
  if(hasCapability(gear,"warmth")&&w.status==="known"&&Number(w.minC)>rules.coldChallengeC)notNeeded.push("専用の寝袋");

  const unresolved=gaps.filter(g=>["must","should"].includes(g.severity));
  const status=blocked?"CHANGE_PLAN":challenge?"CHALLENGE":unresolved.length?"ALMOST_READY":"READY";
  return {status,issues,gaps,resolved,notNeeded:[...new Set(notNeeded)],sleep,floor:{grade:floor,stepMm:sleep.profile?.floorStepMm??null,observation:floorObservation,state:floorState},power:{state:powerState,blanketW:blanketW||null,hours:blanketHours||null,requiredWh,requiredOutputW,ownedWh:ownedWh||null,ownedOutputW:ownedOutputW||null},vehicleId:vehicle.vehicleId};
}

export function resultHeadline(result){
  if(result.status==="READY")return "この条件なら、はじめての一泊へ。";
  if(result.status==="ALMOST_READY")return "あと"+Math.max(1,result.gaps.filter(g=>["must","should"].includes(g.severity)).length)+"つ整えれば、はじめての一泊へ。";
  if(result.status==="CHALLENGE")return "できそう。でも、先に確認したいことがあります。";
  return "今回は、道具より条件を変えましょう。";
}

function canonicalRakutenItem(value){
  try{
    let u=new URL(value);
    if(u.hostname==="hb.afl.rakuten.co.jp"){
      const pc=u.searchParams.get("pc"); if(!pc)return "";
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
export function measurementFitPlan(product,{measurements={},sleep={}}={}){
  if(product.fitStrategy!=="measurement")return null;
  const fit=product.measurementFit||{};
  const length=Number(measurements.lengthMm)||0;
  const width=Number(measurements.widthMm)||0;
  const unitLength=Number(fit.unitLengthMm)||0;
  const unitWidth=Number(fit.unitWidthMm)||0;
  const maxUnits=Math.max(1,Number(fit.maxUnits)||1);
  const targetWidth=Math.max(1,Number(sleep.targetWidth)||unitWidth);
  if(!length||!width||!unitLength||!unitWidth)return {eligible:false,quantity:0,requiredLengthMm:unitLength,requiredWidthMm:0};
  const quantity=Math.max(1,Math.ceil(targetWidth/unitWidth));
  const requiredWidthMm=unitWidth*quantity;
  return {
    eligible:quantity<=maxUnits&&length>=unitLength&&width>=requiredWidthMm,
    quantity,
    requiredLengthMm:unitLength,
    requiredWidthMm,
    measuredLengthMm:length,
    measuredWidthMm:width
  };
}

export function productEligible(product,{vehicleId,config={},gapId,now=Date.now(),measurements={},sleep={},powerNeed={}}){
  if(product.audit?.status!=="verified_live")return false;
  if(!product.verifiedAt||!Number.isFinite(Date.parse(product.verifiedAt))||now-Date.parse(product.verifiedAt)>7*86400000)return false;
  if(!product.gapIds?.includes(gapId))return false;
  if(!Number.isFinite(product.price)||product.price<=0||!safeAffiliate(product))return false;
  if(typeof product.image!=="string"||!product.image.startsWith("https://"))return false;
  const fitStrategy=product.fitStrategy||"vehicle";
  if(fitStrategy==="measurement"){
    return measurementFitPlan(product,{measurements,sleep})?.eligible===true;
  }
  if(fitStrategy==="power"){
    const spec=product.powerSpec||{};
    const requiredWh=Number(powerNeed.requiredWh)||0;
    const requiredOutputW=Number(powerNeed.requiredOutputW)||0;
    if(!requiredWh||!requiredOutputW)return false;
    return Number(spec.capacityWh)>=requiredWh&&Number(spec.ratedOutputW)>=requiredOutputW;
  }
  if(fitStrategy!=="vehicle")return false;
  const fit=product.vehicleFit?.find(v=>v.vehicleId===vehicleId);
  if(!fit||fit.status!=="verified")return false;
  if(fit.seatCounts?.length&&!fit.seatCounts.includes(Number(config.seatCount)))return false;
  if(fit.trims?.length&&!fit.trims.includes(config.trim))return false;
  if(fit.exclusions?.includes(config.trim))return false;
  return true;
}
