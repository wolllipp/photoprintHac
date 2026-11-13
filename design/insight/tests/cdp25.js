// Этап 4: заказы-основания и «5 → 1». От красной плитки до конкретного заказа не больше 3 кликов, карточка заказа со всеми источниками, права.
// Запуск: node cdp25.js <папка для скриншотов> [dark|light]
const {spawn}=require('child_process');const fs=require('fs'),path=require('path');
const OUT=process.argv[2];const THEME=process.argv[3]||'dark';fs.mkdirSync(OUT,{recursive:true});
const URLF=require('./env').page('glass.html');
const ch=spawn(require('./env').chrome(),['--headless=new','--remote-debugging-port=9954','--no-first-run','--user-data-dir='+path.join(OUT,'prof25'),'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let tgt;for(let i=0;i<40&&!tgt;i++){await sleep(300);try{const l=await (await fetch('http://127.0.0.1:9954/json')).json();tgt=l.find(t=>t.type==='page')}catch{}}
const ws=new WebSocket(tgt.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pend={},errs=[];
const send=(m,p={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method:m,params:p}))});
ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]}if(d.method==='Runtime.exceptionThrown')errs.push(d.params.exceptionDetails.text+' '+JSON.stringify(d.params.exceptionDetails.exception&&d.params.exceptionDetails.exception.description))};
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result.exceptionDetails)throw new Error(e.slice(0,120)+' :: '+JSON.stringify(r.result.exceptionDetails.exception&&r.result.exceptionDetails.exception.description));return r.result.result.value};
const shot=async n=>{await sleep(250);const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,n+'.png'),Buffer.from(r.result.data,'base64'))};
const R=[];const ok=(n,c,x='')=>R.push((c?'PASS ':'FAIL ')+n+(x?' | '+x:''));
let clicks=0;
const click=async sel=>{await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)throw new Error('нет '+${JSON.stringify(sel)});e.click()})()`);clicks++;await sleep(300)};
const has=sel=>ev(`!!document.querySelector(${JSON.stringify(sel)})`);
const go=async h=>{await ev(`location.hash=${JSON.stringify(h)}`);await sleep(300)};
const view=()=>ev(`document.getElementById('view').innerText`);
const hash=()=>ev('location.hash');
const asRole=async(role,dept)=>{await ev(`S.role=${JSON.stringify(role)};S.dept=${JSON.stringify(dept||'prod')};S.fDept=${role==='head'?JSON.stringify(dept):'null'};S.fProduct=null;S.line=null;document.getElementById('role').value=S.role;render()`);await sleep(250)};
await send('Page.enable');await send('Runtime.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1500,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:URLF+'#/overview'});await sleep(900);
await ev(`localStorage.setItem('insight-theme',${JSON.stringify(THEME)});document.documentElement.dataset.theme=${JSON.stringify(THEME)};render()`);await sleep(250);

/* Слой данных */
const D=await ev(`(()=>{const m=InsightData.meta(),L=InsightData.orders({from:m.stories.batch,line:0,shift:1,defects:true}),P=InsightData.orders({from:m.stories.promo,product:2,coupon:true});
  const raw=window.INSIGHT_DATA,T=raw.tickets.rows,O=new Map(raw.orders.rows.map(r=>[r[0],r]));
  const early=T.filter(t=>t[2]&&(t[5]===1||t[5]===3)&&O.get(t[2])&&t[3]<=O.get(t[2])[14]).length;
  return {n:L.length,all:L.every(o=>o.line==='Ricoh'&&o.shift==='Ночь'&&o.defects>0&&o.date>=m.stories.batch),sorted:L.every((o,i)=>!i||L[i-1].ts>=o.ts),owners:L.every(o=>o.action.owner==='Начальник производства'),p:P.length,pAll:P.every(o=>o.product==='Фотокнига Premium'&&o.coupon),early,first:L[0].id}})()`);
ok('основания D-118: Ricoh, ночь, брак, с 26 окт',D.n===7&&D.all,String(D.n));ok('основания отсортированы от новых к старым',D.sorted);
ok('у каждого заказа брака ответственный — начальник производства',D.owners);
ok('основания D-117: Premium по купону',D.p>0&&D.pAll,String(D.p));
ok('в данных нет жалоб на брак или доставку раньше отгрузки',D.early===0,String(D.early));
const O=await ev(`(()=>{const o=InsightData.order(${JSON.stringify(D.first)});return {erp:!!o.erp,ledger:!!o.ledger,crm:!!o.crm,support:Array.isArray(o.support),ev:o.events.length,sortedEv:o.events.every((e,i)=>!i||o.events[i-1].ts<=e.ts),tz:o.events.every(e=>/\\+03:00$/.test(e.ts)),srcs:[...new Set(o.events.map(e=>e.source))].sort().join(),noName:!JSON.stringify(o).match(/"[^"]*(name|fio|фио|phone|email)[^"]*":|@|\\+\\d[\\d\\s()-]{8,}/i)}})()`);
ok('карточка заказа собирает ERP, 1С, CRM и поддержку',O.erp&&O.ledger&&O.crm&&O.support);
ok('события по времени, с часовым поясом',O.ev>=4&&O.sortedEv&&O.tz,O.srcs);ok('в карточке нет ФИО и контактов',O.noName);

/* Путь директора: красная плитка → отклонение → заказ */
await asRole('ceo');clicks=0;
ok('плитка «Брак» красная и ведёт в отклонение',await ev(`(()=>{const t=[...document.querySelectorAll('#view .pulse .kpi-tile')].find(t=>t.innerText.includes('Брак'));return !!t.querySelector('.st-bad')&&!!t.querySelector('a.kpi-link[href="#/deviations/D-118"]')})()`));
await click('#view .pulse a.kpi-link[href="#/deviations/D-118"]');
ok('клик 1: карточка D-118 с заказами-основаниями',await hash()==='#/deviations/D-118'&&(await view()).includes('Заказы-основания'));
ok('в списке 6 заказов и «Показать все 7»',await ev(`document.querySelectorAll('.basis tbody tr').length`)===6&&(await view()).includes('Показать все 7'));
await shot(THEME+'-25a-basis');
await click(`.basis a.order-link[href="#/orders/${D.first}/D-118"]`);
ok('клик 2: открыт конкретный заказ',await hash()===`#/orders/${D.first}/D-118`,await hash());
ok('от красной плитки до заказа не больше 3 кликов',clicks<=3,clicks+' клика');
let t=await view();
ok('карточка: следующий шаг и ответственный',t.includes('Следующий шаг')&&t.includes('Начальник производства')&&/Переделать \d+ из \d+ шт\./.test(t));
ok('карточка: все источники',['Производство','Оплата','Клиент','Обращения','Путь заказа по всем источникам'].every(x=>t.includes(x))&&['ERP','1С','CRM','Поддержка'].every(x=>t.includes(x)));
ok('директор видит себестоимость и маржу заказа',t.includes('Себестоимость')&&t.includes('Маржа заказа')&&!t.includes('закрыто: видят финансы'));
ok('в меню нет пункта «Заказ»',!(await ev(`[...document.querySelectorAll('#nav a')].some(a=>a.getAttribute('href')==='#/orders')`)));
await shot(THEME+'-25b-order');
await click('#view a.crumb');ok('назад к отклонению D-118',await hash()==='#/deviations/D-118');
await click('.basis [data-act=basisAll]');ok('«Показать все» раскрывает 7 заказов',await ev(`document.querySelectorAll('.basis tbody tr').length`)===7);
await go('#/orders/O-1');ok('несуществующий заказ: понятное сообщение',(await view()).includes('Заказ не найден'));

/* Руководитель продаж: своя плитка скидки → D-117 → заказ, без себестоимости; чужой заказ закрыт */
await go('#/overview');await asRole('head','sales');clicks=0;
ok('продажи: плитка скидки ведёт в D-117',await has('#view .pulse a.kpi-link[href="#/deviations/D-117"]'));
await click('#view .pulse a.kpi-link[href="#/deviations/D-117"]');await click('.basis a.order-link');
ok('продажи: до заказа за 2 клика',/^#\/orders\/O-\d+\/D-117$/.test(await hash())&&clicks<=3,await hash());
t=await view();ok('продажи: себестоимость закрыта',t.includes('закрыто: видят финансы и директор')&&!t.includes('Маржа заказа'));
ok('продажи: шаг по купону',t.includes('Руководитель продаж')||t.includes('Действий не требуется'));
await go(`#/orders/${D.first}/D-118`);ok('продажи: заказ из чужого отклонения закрыт',(await view()).includes('Нет доступа'));
/* Производство: свой заказ брака открыт, плитка скидки — без ссылки */
await go('#/overview');await asRole('head','prod');
await go(`#/orders/${D.first}/D-118`);t=await view();ok('производство: свой заказ открывается',t.includes('Следующий шаг')&&t.includes('закрыто: видят финансы'));
await go('#/overview');ok('производство: плитка брака ведёт в отклонение',await has('#view .pulse a.kpi-link[href="#/deviations/D-118"]'));
/* Сотрудник: карточек заказов нет */
await asRole('manager');await go(`#/orders/${D.first}/D-118`);ok('сотрудник: карточка заказа закрыта',/Нет доступа/.test(await view()));
await go('#/overview');await asRole('ceo');

const f=[...new Set(errs)];ok('нет исключений',f.length===0,f.join(' || '));
console.log(R.join('\n'));console.log('FAILS',R.filter(x=>x.startsWith('FAIL')).length,'of',R.length);ws.close();ch.kill();process.exit(0);
})().catch(e=>{console.log('CRASH',e.message);ch.kill();process.exit(1)});
