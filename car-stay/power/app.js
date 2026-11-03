import {estimateBlanketPower} from "../power-calculator.js";

const form=document.getElementById("powerForm");
const error=document.getElementById("powerError");
const panel=document.getElementById("powerResult");
const whEl=document.getElementById("requiredWh");
const wEl=document.getElementById("outputW");
const eq=document.getElementById("powerEquation");
const assessment=document.getElementById("ownedAssessment");
const num=new Intl.NumberFormat("ja-JP");

function numeric(id,{optional=false,min=1,max=100000}={}){
  const el=document.getElementById(id);
  const raw=el.value.trim();
  if(optional&&!raw)return null;
  const n=Number(raw);
  if(!raw||!Number.isFinite(n)||n<min||n>max)return NaN;
  return n;
}
function track(status){
  if(window.SOTOJITAKU_ANALYTICS?.optedOut||typeof window.gtag!=="function")return;
  // Do not log exact power needs, owned capacities or device information.
  window.gtag("event","car_stay_power_calculation",{
    site_id:"sotojitaku_car_stay",
    service_id:"car_stay",
    source_page:"power_calculator",
    estimate_status:status,
    operator_test:window.SOTOJITAKU_ANALYTICS?.operatorTest?"1":"0",
  });
}
function show({trackInteraction=true}={}){
  const watts=numeric("watts",{min:1,max:300});
  const hours=numeric("hours",{min:0.5,max:24});
  const count=numeric("count",{min:1,max:4});
  const ownedWh=numeric("ownedWh",{optional:true,min:1,max:100000});
  const ownedOutput=numeric("ownedOutput",{optional:true,min:1,max:100000});
  const valid=[watts,hours,count,ownedWh,ownedOutput].every(v=>v===null||Number.isFinite(v));
  if(!valid||!Number.isInteger(count)){
    panel.hidden=true;
    error.textContent="消費電力は1〜300W、使用時間は0.5〜24時間、枚数は1〜4枚で入力してください。手持ちの電源は正の数値、または空欄にしてください。";
    error.hidden=false;
    return;
  }
  const need=estimateBlanketPower({watts,hours,count});
  if(need.requiredWh===null||need.requiredOutputW===null){
    panel.hidden=true;
    error.textContent="必要容量を計算できません。入力値を確認してください。";
    error.hidden=false;
    return;
  }
  error.hidden=true;
  panel.hidden=false;
  whEl.textContent=num.format(need.requiredWh)+" Wh";
  wEl.textContent=num.format(need.requiredOutputW)+" W";
  eq.textContent=`${num.format(watts)}W × ${hours}時間 × ${count}枚 = ${num.format(need.consumptionWh)}Wh。利用可能容量を80%と仮定し、${num.format(need.consumptionWh)} ÷ 0.8 = 約${num.format(need.requiredWh)}Wh。`;

  let status="unknown";
  if(ownedWh===null||ownedOutput===null){
    assessment.textContent="手持ち電源の容量Whと定格出力Wがそろっていないため、適合は判定できません。製品の仕様を確認してください。";
  }else{
    const capacityOk=ownedWh>=need.requiredWh;
    const outputOk=ownedOutput>=need.requiredOutputW;
    if(capacityOk&&outputOk){
      status="estimate_met";
      assessment.textContent="入力された手持ち電源は、容量と定格出力の計算上の目安を満たしています。ただし実際の稼働・安全性は未検証です。取扱説明書と接続条件を確認してください。";
    }else{
      status="estimate_shortfall";
      const gaps=[!capacityOk?"容量Wh":"",!outputOk?"定格出力W":""].filter(Boolean).join("と");
      assessment.textContent=`手持ち電源は${gaps}が計算上の目安を下回ります。使用時間の短縮や電気毛布を使わない寝具など、買わずに解決する方法も検討してください。`;
    }
  }
  if(trackInteraction)track(status);
}
form.addEventListener("submit",event=>{event.preventDefault();show();});
show({trackInteraction:false});
