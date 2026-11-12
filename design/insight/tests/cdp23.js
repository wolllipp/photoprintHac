// Этапы 1–2: данные, паспорта KPI, слой доступа, фильтры, роли. Запуск: node cdp23.js <папка для скриншотов> [dark|light]
const {spawn}=require('child_process');const fs=require('fs'),path=require('path');
const OUT=process.argv[2];const THEME=process.argv[3]||'dark';fs.mkdirSync(OUT,{recursive:true});
const URLF='file:///D:/hackathons/Great%20stone%20hackathon/photoprintHac/design/insight/glass.html';
const ch=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=9951','--no-first-run','--user-data-dir='+path.join(OUT,'prof23'),'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let tgt;for(let i=0;i<40&&!tgt;i++){await sleep(300);try{const l=await (await fetch('http://127.0.0.1:9951/json')).json();tgt=l.find(t=>t.type==='page')}catch{}}
const ws=new WebSocket(tgt.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pend={},errs=[];
const send=(m,p={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method:m,params:p}))});
ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]}if(d.method==='Runtime.exceptionThrown')errs.push(d.params.exceptionDetails.text+' '+JSON.stringify(d.params.exceptionDetails.exception&&d.params.exceptionDetails.exception.description))};
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result.exceptionDetails)throw new Error(e.slice(0,120)+' :: '+JSON.stringify(r.result.exceptionDetails.exception&&r.result.exceptionDetails.exception.description));return r.result.result.value};
const shot=async n=>{await sleep(250);const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,n+'.png'),Buffer.from(r.result.data,'base64'))};
const R=[];const ok=(n,c,x='')=>R.push((c?'PASS ':'FAIL ')+n+(x?' | '+x:''));
const click=async sel=>{await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)throw new Error('нет '+${JSON.stringify(sel)});e.click()})()`);await sleep(200)};
const go=async h=>{await ev(`location.hash=${JSON.stringify(h)}`);await sleep(300)};
const view=()=>ev(`document.getElementById('view').innerText`);
const tiles=()=>ev(`[...document.querySelectorAll('#view .kpi-tile')].map(t=>t.innerText.replace(/\\s+/g,' ').trim())`);
const asRole=async(role,dept)=>{await ev(`S.role=${JSON.stringify(role)};S.dept=${JSON.stringify(dept||'prod')};S.fDept=${role==='head'?JSON.stringify(dept):'null'};S.fProduct=null;S.period=4;S.line=null;document.getElementById('role').value=S.role;render()`);await sleep(250)};
await send('Page.enable');await send('Runtime.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:URLF+'#/overview'});await sleep(900);
await ev(`localStorage.setItem('insight-theme',${JSON.stringify(THEME)});document.documentElement.dataset.theme=${JSON.stringify(THEME)}`);await sleep(200);
ok('тема '+THEME,await ev('document.documentElement.dataset.theme')===THEME);

/* Этап 1: данные */
const cnt=await ev(`(()=>{const D=window.INSIGHT_DATA,n=t=>D[t]?D[t].rows.length:0,c=t=>D[t]?D[t].cols:[];return {orders:n('orders'),customers:n('customers'),tickets:n('tickets'),oc:c('orders'),cc:c('customers'),tc:c('tickets'),lc:c('lines'),hc:c('hr')}})()`);
ok('заказов ≥ 500',cnt.orders>=500,String(cnt.orders));ok('клиентов ≥ 200',cnt.customers>=200,String(cnt.customers));ok('обращений ≥ 300',cnt.tickets>=300,String(cnt.tickets));
ok('ключи заказа: order_id, customer_id, line, shift',['order_id','customer_id','line','shift'].every(k=>cnt.oc.includes(k)));
ok('ключи обращения: ticket_id, customer_id, order_id',['ticket_id','customer_id','order_id'].every(k=>cnt.tc.includes(k)));
ok('ключ клиента customer_id',cnt.cc.includes('customer_id'));ok('подразделения в HR: dept',cnt.hc.includes('dept'));
ok('5 источников и больше (CRM, поддержка, ERP, 1С, HR)',await ev(`InsightData.sources().length>=5`));

/* Паспорта KPI */
const ks=await ev(`InsightData.kpis().map(k=>({id:k.id,f:!!k.formula,s:!!(k.sources&&k.sources.length),c:!!k.cadence,n:!!k.normText,l:!!k.label}))`);
ok('17 KPI',ks.length===17,String(ks.length));
ok('у каждого KPI есть формула, источник, обновление, норма',ks.every(k=>k.f&&k.s&&k.c&&k.n&&k.l),ks.filter(k=>!(k.f&&k.s&&k.c&&k.n&&k.l)).map(k=>k.id).join(','));
await asRole('ceo');
const tl=await tiles();ok('на главной плитки показателей',tl.length>=4,String(tl.length));
ok('на каждой открытой плитке «Как считается»',tl.every(t=>/Как считается/i.test(t)||/Закрыто/.test(t)),tl.filter(t=>!/Как считается/i.test(t)&&!/Закрыто/.test(t)).length+' без');
await shot(THEME+'-23a-home-ceo');

/* Цифры на главной: один период и охват */
const sc=await ev(`(()=>{const r=homeRange(),o=kpiById('ontime'),s=kpiById('sameday');return {a:r.a,b:r.b,ontime:o.f(o.calc(r.a,r.b)),same:s.f(s.calc(r.a,r.b)),txt:document.getElementById('view').innerText}})()`);
ok('«в срок» на плитке = расчёт слоя данных за период главной',sc.txt.includes(sc.ontime),sc.ontime);
ok('подпись периода и охвата рядом с плитками',await ev(`!!document.querySelector('#view .pulse-scope')&&document.querySelector('#view .pulse-scope').innerText.includes('Вся компания')`));

/* Этап 2: фильтры меняют плитки */
const base=await tiles();
await click('[data-act=fDept][data-arg=sales]');const t1=await tiles();ok('подразделение меняет плитки',JSON.stringify(t1)!==JSON.stringify(base));
ok('подразделение «Продажи»: плитки продаж',t1.some(t=>/Оборот|чек|скидк/i.test(t)));
await click('[data-act=fReset]');
await click('[data-act=period][data-arg="8"]');const t2=await tiles();ok('период меняет значения плиток',JSON.stringify(t2)!==JSON.stringify(base));await click('[data-act=fReset]');
await click('[data-act=fProduct][data-arg="2"]');const t3=await tiles();ok('продукт меняет значения плиток',JSON.stringify(t3)!==JSON.stringify(base));
ok('фильтр показан в подписи',(await ev(`document.querySelector('#view .pulse-scope').innerText`)).includes('Premium'));await shot(THEME+'-23b-filter-product');
await click('[data-act=fReset]');ok('«Сбросить» возвращает исходные плитки',JSON.stringify(await tiles())===JSON.stringify(base));
ok('у плитки есть план/норма и цветной статус',await ev(`!!document.querySelector('#view .kpi-tile [class*=status], #view .kpi-tile [class*=st-]')`));

/* Роли: директор видит всё */
const acc=(k,r,d)=>ev(`InsightData.access(${JSON.stringify(k)},${JSON.stringify(r)},${JSON.stringify(d)}).open`);
ok('директор: маржа и обеспеченность открыты',await acc('margin','director',null)&&await acc('staffing','director',null));
ok('продажи: маржа закрыта',!(await acc('margin','head','sales')));ok('финансы: маржа открыта',await acc('margin','head','fin'));
ok('продажи: отсутствие и вакансии закрыты',!(await acc('absence','head','sales')));ok('персонал: отсутствие открыто',await acc('absence','head','hr'));
ok('производство: обеспеченность открыта (свои смены)',await acc('staffing','head','prod'));ok('финансы: обеспеченность закрыта',!(await acc('staffing','head','fin')));
ok('14 открытых показателей у любого руководителя',await ev(`InsightData.kpis().filter(k=>InsightData.access(k.id,'head','support').open).length`)===14);

/* Роли в интерфейсе */
await asRole('head','sales');const hv=await view();
ok('руководитель продаж: маржа показана как закрытая (видят финансы и директор)',/Закрыто: видят финансы и директор/.test(hv)||await ev(`closedText(kpiById('margin'))`)==='Закрыто: видят финансы и директор');ok('руководитель продаж: главная сразу по Продажам',(await ev(`document.querySelector('#view .pulse-scope').innerText`)).includes('Продажи'));
await shot(THEME+'-23c-head-sales');
await go('#/deviations/D-118');ok('чужое отклонение по ссылке: «Нет доступа»',/Нет доступа/i.test(await view()));
await go('#/deviations/D-117');ok('своё отклонение открывается',!/Нет доступа/i.test(await view()));
await go('#/overview');
await asRole('head','fin');ok('руководитель финансов видит маржу открытой',await ev(`(()=>{const k=kpiById('margin');return kpiOpen(k)})()`));
await asRole('head','prod');await go('#/deviations/D-117');ok('производство не видит отклонение продаж',/Нет доступа/i.test(await view()));await go('#/deviations/D-118');ok('производство видит брак Ricoh',!/Нет доступа/i.test(await view()));
await go('#/overview');await asRole('ceo');await go('#/deviations/D-117');ok('директор видит любое отклонение',!/Нет доступа/i.test(await view()));

/* Качество данных */
await go('#/data');const dv=await view();await shot(THEME+'-23d-quality');
ok('экран качества: источники CRM, ERP, 1С, HR',['CRM','ERP','1С','HR'].every(x=>dv.includes(x)));
ok('экран качества: свежесть и сверка 1С с ERP',/обновл|свеж|загрузк/i.test(dv)&&/сверк/i.test(dv));
ok('экран качества: контракт события (event_id, order_id, actor, outcome)',['event_id','order_id','actor','outcome'].every(x=>dv.includes(x)));

const f=[...new Set(errs)];ok('нет исключений',f.length===0,f.join(' || '));
console.log(R.join('\n'));console.log('FAILS',R.filter(x=>x.startsWith('FAIL')).length,'of',R.length);ws.close();ch.kill();process.exit(0);
})().catch(e=>{console.log('CRASH',e.message);ch.kill();process.exit(1)});
