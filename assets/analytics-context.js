// Shared measurement context. No answers, names or location details are stored here.
(()=>{
  const measurementId='G-6STQ5HXRDH';
  let operatorTest=new URLSearchParams(location.search).get('test')==='1';
  let optedOut=false;
  try {
    const test=new URLSearchParams(location.search).get('test');
    if(test!=='0'&&test!=='1')operatorTest=localStorage.getItem('sotojitaku_operator_test')==='1';
    localStorage.setItem('sotojitaku_operator_test',operatorTest?'1':'0');
    optedOut=['sotojitaku_analytics_off','sotojitaku_analytics_optout'].some(k=>localStorage.getItem(k)==='1');
  } catch {}
  const context={measurementId,operatorTest,optedOut,setEnabled(enabled){
    this.optedOut=!enabled;
    window['ga-disable-'+measurementId]=!enabled;
    try { for(const key of ['sotojitaku_analytics_off','sotojitaku_analytics_optout'])localStorage.setItem(key,enabled?'0':'1'); } catch {}
  }};
  window['ga-disable-'+measurementId]=optedOut;
  window.SOTOJITAKU_ANALYTICS=context;
})();
