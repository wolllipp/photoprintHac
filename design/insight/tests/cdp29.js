// Этап 9: сценарий аналитика (устаревший источник, разложение сверки 1С и ERP), защита на клиенте
// (подменённое состояние в localStorage не исполняет код, setPath не пишет в прототипы) и шрифты без сети.
// Запуск: node cdp29.js <папка для скриншотов>. Отдельно или через node run-all.js
const { spawn } = require("child_process"); const fs = require("fs"), path = require("path");
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const URLF = require("./env").page("glass.html");
const ch = spawn(require("./env").chrome(), ["--headless=new", "--remote-debugging-port=9985", "--no-first-run", "--window-size=1440,1000", "--user-data-dir=" + path.join(OUT, "prof29"), "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let tgt; for (let i = 0; i < 40 && !tgt; i++) { await sleep(300); try { const l = await (await fetch("http://127.0.0.1:9985/json")).json(); tgt = l.find(t => t.type === "page"); } catch { } }
  const ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r); let id = 0; const pend = {}, errs = [], reqs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; }
    if (d.method === "Runtime.exceptionThrown") errs.push(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text);
    if (d.method === "Network.requestWillBeSent") reqs.push(d.params.request.url); };
  const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(e.slice(0, 140) + " :: " + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description)); return r.result.result.value; };
  const shot = async n => { await sleep(300); const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(OUT, n + ".png"), Buffer.from(r.result.data, "base64")); };
  const R = []; const ok = (n, c, x = "") => R.push((c ? "PASS " : "FAIL ") + n + (x !== "" ? " | " + x : ""));
  const go = async h => { await ev(`location.hash=${JSON.stringify(h)}`); await sleep(900); };
  const view = () => ev(`document.getElementById('view').innerText`);
  await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
  await send("Page.navigate", { url: URLF + "#/overview" }); await sleep(2200);
  await ev(`localStorage.removeItem('picpac-insight-state-v1');document.body.classList.add('bar-hidden');ACT.setRole('ceo');render()`); await sleep(400);

  /* 1. Сценарий аналитика: устаревший источник */
  const Q = await ev(`(()=>{const q=InsightData.quality();return {stale:q.sources.filter(s=>!s.fresh).map(s=>s.id),fresh:q.sources.filter(s=>s.fresh).length,recon:q.recon}})()`);
  ok("устарел ровно один источник — приложение", Q.stale.length === 1 && Q.stale[0] === "app", Q.stale.join(","));
  await go("#/data"); let t = await view();
  ok("«Качество данных»: предупреждение об устаревшем источнике", t.includes("Источник устарел") && t.includes("Приложение: 12 часов без выгрузки"));
  ok("«Качество данных»: названы показатели на этом источнике", t.includes("«Конверсия приложения»"));
  ok("в таблице источников: 5 свежих и 1 устаревший", Q.fresh === 5 && (t.match(/устарели/g) || []).length >= 1);
  await shot("29a-data");
  await go("#/sales"); await sleep(600);
  const tags = await ev(`[...document.querySelectorAll('#view .kpi-tile')].map(e=>({l:e.querySelector('.lg-label').innerText,stale:!!e.querySelector('.kpi-scope.stale')}))`);
  ok("метка «данные от …» только на плитке конверсии", tags.filter(x => x.stale).map(x => x.l).join() === "Конверсия приложения", JSON.stringify(tags.filter(x => x.stale)));
  await go("#/overview"); await sleep(600);
  ok("в «Все показатели» у конверсии та же метка", await ev(`[...document.querySelectorAll('#view .kpi-table tbody tr')].some(r=>r.innerText.includes('Конверсия приложения')&&!!r.querySelector('.kpi-scope.stale'))`));

  /* 2. Сверка 1С и ERP разложена без остатка */
  const P = Q.recon.parts;
  ok("сверка: дубли + неоплаченные + остаток = расхождение", Math.abs(P.dups + P.unpaid + P.rest - Q.recon.diff) < 1e-12, `${(Q.recon.diff * 100).toFixed(4)} % = ${(P.dups * 100).toFixed(4)} + ${(P.unpaid * 100).toFixed(4)} + ${(P.rest * 100).toFixed(4)}`);
  ok("сверка: остаток меньше копейки, расхождение объяснено", Q.recon.explained && Math.abs(P.restRub) < 0.01, String(P.restRub));
  await go("#/data"); t = await view();
  ok("сверка показана по частям на экране", t.includes("Из чего складывается") && t.includes("Расхождение объяснено полностью"));

  /* 3. Подменённое состояние в localStorage не исполняет код */
  await ev(`(()=>{const k='picpac-insight-state-v1',st=JSON.parse(localStorage.getItem(k));const X='<img src=x onerror="window.__pwn=1">';
    st.S.notices.push({role:'ceo',text:X,href:'javascript:window.__pwn=2',read:false},{role:'ceo',text:'ok',href:'#/x" onmouseover="window.__pwn=3',read:false});
    st.S.meetings.push({id:'M-90',title:X,date:st.S.today,time:'10:00',people:['Технолог печати'],devs:[],topics:['<script>window.__pwn=4<\/script>'],status:'planned',made:null});
    st.S.chat.push({who:'me',text:X});st.S.journal.unshift({time:'1',who:X,action:X,object:X,result:X,kind:'ok'});
    localStorage.setItem(k,JSON.stringify(st))})()`);
  await send("Page.reload"); await sleep(2200);
  for (const h of ["#/overview", "#/meetings", "#/meetings/M-90", "#/assistant", "#/security"]) { await go(h); }
  await go("#/overview"); await ev(`document.querySelector('.bell-menu').open=true`); await sleep(300);
  const sec = await ev(`({pwn:window.__pwn,imgs:document.querySelectorAll('img[src="x"]').length,scripts:[...document.querySelectorAll('#view script, #top script')].length,hrefs:[...document.querySelectorAll('.bell-menu a')].map(a=>a.getAttribute('href'))})`);
  ok("вредные строки из localStorage не исполнились", sec.pwn === undefined, String(sec.pwn));
  ok("теги из состояния выведены текстом, а не разметкой", sec.imgs === 0 && sec.scripts === 0);
  ok("ссылки уведомлений — только внутренние #/…", sec.hrefs.length > 0 && sec.hrefs.every(h => /^#\//.test(h) && !/["<>]/.test(h)), sec.hrefs.slice(-2).join(" "));
  await ev(`localStorage.removeItem('picpac-insight-state-v1')`);

  /* 4. setPath не пишет в прототипы и не создаёт новые ветки состояния */
  const sp = await ev(`({proto:setPath('__proto__.polluted','1'),ctor:setPath('constructor.prototype.polluted','1'),newBranch:setPath('nope.x','1'),polluted:({}).polluted,formOk:setPath('form.text','проверка'),form:S.form.text})`);
  ok("setPath: __proto__ и constructor запрещены", sp.proto === false && sp.ctor === false && sp.polluted === undefined);
  ok("setPath: новую ветку не создать, обычное поле пишется", sp.newBranch === false && sp.formOk === true && sp.form === "проверка");

  /* 5. Шрифты из проекта, без сети и без внешних запросов */
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  reqs.length = 0; await send("Page.reload"); await sleep(2500);
  const fonts = await ev(`(async()=>{await document.fonts.ready;return ['Manrope','Unbounded'].every(f=>document.fonts.check('600 16px "'+f+'"','Привет Insight'))})()`);
  const external = reqs.filter(u => !/^(file|data|blob):/.test(u));
  ok("без сети: Manrope и Unbounded загружены из fonts/", fonts);
  ok("внешних запросов нет", external.length === 0, external.slice(0, 3).join(" "));
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  ok("нет исключений", errs.length === 0, errs.join(" || ").slice(0, 400));
  console.log(R.join("\n")); console.log("FAILS", R.filter(x => x.startsWith("FAIL")).length, "of", R.length);
  ws.close(); ch.kill();
})().catch(e => { console.error("CRASH", e.message); ch.kill(); process.exit(1); });
