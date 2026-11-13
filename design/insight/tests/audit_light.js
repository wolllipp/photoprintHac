// Аудит светлой и тёмной тем: скриншоты каждого экрана под нужной ролью, горизонтальный скролл, исключения.
// Запуск: node audit_light.js <папка для скриншотов>. Контраст проверяется глазами по скриншотам.
const {spawn}=require('child_process');const fs=require('fs'),path=require('path');
const OUT=process.argv[2];fs.mkdirSync(OUT,{recursive:true});
const URLF=require('./env').page('glass.html');
const ch=spawn(require('./env').chrome(),['--headless=new','--remote-debugging-port=9952','--no-first-run','--user-data-dir='+path.join(OUT,'profA'),'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let tgt;for(let i=0;i<40&&!tgt;i++){await sleep(300);try{const l=await (await fetch('http://127.0.0.1:9952/json')).json();tgt=l.find(t=>t.type==='page')}catch{}}
const ws=new WebSocket(tgt.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pend={},errs=[];
const send=(m,p={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method:m,params:p}))});
ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]}if(d.method==='Runtime.exceptionThrown')errs.push(d.params.exceptionDetails.text+' '+JSON.stringify(d.params.exceptionDetails.exception&&d.params.exceptionDetails.exception.description))};
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result.exceptionDetails)throw new Error(e.slice(0,120));return r.result.result.value};
const shot=async n=>{await sleep(250);const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,n+'.png'),Buffer.from(r.result.data,'base64'))};
const R=[];const ok=(n,c,x='')=>R.push((c?'PASS ':'FAIL ')+n+(x?' | '+x:''));
await send('Page.enable');await send('Runtime.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
await send('Page.navigate',{url:URLF+'#/overview'});await sleep(900);
const firstOrder=await ev(`InsightData.orders({from:InsightData.meta().stories.batch,line:0,shift:1,defects:true})[0].id`);
const SCREENS=[['ceo','#/overview'],['ceo','#/deviations'],['ceo','#/deviations/D-118'],['ceo','#/deviations/D-120'],['ceo',`#/orders/${firstOrder}/D-118`],['ceo','#/assistant'],['ceo','#/meetings'],['ceo','#/data'],['ceo','#/security'],['head','#/overview'],['manager','#/tasks']];
for(const theme of ['dark','light']){
  await ev(`localStorage.setItem('insight-theme','${theme}');document.documentElement.dataset.theme='${theme}'`);
  for(const w of [1440,390]){
    await send('Emulation.setDeviceMetricsOverride',{width:w,height:w>800?900:844,deviceScaleFactor:1,mobile:w<800});
    for(const [role,hash] of SCREENS){
      await ev(`S.role='${role}';S.dept='sales';S.fDept=${role==='head'?"'sales'":'null'};if(S.role==='manager')S.me=S.me||'Технолог печати';document.getElementById('role').value=S.role;location.hash='${hash}';render()`);await sleep(350);
      const o=await ev(`document.documentElement.scrollWidth-document.documentElement.clientWidth`);
      const name=theme+'-'+w+'-'+role+'-'+hash.replace(/[#\/]+/g,'_');
      ok(name+': нет горизонтального скролла',o<=1,'выход '+o+'px');await shot(name);
    }
  }
}
const f=[...new Set(errs)];ok('нет исключений',f.length===0,f.join(' || '));
console.log(R.join('\n'));console.log('FAILS',R.filter(x=>x.startsWith('FAIL')).length,'of',R.length);ws.close();ch.kill();process.exit(0);
})().catch(e=>{console.log('CRASH',e.message);ch.kill();process.exit(1)});
