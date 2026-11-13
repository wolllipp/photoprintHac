// Этап 8: экраны «Продажи и клиент», «Производство и качество», «Финансы и люди»: цифры = KPI, права подразделений, переход из строк к заказам, телефон 390 px.
// Запуск: node cdp28.js <папка для скриншотов>. Отдельно или через node run-all.js
const { spawn } = require("child_process"); const fs = require("fs"), path = require("path");
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const URLF = require("./env").page("glass.html");
const ch = spawn(require("./env").chrome(), ["--headless=new", "--remote-debugging-port=9964", "--no-first-run", "--window-size=1440,1000", "--user-data-dir=" + path.join(OUT, "prof"), "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let tgt; for (let i = 0; i < 40 && !tgt; i++) { await sleep(300); try { const l = await (await fetch("http://127.0.0.1:9964/json")).json(); tgt = l.find(t => t.type === "page"); } catch { } }
  const ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r); let id = 0; const pend = {}; let errs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } if (d.method === "Runtime.exceptionThrown") errs.push(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text); };
  const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(e.slice(0, 140) + " :: " + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description)); return r.result.result.value; };
  const R = []; const ok = (n, c, x = "") => R.push((c ? "PASS " : "FAIL ") + n + (x !== "" ? " | " + x : ""));
  const go = async h => { await ev(`location.hash=${JSON.stringify(h)}`); await sleep(700); };
  const view = () => ev(`document.getElementById('view').innerText`);
  const full = async n => { const m = await ev(`({w:document.documentElement.clientWidth,h:Math.ceil(document.documentElement.scrollHeight)})`); await send("Emulation.setDeviceMetricsOverride", { width: m.w, height: Math.min(m.h, 6000), deviceScaleFactor: 1, mobile: m.w < 500 }); await sleep(400); const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(OUT, n + ".png"), Buffer.from(r.result.data, "base64")); await send("Emulation.clearDeviceMetricsOverride"); await sleep(200); };
  const noHScroll = () => ev(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`);
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.navigate", { url: URLF + "#/overview" }); await sleep(2200);
  await ev(`document.body.classList.add('bar-hidden');localStorage.removeItem('picpac-insight-state-v1')`);
  await ev(`ACT.setRole('ceo');render()`); await sleep(300);

  /* Меню у руководителя */
  const nav = await ev(`[...document.querySelectorAll('#nav a')].map(a=>a.getAttribute('href'))`);
  ok("в меню руководителя три новых экрана", ["#/sales", "#/production", "#/finance"].every(h => nav.includes(h)), nav.join(" "));

  /* Продажи */
  await go("#/sales"); let t = await view();
  const SN = await ev(`(()=>{const r=homeRange(),[a,b]=dayRange(r.a,r.b),X=InsightData.sales(a,b);return {conv:fPct(X.funnel[1].n/X.funnel[0].n),kconv:kpiById('conversion').f(kpiById('conversion').calc(r.a,r.b)),ch:X.channels.length,seg:X.segments.length,churn:fPct(X.churn.rate)}})()`);
  ok("продажи: воронка, каналы, сегменты, отток, обращения", ["Воронка приложения", "Каналы продаж", "Сегменты: повод покупки", "Отток за полгода", "Обращения клиентов", "Конверсия по неделям"].every(s => t.includes(s)));
  ok("продажи: конверсия воронки = плитка KPI", SN.conv === SN.kconv && t.includes(SN.kconv), `${SN.conv} / ${SN.kconv}`);
  ok("продажи: 3 канала и 5 поводов", SN.ch >= 3 && SN.seg === 5, `${SN.ch} / ${SN.seg}`);
  await sleep(1500); ok("продажи: отток показан", await ev(`[...document.querySelectorAll("#view .stat-line .kpi-val")].some(e=>e.textContent===${JSON.stringify("")}+fPct(InsightData.sales(...dayRange(homeRange().a,homeRange().b)).churn.rate))`), SN.churn);
  await full("1-sales");

  /* Производство */
  await go("#/production"); t = await view();
  const PN = await ev(`(()=>{const r=homeRange(),[a,b]=dayRange(r.a,r.b),X=InsightData.production(a,b),kd=kpiById('defect');return {def:fPct(X.total.defectRate),kdef:kd.f(kd.calc(r.a,r.b)),lines:X.lines.length,plan:X.total.plan}})()`);
  ok("производство: план/факт, очередь, перепечатка", ["План и факт отгрузки по линиям", "Очередь заказов", "Брак и перепечатка", "Заказы в срок по неделям"].every(s => t.includes(s)));
  ok("производство: брак всего = плитка «Брак»", PN.def === PN.kdef, `${PN.def} / ${PN.kdef}`);
  ok("производство: строка на каждую линию и итог", PN.lines === 3 && t.includes("Всего"), String(PN.plan));
  ok("производство: Ricoh ведёт в D-118", await ev(`!!document.querySelector('#view a[href="#/deviations/D-118"]')`));
  await full("2-production");

  /* Финансы и люди */
  await go("#/finance"); t = await view();
  ok("финансы: БДР, продукты, БДДС на вкладке «Финансы»", ["БДР: план и факт по месяцам", "По продуктам за период", "БДДС: движение денег"].every(s => t.includes(s)) && !t.includes("Штат по подразделениям"));
  await ev(`document.querySelector('[data-act="finTab"][data-arg="hr"]').click()`); await sleep(700); const tHr = await view();
  ok("финансы: вкладка «Люди» — штат и потребность к сезону", ["Штат по подразделениям", "Нужно к сезону"].every(s => tHr.includes(s)) && !tHr.includes("БДР"));
  await ev(`document.querySelector('[data-act="finTab"][data-arg="fin"]').click()`); await sleep(700);
  ok("финансы: без абсолютных сумм (нет «руб.» вне плитки чека)", await ev(`[...document.querySelectorAll('#view .sheet')].every(s=>!/руб\\./.test(s.innerText))`));
  const FN = await ev(`(()=>{const r=homeRange(),[a,b]=dayRange(r.a,r.b),F=InsightData.finance(a,b),P=InsightData.people(a,b),kt=kpiById('turnover'),ks=kpiById('staffing');return {tp:fPct(F.all.toPlan),kt:kt.f(kt.calc(r.a,r.b)),st:fPct(P.total.staffing),ks:ks.f(ks.calc(r.a,r.b))}})()`);
  ok("финансы: выручка к плану = плитка «Оборот»", FN.tp === FN.kt, `${FN.tp} / ${FN.kt}`);
  ok("люди: обеспеченность = плитка KPI", FN.st === FN.ks, `${FN.st} / ${FN.ks}`);
  await full("3-finance");

  /* Права: руководители подразделений */
  const asHead = async d => { await ev(`ACT.switchTo('h:${d}')`); await sleep(500); };
  await asHead("sales");
  let navH = await ev(`[...document.querySelectorAll('#nav a')].map(a=>a.getAttribute('href'))`);
  ok("руководитель продаж: в меню только «Продажи и клиент»", navH.includes("#/sales") && !navH.includes("#/production") && !navH.includes("#/finance"), navH.join(" "));
  await go("#/production"); t = await view();
  ok("руководитель продаж: производство закрыто", t.includes("Нет доступа"));
  await asHead("fin"); await go("#/finance"); t = await view();
  ok("финдиректор: финансы есть, людей нет", t.includes("БДР") && !t.includes("Штат по подразделениям"));
  await asHead("hr"); await go("#/finance"); t = await view();
  ok("HR-директор: люди есть, финансов нет", t.includes("Штат по подразделениям") && !t.includes("БДР"));
  await asHead("prod"); await go("#/production"); t = await view();
  ok("начальник производства: производство открыто", t.includes("План и факт отгрузки"));
  await go("#/finance"); t = await view();
  ok("начальник производства: финансы и люди закрыты", t.includes("Нет доступа"));
  await asHead("support"); await go("#/sales"); t = await view();
  ok("руководитель поддержки: продажи и клиент с SLA", t.includes("SLA поддержки") && t.includes("Обращения клиентов"));
  await ev(`ACT.switchTo('p:Технолог печати')`); await sleep(500);
  navH = await ev(`[...document.querySelectorAll('#nav a')].map(a=>a.getAttribute('href'))`);
  ok("менеджер: экранов подразделений в меню нет", !navH.some(h => ["#/sales", "#/production", "#/finance"].includes(h)));
  await go("#/sales"); t = await view();
  ok("менеджер по прямой ссылке: нет доступа", t.includes("Нет доступа"));

  /* Период меняет экран */
  await ev(`ACT.switchTo('ceo')`); await sleep(400); await go("#/production");
  const p4 = await ev(`document.querySelector('#view tr.tot').innerText`);
  await ev(`ACT.period(8);render()`); await sleep(500);
  const p8 = await ev(`document.querySelector('#view tr.tot').innerText`);
  ok("период 8 недель меняет цифры", p4 !== p8, p4.replace(/\s+/g, " ").slice(0, 40) + " → " + p8.replace(/\s+/g, " ").slice(0, 40));
  await ev(`ACT.period(4);render()`);

  /* Светлая тема и телефон */
  await ev(`document.documentElement.dataset.theme='light'`);
  for (const p of ["sales", "production", "finance"]) { await go("#/" + p); await full("4-light-" + p); }
  await ev(`document.documentElement.dataset.theme='dark'`);
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await sleep(500);
  for (const p of ["sales", "production", "finance"]) { await go("#/" + p); ok(`телефон 390 px: ${p} без горизонтальной прокрутки`, await noHScroll()); }
  await go("#/sales"); { const m = await ev(`Math.ceil(document.documentElement.scrollHeight)`); await send("Emulation.setDeviceMetricsOverride", { width: 390, height: Math.min(m, 6000), deviceScaleFactor: 1, mobile: true }); await sleep(400); const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(OUT, "5-phone-sales.png"), Buffer.from(r.result.data, "base64")); }
  await send("Emulation.clearDeviceMetricsOverride");

  /* Исправления по аудиту */
  await ev(`ACT.switchTo('ceo')`); await sleep(400);
  await go("#/finance"); await sleep(1200);
  ok("1. финансы: нигде нет «руб.», включая плитки", !/руб\./.test(await view()));
  ok("1. плитка «Сильнее всего отстаёт»", (await view()).includes("Сильнее всего отстаёт"));
  await go("#/production"); await sleep(1200); t = await view();
  ok("2. брак по неделям: два ряда, книги и печать", await ev(`document.querySelectorAll('#view .wk-h3').length`) === 2 && t.includes("Фотокниги") && t.includes("Фотопечать"));
  const sel = await ev(`[...document.querySelectorAll('#view .wk-chart')].slice(1).map((c,i)=>[...c.querySelectorAll('.bar-fill.sel .bar-val')].map(e=>parseFloat(e.textContent.replace(',','.')))).map((a,i)=>a.every(v=>v>(i?1.2:2.4)))`);
  ok("2. выделены только недели выше нормы своего ряда", sel.length === 2 && sel.every(Boolean), JSON.stringify(sel));
  ok("4. Premium: «мало данных», без красного", t.includes("мало данных") && await ev(`[...document.querySelectorAll('#view .hbars li')].filter(l=>l.innerText.includes('Фотокнига Premium')).every(l=>!l.querySelector('.hb-fill.bad'))`));
  ok("8. простои: часы и доля", /\d ч · \d/.test(t));
  const nor = await ev(`InsightData.production(...dayRange(homeRange().a,homeRange().b)).lines[2].load`);
  ok("3. Noritsu: загрузка правдоподобная", nor > 0.08, (nor * 100).toFixed(1) + " %");
  await go("#/sales"); t = await view();
  ok("5. колонка «Первый заказ»", t.includes("Первый заказ") && !/Новые клиенты\t/.test(t));
  ok("7. отток: в ⓘ сказано, что не зависит от периода", (await ev(`document.getElementById("view").textContent`)).includes("от выбранного периода отток не зависит"));
  const u2 = await ev(`(()=>{const L=dayRange(lastWeek(),lastWeek())[1],f=InsightData.finance(L-13,L),f8=InsightData.finance(L-55,L);return [f.unpaid,f8.unpaid,f.unpaidShare>f8.unpaidShare]})()`);
  ok("6. ожидаемые поступления считаются по заказам периода", u2[0] <= u2[1] && u2[2], JSON.stringify(u2));
  /* Фильтры главной не протекают на экраны и сохраняются после ухода */
  await ev(`S.fProduct=2;S.line='Ricoh'`); await go("#/production"); await sleep(1200);
  const leak = await ev(`(()=>{const tile=[...document.querySelectorAll('#view .kpi-tile')].find(t=>t.innerText.includes('Брак'));const v=tile.querySelector('.kpi-val').textContent;const keep=[S.fProduct,S.line];S.fProduct=null;S.line=null;const k=kpiById('defect'),r=homeRange(),w=k.f(k.calc(r.a,r.b));[S.fProduct,S.line]=keep;return {v,w,kept:S.fProduct===2&&S.line==='Ricoh'}})()`);
  ok("фильтры главной не протекают на экран", leak.v === leak.w && leak.kept, JSON.stringify(leak));
  await ev(`S.fProduct=null;S.line=null`);

  /* Вторая группа: провал из строк, БДР, БДДС */
  const clickDrill = async arg => { await ev(`document.querySelector('[data-act="drill"][data-arg="${arg}"]').click()`); await sleep(500); };
  const panel = () => ev(`(()=>{const p=document.querySelector('#view .drill');return p?{n:+p.querySelector('.goal-count').textContent.replace(/\\s/g,''),rows:p.querySelectorAll('tbody tr').length,links:p.querySelectorAll('a.order-link').length,text:p.innerText}:null})()`);
  await go("#/production"); await sleep(800);
  await clickDrill("production:line:0"); let pn = await panel();
  const ricohPlan = await ev(`InsightData.production(...dayRange(homeRange().a,homeRange().b)).lines[0].plan`);
  ok("9. линия Ricoh: заказов в списке = «План» в строке", pn && pn.n === ricohPlan, `${pn && pn.n} / ${ricohPlan}`);
  ok("9. показано 8 и «Показать все»", pn && pn.rows === 8 && pn.text.includes("Показать все"));
  ok("9. директор: номера заказов — ссылки", pn && pn.links === 8);
  ok("9. сначала заказы с проблемой", await ev(`(()=>{const r=[...document.querySelectorAll('#view .drill tbody tr')].map(tr=>/опоздание|срок прошёл|из \\d+ шт/.test(tr.innerText)||+tr.children[7].innerText>0);return r[0]})()`));
  const oid = await ev(`document.querySelector('#view .drill a.order-link').getAttribute('href')`);
  await ev(`location.hash=${JSON.stringify("")}+document.querySelector('#view .drill a.order-link').getAttribute('href')`); await sleep(700);
  t = await view();
  ok("9. карточка заказа открылась", t.includes("Путь заказа по всем источникам"), oid);
  ok("9. назад — «К разделу «Производство и качество»»", t.includes("К разделу «Производство и качество»"));
  await ev(`document.querySelector('#view a.crumb').click()`); await sleep(700);
  ok("9. возврат на экран, список всё ещё раскрыт", (await ev(`location.hash`)) === "#/production" && !!(await panel()));
  await clickDrill("production:line:0");
  ok("9. повторный клик сворачивает", !(await panel()));
  await clickDrill("production:product:2"); pn = await panel();
  const prem = await ev(`InsightData.production(...dayRange(homeRange().a,homeRange().b)).products[2]`);
  ok("9. Premium: заказы с браком", pn && pn.n === prem.defects, `${pn && pn.n} / ${prem.defects}`);
  await clickDrill("production:product:2");
  await go("#/sales"); await sleep(800);
  await clickDrill("sales:channel:1"); pn = await panel();
  const chApp = await ev(`InsightData.sales(...dayRange(homeRange().a,homeRange().b)).channels[1].orders`);
  ok("9. канал «Приложение»: заказов = строке таблицы", pn && pn.n === chApp, `${pn && pn.n} / ${chApp}`);
  await clickDrill("sales:segment:2"); pn = await panel();
  const segW = await ev(`InsightData.sales(...dayRange(homeRange().a,homeRange().b)).segments[2].orders`);
  ok("9. повод «Свадьба»: заказов = строке таблицы", pn && pn.n === segW, `${pn && pn.n} / ${segW}`);
  await clickDrill("sales:segment:2");
  await go("#/finance"); await sleep(1000);
  await clickDrill("finance:product:2"); pn = await panel();
  ok("9. финансы: заказы Premium без рублей", pn && pn.n > 0 && !/руб\./.test(pn.text), pn && pn.text.split("\n")[0]);
  t = await view();
  ok("11. БДР: «Выручка в день, % к прошлому месяцу», без строки себестоимости", t.includes("Выручка в день, % к прошлому месяцу") && !t.includes("Себестоимость, % выручки"));
  ok("10. БДДС не повторяет БДР по месяцам", t.includes("БДДС: движение денег") && !t.includes("план поступлений = 100 %") && t.includes("Выплаты"));
  await clickDrill("finance:product:2");
  /* Руководитель продаж: список виден, карточки чужих заказов не открываются */
  await ev(`ACT.switchTo('h:sales')`); await sleep(500); await go("#/sales"); await sleep(800);
  await clickDrill("sales:channel:0"); pn = await panel();
  const acc = await ev(`(()=>{const tr=[...document.querySelectorAll('#view .drill tbody tr')];return tr.every(r=>{const a=r.querySelector('a.order-link'),id=r.children[0].innerText.trim();return !!a===orderVisible(id)})&&tr.some(r=>!r.querySelector('a.order-link'))})()`);
  ok("9. руководитель продаж: ссылка только на открытые ему карточки", pn && pn.n > 0 && acc && pn.text.includes("оснований отклонений вашего подразделения"), `ссылок ${pn && pn.links}`);
  await clickDrill("sales:channel:0");
  await ev(`ACT.switchTo('ceo')`); await sleep(400);

  ok("нет исключений", errs.length === 0, errs.join(" || ").slice(0, 400));
  console.log(R.join("\n")); console.log("FAILS", R.filter(x => x.startsWith("FAIL")).length, "of", R.length);
  ws.close(); ch.kill();
})().catch(e => { console.error("CRASH", e.message); ch.kill(); process.exit(1); });
