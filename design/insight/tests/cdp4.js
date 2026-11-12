// Новый пользователь: идёт только по подсказкам, от первого экрана до результата
const {spawn}=require('child_process');const fs=require('fs'),path=require('path');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const URLF='file:///D:/hackathons/Great%20stone%20hackathon/photoprintHac/design/insight/index.html';
const OUT=process.argv[2];fs.mkdirSync(OUT,{recursive:true});
const ch=spawn(CHROME,['--headless=new','--remote-debugging-port=9777','--no-first-run','--user-data-dir='+path.join(OUT,'prof4'),'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
let tgt;for(let i=0;i<40&&!tgt;i++){await sleep(300);try{const l=await (await fetch('http://127.0.0.1:9777/json')).json();tgt=l.find(t=>t.type==='page')}catch{}}
const ws=new WebSocket(tgt.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pend={},errs=[];
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]}if(d.method==='Runtime.exceptionThrown')errs.push(d.params.exceptionDetails.exception?.description||d.params.exceptionDetails.text)};
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result.exceptionDetails)throw new Error(e+' :: '+JSON.stringify(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text));return r.result.result.value};
const shot=async n=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(OUT,n+'.png'),Buffer.from(r.result.data,'base64'))};
const R=[];const ok=(n,c,x='')=>R.push((c?'PASS ':'FAIL ')+n+(x?' | '+x:''));
await send('Page.enable');await send('Runtime.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:URLF});await sleep(1500);
ok('панель демо скрыта при входе',await ev(`getComputedStyle(document.querySelector('.demobar')).display==='none'`));
ok('оговорка о данных видна',(await ev(`document.querySelector('.side-note').innerText`)).includes('придуманы'));
ok('меню столбиком и без подчёркиваний',await ev(`getComputedStyle(document.getElementById('nav')).flexDirection==='column'&&getComputedStyle(document.querySelector('#nav a')).textDecorationLine==='none'`));
ok('нет подсказок и пульсации',await ev(`!document.querySelector('.guide,.next-target,.nav-label small')`));
const log=[];let n=0;
for(let i=0;i<40;i++){
  if(await ev(`!!document.getElementById('rp-t')&&!document.getElementById('rp-t').value`)){await ev(`(()=>{const e=document.getElementById('rp-t');e.value='Сделано по критерию';e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await sleep(60)}
  if(await ev(`!!document.querySelector('[data-act=mPerson]')&&!document.querySelector('[data-act=mPerson][aria-pressed=true]')`)){await ev(`document.querySelector('[data-act=mPerson]').click()`);await sleep(80)}
  if(await ev(`!!document.querySelector('[data-act=ocState]')`)){await ev(`document.querySelectorAll('[data-act=ocState][data-arg$=":yes"]').forEach(b=>b.getAttribute('aria-pressed')!=='true'&&b.click())`);await sleep(120)}
  if(await ev(`!!document.querySelector('[data-act=ocState]')`)){
    await ev(`document.querySelectorAll('[id^=oc-][id$=-x]').forEach(e=>{if(!e.value){e.value='Решение принято';e.dispatchEvent(new Event('input',{bubbles:true}))}})`);
    const ids=await ev("[...document.querySelectorAll('button[id^=oc-]')].filter(b=>/-[od]$/.test(b.id)).map(b=>b.id)");
    for(const id of ids){await ev("document.getElementById('"+id+"').click()");await sleep(60);await ev("(()=>{const all=[...document.querySelectorAll('.pop [data-val]:not([disabled])')];const d=all.filter(e=>/^\d{4}-\d\d-\d\d$/.test(e.dataset.val));const o=d.length?d:all;const t=o[Math.min(3,o.length-1)];t&&t.click()})()");await sleep(60)}
  }
  await shot('h'+String(i).padStart(2,'0'));
  if(await ev(`S.status==='done'`))break;
  if(!(await ev(`!!document.querySelector('#view .btn-primary, #view .btn-go:not(summary)')`))){const who=await ev(`(()=>{const p=parseHash();if(p.path!=='deviations')p.id=null;if(S.role==='ceo'){const C=caseOf(p.id||DEMO.deviationsMeta.main);if(C.status==='check')return 'admin';const t=allTasks().find(t=>t.dev===(p.id||DEMO.deviationsMeta.main)&&['assigned','working','returned'].includes(t.status));return t?'staff':''}return 'ceo'})()`);if(who){await ev(`document.querySelector('.who-menu summary').click()`);await sleep(60);await ev(`document.querySelector('.sw [data-arg="${who}"]').click()`);await sleep(350);await ev("(()=>{const m=DEMO.deviationsMeta.main;if(S.role==='manager'){const t=allTasks().find(t=>t.dev===m&&t.owner===S.me&&['assigned','working','returned'].includes(t.status));if(t)location.hash='#/tasks/'+t.id}else if(S.role==='ceo')location.hash='#/deviations/'+m})()");await sleep(300);log.push('['+who+']');continue}}
  const cnt=await ev(`document.querySelectorAll('#view .btn-primary, #view .btn-go:not(summary)').length`);const name=await ev(`document.querySelector('#view .btn-primary, #view .btn-go:not(summary)')?.innerText`);
  ok('один главный шаг на экране: '+name,cnt===1,String(cnt));log.push(name);
  await ev(`document.querySelector('#view .btn-primary, #view .btn-go:not(summary)').click()`);n++;await sleep(250);
}
console.log(log.join(' → '));
ok('главные кнопки довели до результата',await ev(`S.status==='done'`),n+' нажатий');
const f=[...new Set(errs)];ok('нет исключений',f.length===0,f.join(' || '));
console.log(R.join('\n'));console.log('FAILS',R.filter(x=>x.startsWith('FAIL')).length,'of',R.length);ws.close();ch.kill();process.exit(0);
})().catch(e=>{console.log('CRASH',e.message);ch.kill();process.exit(1)});
