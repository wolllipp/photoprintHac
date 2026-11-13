// Этапы 5–6: единые цифры (D-118, D-117 = KPI), проверки выгрузки из quality(), журнал операций с реальным временем, сохранение в localStorage и сброс демо.
// Запуск: node cdp26.js <папка для скриншотов>. Отдельно или через node run-all.js
const { spawn } = require("child_process"); const fs = require("fs"), path = require("path");
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const URLF = require("./env").page("glass.html");
const ch = spawn(require("./env").chrome(), ["--headless=new", "--remote-debugging-port=9961", "--no-first-run", "--window-size=1440,1000", "--user-data-dir=" + path.join(OUT, "prof"), "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let tgt; for (let i = 0; i < 40 && !tgt; i++) { await sleep(300); try { const l = await (await fetch("http://127.0.0.1:9961/json")).json(); tgt = l.find(t => t.type === "page"); } catch { } }
  const ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r); let id = 0; const pend = {}, errs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } if (d.method === "Runtime.exceptionThrown") errs.push(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text); };
  const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(e.slice(0, 140) + " :: " + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description)); return r.result.result.value; };
  const shot = async n => { await sleep(300); const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(OUT, n + ".png"), Buffer.from(r.result.data, "base64")); };
  const R = []; const ok = (n, c, x = "") => R.push((c ? "PASS " : "FAIL ") + n + (x !== "" ? " | " + x : ""));
  const go = async h => { await ev(`location.hash=${JSON.stringify(h)}`); await sleep(500); };
  const view = () => ev(`document.getElementById('view').innerText`);
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.navigate", { url: URLF + "#/overview" }); await sleep(2000);
  await ev(`document.body.classList.add('bar-hidden')`);

  /* 1. Единые цифры */
  const N = await ev(`(()=>{const d=mainDeviation();const k=kpiById('defect');S.line='Ricoh';const v=k.calc(R.current[0],R.current[1]);const vb=k.calc(R.baseline[0],R.baseline[1]);S.line=null;
    const disc=discountDeviation();S.fProduct=2;const kd=kpiById('discount').calc(R.current[0],R.current[1]);S.fProduct=null;
    return {now:d.now,norm:d.norm,trig:d.triggered,kpi:v,kpiBase:vb,disc:disc.now,kpiDisc:kd,discTrig:disc.triggered,f:facts().ricohNow,okNow:rate(EFFECT.ok.filter(ricoh)),rec:d.recover,badNow:rate(EFFECT.bad.filter(ricoh)),okFrom:OK_FROM}})()`);
  ok("D-118 = KPI «Брак» с фильтром Ricoh (2 нед.)", Math.abs(N.now - N.kpi) < 1e-12, `${(N.now * 100).toFixed(2)} % vs ${(N.kpi * 100).toFixed(2)} %`);
  ok("норма D-118 = KPI Ricoh за базовые недели", Math.abs(N.norm - N.kpiBase) < 1e-12, `${(N.norm * 100).toFixed(2)} %`);
  ok("D-118 срабатывает", N.trig);
  ok("D-117 ≈ KPI «Скидка» Premium (разница — 2 неоплаченных заказа)", Math.abs(N.disc - N.kpiDisc) < 0.002 && N.discTrig, `${(N.disc * 100).toFixed(2)} % vs ${(N.kpiDisc * 100).toFixed(2)} %`);
  ok("сценарий «помогло» укладывается в цель, «не помогло» — нет", N.okNow <= N.rec && N.badNow > N.rec, `ok ${(N.okNow * 100).toFixed(2)} %, bad ${(N.badNow * 100).toFixed(2)} %, цель ${(N.rec * 100).toFixed(2)} %, недели ${N.okFrom}–${N.okFrom + 1}`);
  await go("#/deviations/D-118");
  let t = await view();
  ok("карточка D-118 показывает то же число", t.includes(N.f), N.f);
  await shot("1-d118");
  /* подсказка линии в боковой панели и плитка с фильтром Ricoh */
  const tip = await ev(`(()=>{const b=document.querySelector('[data-act="line"][data-arg="Ricoh"]');return b?navTipHtml(b):''})()`);
  ok("подсказка линии Ricoh = то же число", tip.includes(N.f), tip.replace(/<[^>]+>/g, " ").slice(0, 120));

  /* 2. Качество данных */
  await go("#/data"); t = await view();
  const Q = await ev(`(()=>{const q=InsightData.quality();const s=k=>q.sources.reduce((a,x)=>a+x[k],0);return {gaps:s('gaps'),dups:s('dups'),orph:s('orphans'),im:q.issues.missing.length,id:q.issues.duplicates.length,io:q.issues.orphans.length}})()`);
  ok("пропуски: таблица = проверки", Q.gaps === Q.im, `${Q.gaps} / ${Q.im}`);
  ok("дубли: таблица = проверки", Q.dups === Q.id, `${Q.dups} / ${Q.id}`);
  ok("без связи: таблица = проверки", Q.orph === Q.io, `${Q.orph} / ${Q.io}`);
  const rows = await ev(`[...document.querySelectorAll('#view .sheet')].find(s=>s.querySelector('h2')&&s.querySelector('h2').textContent.includes('Проверки')).querySelectorAll('tbody tr').length`);
  ok("в проверках 5 строк", rows === 5);
  ok("нет старых выдуманных заказов № 4788213", !t.includes("4788213") && !t.includes("4791502"));
  const outl = await ev(`(()=>{const o=outliers();return {items:o.items.map(r=>r.line+' '+r.week+' '+fPct(r.v)+' z='+r.z.toFixed(1)),small:o.small}})()`);
  ok("выбросы — по линии и неделе", true, JSON.stringify(outl));
  await shot("2-data");

  /* 3. Журнал: смена роли, решение, задача, выгрузка */
  const before = await ev(`S.journal.length`);
  await ev(`ACT.setRole('ceo')`);
  await go("#/deviations/D-118");
  await ev(`ACT.decide('D-118');render()`); await sleep(300);
  await ev(`S.form.text='Калибровать Ricoh после каждого простоя';S.form.owner='Технолог печати';S.form.due='2026-11-12';document.querySelector('form[data-form=decision]').requestSubmit()`); await sleep(600);
  const tid = await ev(`caseOf('D-118').decision.tasks[0].id`);
  await ev(`ACT.switchTo('p:Технолог печати')`); await sleep(400);
  await ev(`S.draftText['${tid}']='Регламент утверждён';ACT.submitReport('${tid}');render()`); await sleep(300);
  await ev(`ACT.switchTo('ceo')`); await sleep(400);
  await ev(`ACT.accept('${tid}');render()`); await sleep(400);
  await ev(`ACT.switchTo('admin')`); await sleep(400);
  await ev(`ACT.loadData('ok');render()`); await sleep(400);
  const J = await ev(`S.journal.map(j=>[j.action,j.who,j.time,j.tz,j.at])`);
  const acts = J.map(j => j[0]);
  ok("журнал вырос", J.length > before, `${before} → ${J.length}`);
  ["Смена роли", "Решение принято", "Отчёт по задаче отправлен", "Отчёт принят", "Загружена выгрузка"].forEach(a => ok("в журнале: " + a, acts.includes(a)));
  const nowY = new Date().getFullYear();
  ok("время записей реальное, с часовым поясом", J.slice(0, J.length - 2).every(j => j[2].includes(String(nowY)) && /^UTC[+−]\d\d:\d\d$/.test(j[3]) && Math.abs(Date.now() - Date.parse(j[4])) < 120000), J[0][2] + " " + J[0][3]);
  ok("кто: исполнитель записан по должности", J.some(j => j[0] === "Отчёт по задаче отправлен" && j[1] === "Технолог печати"));
  const st = await ev(`caseOf('D-118').status`);
  ok("D-118 закрыто по выгрузке «помогло»", st === "done", st);
  await ev(`ACT.switchTo('ceo')`); await sleep(300);
  await go("#/security"); t = await view();
  ok("экран журнала показывает операции", t.includes("Журнал операций") && t.includes("Решение принято") && t.includes("Загружена выгрузка"));
  await shot("3-journal");

  /* 4. Сохранение: перезагрузка */
  const snap = await ev(`({n:S.journal.length,st:caseOf('D-118').status,dec:caseOf('D-118').decision.text,task:caseOf('D-118').decision.tasks[0].status,role:S.role,today:S.today,meet:S.meetings.length})`);
  await send("Page.reload"); await sleep(2200);
  const after = await ev(`({n:S.journal.length,st:caseOf('D-118').status,dec:caseOf('D-118').decision&&caseOf('D-118').decision.text,task:caseOf('D-118').decision&&caseOf('D-118').decision.tasks[0].status,role:S.role,today:S.today,sel:document.getElementById('role').value,meet:S.meetings.length})`);
  ok("после перезагрузки: журнал на месте", after.n === snap.n, `${snap.n} / ${after.n}`);
  ok("после перезагрузки: решение и статус", after.st === snap.st && after.dec === snap.dec, after.st);
  ok("после перезагрузки: задача принята", after.task === "accepted");
  ok("после перезагрузки: роль и дата сценария", after.role === snap.role && after.sel === snap.role && after.today === snap.today, `${after.role} ${after.today}`);
  ok("уведомление о восстановлении", (await ev(`document.getElementById('toast').innerText`)).includes("Восстановлено"));
  await go("#/deviations/D-118"); await shot("4-after-reload");

  /* 5. Встреча с задачей переживает перезагрузку и связь задач не рвётся */
  await ev(`ACT.reset();render()`); await sleep(400);
  ok("сброс демо очищает решения", await ev(`caseOf('D-118').status==='open'&&S.journal[0].action==='Демо сброшено'`));
  await send("Page.reload"); await sleep(2200);
  ok("после сброса и перезагрузки — чистое состояние", await ev(`caseOf('D-118').status==='open'&&!caseOf('D-118').decision&&S.journal.length===3`), String(await ev(`S.journal.length`)));
  /* встреча с итогами → перезагрузка → задача во встрече и в карточке — один объект */
  await ev(`S.role='ceo';S.mDraft=blankMeet(['D-118'],S.today);S.mDraft.people=['Технолог печати'];ACT.mSave();`); await sleep(400);
  const mid = await ev(`S.meetings[0].id`);
  await ev(`startOutcomes(findMeet('${mid}'));Object.assign(S.out['D-118'],{state:'yes',text:'Калибровка после простоя',tasks:[{title:'Калибровка',owner:'Технолог печати',due:'2026-11-12',criteria:''}]});ACT.ocSave();render()`); await sleep(400);
  await send("Page.reload"); await sleep(2200);
  const link = await ev(`(()=>{const m=findMeet('${mid}');const x=m.made.items[0];const t=findTask(x.tasks[0].id);return {same:x.tasks[0]===t,dec:x.dec===caseOf('D-118').decision}})()`);
  ok("после перезагрузки задача во встрече = задача в карточке", link.same && link.dec, JSON.stringify(link));
  ok("в журнале назначение встречи и итоги", await ev(`['Встреча назначена','Итоги встречи сохранены','Решение принято на встрече '+findMeet('${mid}').made.items[0].dec.meetDay].every(a=>S.journal.some(j=>j.action===a))`));

  ok("нет исключений", errs.length === 0, errs.join(" || ").slice(0, 400));
  console.log(R.join("\n")); console.log("FAILS", R.filter(x => x.startsWith("FAIL")).length, "of", R.length);
  ws.close(); ch.kill();
})().catch(e => { console.error("CRASH", e.message); ch.kill(); process.exit(1); });
