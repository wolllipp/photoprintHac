// Этап 3: «Пульс компании», прогноз спроса и мощности, неделя дефицита, карточка решения D-120, ответ ассистента.
// Запуск: node cdp24.js <папка для скриншотов> [dark|light]
const {spawn}=require('child_process');const fs=require('fs'),path=require('path');
const OUT=process.argv[2];const THEME=process.argv[3]||'dark';fs.mkdirSync(OUT,{recursive:true});
const URLF=require('./env').page('glass.html');
const ch=spawn(require('./env').chrome(),['--headless=new','--remote-debugging-port=9953','--no-first-run','--user-data-dir='+path.join(OUT,'prof24'),'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let tgt;for(let i=0;i<40&&!tgt;i++){await sleep(300);try{const l=await (await fetch('http://127.0.0.1:9953/json')).json();tgt=l.find(t=>t.type==='page')}catch{}}
const ws=new WebSocket(tgt.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pend={},errs=[];
const send=(m,p={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method:m,params:p}))});
ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]}if(d.method==='Runtime.exceptionThrown')errs.push(d.params.exceptionDetails.text+' '+JSON.stringify(d.params.exceptionDetails.exception&&d.params.exceptionDetails.exception.description))};
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result.exceptionDetails)throw new Error(e.slice(0,120)+' :: '+JSON.stringify(r.result.exceptionDetails.exception&&r.result.exceptionDetails.exception.description));return r.result.result.value};
const shot=async n=>{await sleep(250);const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,n+'.png'),Buffer.from(r.result.data,'base64'))};
const R=[];const ok=(n,c,x='')=>R.push((c?'PASS ':'FAIL ')+n+(x?' | '+x:''));
const click=async sel=>{await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)throw new Error('нет '+${JSON.stringify(sel)});e.click()})()`);await sleep(250)};
const has=sel=>ev(`!!document.querySelector(${JSON.stringify(sel)})`);
const go=async h=>{await ev(`location.hash=${JSON.stringify(h)}`);await sleep(300)};
const view=()=>ev(`document.getElementById('view').innerText`);
const fc=()=>ev(`(()=>{const w=document.querySelector('[data-w=forecast]');return w?w.innerText:''})()`);
const fcBars=()=>ev(`[...document.querySelectorAll('[data-w=forecast] .bar-fill')].map(b=>b.classList.contains('sel'))`);
const asRole=async(role,dept)=>{await ev(`S.role=${JSON.stringify(role)};S.dept=${JSON.stringify(dept||'prod')};S.fDept=${role==='head'?JSON.stringify(dept):'null'};S.fProduct=null;S.line=null;document.getElementById('role').value=S.role;render()`);await sleep(250)};
await send('Page.enable');await send('Runtime.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1500,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:URLF+'#/overview'});await sleep(900);
await ev(`localStorage.removeItem('picpac-insight-layout-v3');localStorage.setItem('insight-theme',${JSON.stringify(THEME)});document.documentElement.dataset.theme=${JSON.stringify(THEME)};render()`);await sleep(250);

/* Слой данных: прогноз */
const F=await ev(`(()=>{const f=InsightData.forecast(),w=f.first,i=f.weeks.indexOf(w);return {n:f.weeks.length,start:w&&w.start,end:w&&w.end,name:w&&w.peak.name,load:w&&w.peak.load,prev:f.weeks.slice(0,i).every(x=>x.peak.load<=f.threshold),from:f.from,near:Math.max(...f.weeks.slice(0,4).map(x=>x.peak.load)),g20:InsightData.forecast({growth:.2}).first.start,prem:InsightData.forecast({lines:[2],products:[2]})}})()`);
ok('прогноз на 52 недели от 9 ноября',F.n===52&&F.from==='2026-11-09',F.n+' '+F.from);
ok('первая неделя дефицита 17–23 мая 2027, Fuji Frontier',F.start==='2027-05-17'&&F.end==='2027-05-23'&&F.name==='Fuji Frontier',F.start+' '+F.name);
ok('в неделю дефицита загрузка выше 90 %, раньше — не выше',F.load>0.9&&F.prev,String(F.load));
ok('ближайшие 4 недели без дефицита',F.near<=0.9,String(F.near));
ok('рост спроса +20 % сдвигает дефицит раньше',F.g20<F.start,F.g20);
ok('фильтр Premium: только Noritsu и переплёт, дефицита нет',F.prem.first===null&&F.prem.weeks[0].res.map(r=>r.name).join()==='Noritsu,Переплёт');

/* Пульс компании */
await asRole('ceo');
ok('заголовок «Пульс компании»',(await view()).includes('Пульс компании'));
const tl=await ev(`[...document.querySelectorAll('#view .pulse .kpi-tile .lg-label')].map(e=>e.innerText)`);
ok('8 KPI пульса по ТЗ 5.3',tl.length===8&&['Оборот','маржа','в срок','Брак','клиенты','SLA','Загрузка','Обеспеченность'].every(x=>tl.some(t=>t.includes(x))),tl.join(' / '));
ok('критические отклонения на пульсе',/критических отклонений: 4/.test(await ev(`document.querySelector('#view .pulse-scope').innerText`)));
ok('на плитке загрузки есть прогноз',/Прогноз на 9–15 ноя/.test(await ev(`[...document.querySelectorAll('#view .pulse .kpi-tile')].find(t=>t.innerText.includes('Загрузка')).innerText`)));

/* Виджет прогноза: 4 недели */
let t=await fc();ok('виджет прогноза на главной',t.includes('Прогноз спроса и мощности'));
ok('4 недели: 4 столбца, дефицита нет',(await fcBars()).length===4&&t.includes('Дефицита нет'));
ok('неделя дефицита видна сразу на главной',t.includes('17–23 мая 2027')&&t.includes('Fuji Frontier'));
ok('карточка риска: владелец, шаг, срок',t.includes('Начальник производства')&&/Перевести часть заказов на Ricoh/.test(t)&&t.includes('Решить до')&&t.includes('26 апр'));
await shot(THEME+'-24a-home');

/* Сезон */
await click('[data-w=forecast] [data-act=fcHorizon][data-arg=season]');t=await fc();const b=await fcBars();
ok('сезон: 14 недель апреля–июня 2027',b.length===14&&t.includes('Сезон 1 апреля – 1 июля 2027'),String(b.length));
ok('сезон: 4 недели дефицита выделены',b.filter(Boolean).length===4&&t.includes('Дефицит: 4 недели из 14'));
ok('порог 90 % подписан',t.includes('порог 90 %'));await shot(THEME+'-24b-season');
await click('[data-w=forecast] [data-act=fcGrowth][data-arg="0.2"]');t=await fc();
ok('рост +20 %: неделя дефицита 26 апр – 2 мая 2027',t.includes('26 апр – 2 мая 2027'),t.match(/Неделя дефицита[\s\S]{0,60}/)?.[0]);
await click('[data-w=forecast] [data-act=fcGrowth][data-arg="0"]');await click('[data-w=forecast] [data-act=fcHorizon][data-arg="4"]');
await click('[data-act=fProduct][data-arg="2"]');t=await fc();ok('фильтр продукта меняет прогноз (Premium — дефицита нет)',/Неделя дефицита\s*Нет/.test(t));await click('[data-act=fReset]');

/* Переход в карточку решения */
await click('[data-w=forecast] a[href="#/deviations/D-120"]');await sleep(200);
ok('клик ведёт в карточку решения D-120',await ev('location.hash')==='#/deviations/D-120');
t=await view();ok('карточка: название с линией и неделей',t.includes('Прогноз: дефицит мощности Fuji Frontier 17–23 мая 2027'));
ok('карточка: причина и шаг из прогноза',t.includes('Перевести часть заказов на Ricoh'));ok('карточка: график сезона',t.includes('Прогноз на сезон'));
ok('директор может решить или назначить встречу',await has('[data-act=decide]')||await has('[data-act=meetNew]'));await shot(THEME+'-24c-card');
await go('#/deviations');ok('D-120 в списке отклонений',(await view()).includes('D-120'));

/* Роли */
await go('#/overview');await asRole('head','sales');t=await fc();
ok('продажи: прогноз виден, ссылки на карточку нет',t.includes('Прогноз спроса и мощности')&&!(await has('[data-w=forecast] a[href="#/deviations/D-120"]')));
await go('#/deviations/D-120');ok('продажи: карточка D-120 закрыта',/Нет доступа|не найдено/i.test(await view()));
await go('#/overview');await asRole('head','prod');ok('производство: ссылка на карточку есть',await has('[data-w=forecast] a[href="#/deviations/D-120"]'));
await go('#/deviations/D-120');ok('производство: карточка открывается',(await view()).includes('Fuji Frontier'));
await go('#/overview');await asRole('ceo');

/* Ассистент */
await go('#/assistant');const pi=await ev(`DEMO.assistant.presets.findIndex(p=>/мощност/.test(p))`);await click(`[data-act=preset][data-arg="${pi}"]`);await sleep(1100);
t=await view();ok('ассистент отвечает по прогнозу',t.includes('17–23 мая 2027')&&t.includes('Fuji Frontier')&&t.includes('это прогноз, а не факт'));
ok('ответ ведёт в карточку решения',await has('#view .msg.ai a[href="#/deviations/D-120"]'));
ok('запрос записан в журнал с источником',await ev(`S.journal[0].used.includes('прогноз спроса')`));await shot(THEME+'-24d-assistant');

const f=[...new Set(errs)];ok('нет исключений',f.length===0,f.join(' || '));
console.log(R.join('\n'));console.log('FAILS',R.filter(x=>x.startsWith('FAIL')).length,'of',R.length);ws.close();ch.kill();process.exit(0);
})().catch(e=>{console.log('CRASH',e.message);ch.kill();process.exit(1)});
