// Этап 7: D-119 из HR-слоя (= KPI «Обеспеченность»), экран ошибки данных (?fail=network, ?fail=format) и «Повторить» без потери сохранённого.
// Запуск: node cdp27.js <папка для скриншотов>. Отдельно или через node run-all.js
const { spawn } = require("child_process"); const fs = require("fs"), path = require("path");
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const BASEURL = require("./env").page("glass.html");
const ch = spawn(require("./env").chrome(), ["--headless=new", "--remote-debugging-port=9963", "--no-first-run", "--window-size=1440,1000", "--user-data-dir=" + path.join(OUT, "prof"), "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let tgt; for (let i = 0; i < 40 && !tgt; i++) { await sleep(300); try { const l = await (await fetch("http://127.0.0.1:9963/json")).json(); tgt = l.find(t => t.type === "page"); } catch { } }
  const ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r); let id = 0; const pend = {}; let errs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } if (d.method === "Runtime.exceptionThrown") errs.push(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text); };
  const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(e.slice(0, 140) + " :: " + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description)); return r.result.result.value; };
  const shot = async n => { await sleep(300); const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(OUT, n + ".png"), Buffer.from(r.result.data, "base64")); };
  const R = []; const ok = (n, c, x = "") => R.push((c ? "PASS " : "FAIL ") + n + (x !== "" ? " | " + x : ""));
  const nav = async (u, wait = 2000) => { await send("Page.navigate", { url: u }); await sleep(wait); };
  const view = () => ev(`document.getElementById('view').innerText`);
  await send("Runtime.enable"); await send("Page.enable");

  /* 1. D-119 = KPI «Обеспеченность персоналом» */
  await nav(BASEURL + "#/overview");
  const N = await ev(`(()=>{const d=staffingDeviation(),k=kpiById('staffing');return {now:d.now,norm:d.norm,usual:d.usual,trig:d.triggered,kpi:k.calc(R.current[0],R.current[1]),kNorm:k.norm.v,kAbs:kpiById('absence').calc(R.current[0],R.current[1]),link:KPI_ALL.find(x=>x.id==='staffing').link}})()`);
  ok("D-119 = KPI «Обеспеченность» за те же 2 недели", Math.abs(N.now - N.kpi) < 1e-12, `${(N.now * 100).toFixed(2)} % / ${(N.kpi * 100).toFixed(2)} %`);
  ok("норма D-119 = норма паспорта KPI", N.norm === N.kNorm, String(N.norm));
  ok("D-119 срабатывает (ниже нормы)", N.trig, `обычно ${(N.usual * 100).toFixed(1)} %`);
  ok("плитка «Обеспеченность» ведёт в D-119", N.link === "#/deviations/D-119");
  await ev(`location.hash='#/deviations/D-119'`); await sleep(600);
  let t = await view();
  const nowTxt = await ev(`fPct(staffingDeviation().now)`), absTxt = await ev(`fPct(kpiById('absence').calc(R.current[0],R.current[1]))`);
  ok("карточка D-119: то же число и норма 90 %", t.includes(nowTxt) && t.includes("90,0 %"), nowTxt);
  ok("карточка D-119: причина из данных, не заглушка", t.includes("ночные смены печати и переплёта") && !t.includes("причина уточняется"));
  ok("отсутствие в причине = KPI «Отсутствие»", t.includes(absTxt), absTxt);
  ok("в карточке нет «Укомплектованность»", !/Укомплектованн/.test(t));
  await shot("1-d119");
  await ev(`location.hash='#/deviations/D-118'`); await sleep(600);
  t = await view();
  ok("D-118: нет «переработки» из выдуманных данных", !/[Пп]ереработк/.test(t));
  /* задача D-119 до решения: сохраним состояние, чтобы проверить, что сбой его не стирает */
  await ev(`S.role='ceo';ACT.decide('D-119');render()`); await sleep(300);
  await ev(`location.hash='#/deviations/D-119'`); await sleep(500);
  await ev(`ACT.decide('D-119');render()`); await sleep(300);
  await ev(`S.formFor='D-119';S.form.text='Перераспределить людей в ночные смены';S.form.owner='Руководитель смен';S.form.due='2026-11-16';document.querySelector('form[data-form=decision]').requestSubmit()`); await sleep(600);
  const savedStatus = await ev(`caseOf('D-119').status`);
  ok("решение по D-119 принято", savedStatus === "work", savedStatus);

  /* 2. Сбой сети: экран ошибки, а не белая страница */
  errs = [];
  await nav(BASEURL + "?fail=network#/overview", 1500);
  t = await view();
  ok("сбой сети: понятный заголовок", t.includes("Не удалось загрузить данные"));
  ok("сбой сети: есть «Повторить»", await ev(`!!document.getElementById('data-retry')`));
  ok("сбой сети: сказано, что сохранённое не потеряно", t.includes("не потеряны"));
  ok("фокус на заголовке ошибки", await ev(`document.activeElement&&document.activeElement.tagName==='H1'`));
  ok("остановка — одна понятная ошибка в консоли", errs.length === 1 && /данные не загружены/.test(errs[0]), errs.join(" || ").slice(0, 200));
  await shot("2-network");
  /* «Повторить» */
  await ev(`document.getElementById('data-retry').click()`); await sleep(2200);
  const url = await ev(`location.href`);
  ok("«Повторить» снимает сбой и грузит данные", !url.includes("fail=") && await ev(`!InsightData.error()&&typeof S==='object'`), url.split("/").pop());
  ok("после сбоя решение D-119 на месте", await ev(`caseOf('D-119').status`) === "work");

  /* 3. Битые данные */
  errs = [];
  await nav(BASEURL + "?fail=format#/overview", 1500);
  t = await view();
  ok("битые данные: понятный заголовок и причина", t.includes("неверном формате") && t.includes("«orders»"), t.slice(0, 160).replace(/\n/g, " "));
  await shot("3-format");
  await ev(`document.getElementById('data-retry').click()`); await sleep(2200);
  ok("после «Повторить» дашборд работает", await ev(`!!document.querySelector('#view .pulse')`) || (await view()).length > 200);

  /* 4. Обычный запуск без ошибок */
  errs = [];
  await nav(BASEURL + "#/overview", 2000);
  ok("обычный запуск без исключений", errs.length === 0, errs.join(" || ").slice(0, 300));

  console.log(R.join("\n")); console.log("FAILS", R.filter(x => x.startsWith("FAIL")).length, "of", R.length);
  ws.close(); ch.kill();
})().catch(e => { console.error("CRASH", e.message); ch.kill(); process.exit(1); });
