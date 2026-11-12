const {spawn}=require('child_process');const fs=require('fs'),path=require('path');
const URLF='file:///D:/hackathons/Great%20stone%20hackathon/photoprintHac/design/insight/glass.html';const OUT=process.argv[2];
const ch=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=9946','--no-first-run','--user-data-dir='+path.join(OUT,'prof22'),'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let tgt;for(let i=0;i<40&&!tgt;i++){await sleep(300);try{const l=await (await fetch('http://127.0.0.1:9946/json')).json();tgt=l.find(t=>t.type==='page')}catch{}}
const ws=new WebSocket(tgt.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pend={},errs=[];
const send=(m,p={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method:m,params:p}))});
ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]}if(d.method==='Runtime.exceptionThrown')errs.push(d.params.exceptionDetails.text+' '+JSON.stringify(d.params.exceptionDetails.exception&&d.params.exceptionDetails.exception.description))};
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result.exceptionDetails)throw new Error(e.slice(0,120)+' :: '+JSON.stringify(r.result.exceptionDetails.exception&&r.result.exceptionDetails.exception.description));return r.result.result.value};
const shot=async n=>{await sleep(250);const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,n+'.png'),Buffer.from(r.result.data,'base64'))};
const R=[];const ok=(n,c,x='')=>R.push((c?'PASS ':'FAIL ')+n+(x?' | '+x:''));
const click=async sel=>{await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)throw new Error('нет '+${JSON.stringify(sel)});e.click()})()`);await sleep(220)};
const has=sel=>ev(`!!document.querySelector(${JSON.stringify(sel)})`);
const txt=()=>ev(`document.getElementById('view').innerText`);
const go=async h=>{await ev(`location.hash=${JSON.stringify(h)}`);await sleep(250)};
const hash=()=>ev('location.hash');
const typeIn=async(sel,v)=>{await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await sleep(40)};
const pick=async(btn,val)=>{await click(btn);await click(`.pop [data-val="${val}"]`)};
const noticeTo=(p,s)=>ev(`S.notices.some(n=>n.role==='manager'&&n.to===${JSON.stringify(p)}&&n.text.includes(${JSON.stringify(s)}))`);
await send('Page.enable');await send('Runtime.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:URLF+'#/meetings'});await sleep(900);

/* Пусто */
let t=await txt();ok('пустой список объясняет',t.includes('Встреч пока нет')&&await has('[data-act=meetNew]'));await shot('m0-empty');

/* Назначение из карточки */
await go('#/deviations/D-118');await click('[data-act=meetNew]');ok('форма новой встречи',await hash()==='#/meetings/new');
ok('отклонение уже в повестке',await ev(`document.querySelector('[data-act=mDev][data-arg="D-118"]').getAttribute('aria-pressed')`)==='true');
ok('участников по умолчанию нет',await ev(`document.querySelectorAll('[data-act=mPerson][aria-pressed=true]').length`)===0);
await click('[data-act=mSave]');t=await txt();ok('без участников не назначить',t.includes('Выберите, кого позвать'));ok('встреча не создана',await ev('S.meetings.length')===0);
for(const p of ['Технолог печати','Менеджер закупок','Руководитель смен'])await click(`[data-act=mPerson][data-arg="${p}"]`);
ok('счётчик участников',(await txt()).includes('выбрано 3'));
await typeIn('#mf-topic','График отпусков на декабрь');await click('[data-act=mTopicAdd]');ok('свой вопрос добавлен',(await ev(`document.querySelector('.topics').innerText`)).includes('График отпусков'));
await pick('#mf-t','11:00');await shot('m1-form');
await click('[data-act=mSave]');const mid=await ev('S.meetings[0].id');
ok('открылась карточка встречи',await hash()===`#/meetings/${mid}`);t=await txt();ok('состояние и дата',t.includes('Назначена')&&t.includes('Сегодня в 11:00'));ok('повестка со своим вопросом',t.includes('D-118')&&t.includes('График отпусков'));
ok('приглашения каждому',await noticeTo('Технолог печати','Приглашение')&&await noticeTo('Менеджер закупок','Приглашение')&&await noticeTo('Руководитель смен','Приглашение'));
ok('не приглашённым ничего',!(await noticeTo('Директор по развитию','Приглашение')));
ok('главная кнопка итогов в день встречи',await has('#view .btn-primary[data-act=mOutcomes]'));await shot('m2-planned');

/* Список и карточка отклонения */
await go('#/meetings');t=await txt();ok('встреча в ближайших',t.includes('Ближайшие')&&t.includes('3 участника'));
await go('#/deviations/D-118');ok('карточка ведёт на встречу',await ev(`document.querySelector('#view a.btn-go').getAttribute('href')`)===`#/meetings/${mid}`);
await go('#/deviations/D-117');ok('другое отклонение можно добавить во встречу',await has(`[data-act=meetJoin][data-arg="${mid}:D-117"]`));await click(`[data-act=meetJoin][data-arg="${mid}:D-117"]`);ok('добавлено в повестку',await ev(`findMeet('${mid}').devs.includes('D-117')`)&&await noticeTo('Технолог печати','добавлено'));
await go('#/overview');ok('в календаре',await ev(`calendarEvents().some(e=>e.href==='#/meetings/${mid}')`));

/* Перенос: уведомление участникам */
await go('#/meetings/'+mid);await click('.act-menu summary');await click('[data-act=mEditOpen]');ok('форма изменения с данными',(await ev(`document.getElementById('mf-title').value`)).includes('Оперативное'));
await pick('#mf-d','2026-11-12');await click('[data-act=mSave]');ok('перенесено',await ev(`findMeet('${mid}').date`)==='2026-11-12');ok('участники знают о переносе',await noticeTo('Менеджер закупок','перенесена'));
t=await txt();ok('будущая: итоги не главная кнопка',!(await has('#view .btn-primary'))&&await has('[data-act=mOutcomes]'));

/* Сотрудник видит свои встречи */
await ev(`S.role='manager';S.me='Технолог печати';render()`);await go('#/meetings');t=await txt();ok('сотрудник видит приглашение',t.includes('Оперативное')&&!(await has('[data-act=meetNew]')));
await go('#/meetings/'+mid);t=await txt();ok('сотрудник: без управления',t.includes('Вас пригласили')&&!(await has('[data-act=mOutcomes]')));
await ev(`S.me='Директор по развитию';render()`);await go('#/meetings');ok('не приглашённый не видит',(await txt()).includes('Вас пока не приглашали'));await go('#/meetings/'+mid);ok('по ссылке тоже нет',(await txt()).includes('Вы не участник'));
await ev(`S.role='ceo';render()`);

/* Итоги вручную */
await go('#/meetings/'+mid);await click('[data-act=mOutcomes]');t=await txt();ok('экран итогов',t.includes('Итоги встречи')&&await has('[data-act=ocState]'));ok('нет обязательного ассистента',!t.includes('Ответ AI')&&!t.includes('реплик'));
await click('[data-act=ocSave]');ok('без отметок не сохранить',(await txt()).includes('Отметьте: решили или нет'));
await click('[data-act=ocState][data-arg="D-118:yes"]');await typeIn('#oc-D-118-x','Калибровка после каждого простоя');await pick('#oc-D-118-0-o','Технолог печати');await pick('#oc-D-118-0-d','2026-11-14');
await click('[data-act=ocState][data-arg="D-117:no"]');
await click('[data-act=ocState][data-arg="q0:yes"]');await typeIn('#oc-q0-x','Утвердить график до 20 ноября');await click('[data-act=ocTaskAdd][data-arg=q0]');await typeIn('#oc-q0-0-t','Собрать пожелания по отпускам');await pick('#oc-q0-0-o','Руководитель смен');await pick('#oc-q0-0-d','2026-11-18');
await shot('m3-outcomes');await click('[data-act=ocSave]');
ok('встреча прошла',await ev(`findMeet('${mid}').status`)==='done');ok('D-118 в работе со встречи',await ev('S.status')==='work'&&await ev('S.decision.meetId')===mid);ok('задача без своего названия = решение',await ev('S.decision.tasks[0].title')==='Калибровка после каждого простоя');
ok('D-117 остался открытым',await ev(`S.others['D-117']?S.others['D-117'].status:'open'`)==='open');
ok('задача по своему вопросу',await ev('S.freeTasks.length')===1&&await noticeTo('Руководитель смен','Собрать пожелания'));
t=await txt();ok('итоги видны',t.includes('Решили: Калибровка')&&t.includes('Без решения')&&t.includes('Утвердить график'));await shot('m4-done');

/* Сотрудник выполняет задачу по своему вопросу, руководитель принимает на встрече */
const ft=await ev('S.freeTasks[0].id');await ev(`S.role='manager';S.me='Руководитель смен';location.hash='#/tasks/${ft}'`);await sleep(300);t=await txt();ok('сотрудник видит контекст вопроса',t.includes('График отпусков на декабрь')&&t.includes('Вопрос со встречи'));
await click('[data-act=take]');await typeIn('#rp-t','Пожелания собраны');await click('[data-act=submitReport]');ok('отчёт отправлен',await ev(`findTask('${ft}').status`)==='submitted');
ok('руководителю уведомление ведёт на встречу',await ev(`S.notices.some(n=>n.role==='ceo'&&n.href==='#/meetings/${mid}')`));
await ev(`S.role='ceo';location.hash='#/meetings/${mid}'`);await sleep(300);await click(`[data-act=accept][data-arg="${ft}"]`);ok('принято на встрече',await ev(`findTask('${ft}').status`)==='accepted');

/* Итоги через запись */
await ev(`S=INITIAL();render()`);await go('#/meetings');await click('[data-act=meetNew]');await click('[data-act=mDev][data-arg="D-118"]');await click('[data-act=mPerson][data-arg="Технолог печати"]');await click('[data-act=mSave]');const m2=await ev('S.meetings[0].id');
await click('[data-act=mOutcomes]');await click('.rec summary');await click('[data-act=recParse]');ok('пустая запись: ошибка',(await txt()).includes('Вставьте текст записи'));
await click('[data-act=recSample]');ok('пример записи вставлен',(await ev(`document.getElementById('rec-t').value`)).includes('Директор:'));
await click('[data-act=recParse]');ok('ассистент заполнил',await ev(`S.out['D-118'].ai`)&&await ev(`S.out['D-118'].tasks.length`)===3);ok('пометка проверить',(await txt()).includes('Заполнил ассистент, проверьте'));await shot('m5-ai');
await click('[data-act=ocSave]');ok('три задачи из записи',await ev('S.decision.tasks.length')===3);
await click('.act-menu summary');await click(`[data-act=mUndo][data-arg="${m2}"]`);ok('итоги можно исправить',await ev(`findMeet('${m2}').status`)==='planned'&&await ev('S.status')==='open'&&await ev(`S.outFor`)===m2);ok('черновик сохранился',await ev(`S.out['D-118'].tasks.length`)===3);

/* Отмена встречи */
await click('[data-act=ocCancel]');await click('.act-menu summary');await click('[data-act=mCancel]');ok('отменена',await ev(`findMeet('${m2}').status`)==='cancelled'&&await noticeTo('Технолог печати','отменена'));
await go('#/deviations/D-118');ok('отклонение снова можно вынести',await has('[data-act=meetNew]'));
await go('#/meetings');ok('отменённые свёрнуты',await has('details.dev-fold'));

/* Прошедшая без итогов */
await ev(`S=INITIAL();S.meetings.push({id:'M-9',title:'Планёрка',date:'2026-11-05',time:'10:00',people:['Технолог печати'],devs:['D-119'],topics:[],status:'planned',made:null});render()`);await go('#/meetings');t=await txt();ok('ждёт итогов',t.includes('Нужно внести итоги')&&t.includes('Ждёт итогов'));ok('счётчик в меню',(await ev(`[...document.querySelectorAll('#nav a')].find(a=>a.getAttribute('href')==='#/meetings').innerText`)).includes('1'));

/* Телефон */
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await click('[data-act=meetNew]');await sleep(200);let w=await ev('[document.documentElement.scrollWidth,innerWidth]');ok('390 форма без сдвига',w[0]<=w[1],w.join('/'));await shot('m6-390');
await go('#/meetings/M-9');await click('[data-act=mOutcomes]');w=await ev('[document.documentElement.scrollWidth,innerWidth]');ok('390 итоги без сдвига',w[0]<=w[1],w.join('/'));

ok('нет исключений',errs.length===0,errs.join(';'));
console.log(R.join('\n'));console.log('FAILS',R.filter(x=>x.startsWith('FAIL')).length,'of',R.length);ws.close();ch.kill();process.exit(0)})().catch(e=>{console.log('CRASH',e.message);ch.kill();process.exit(1)});
