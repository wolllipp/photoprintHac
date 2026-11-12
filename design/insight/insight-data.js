"use strict";
/* Слой доступа к данным picPac Insight. Экраны читают данные только отсюда, а не из фикстур напрямую.
   Сейчас источник — синтетический снимок window.INSIGHT_DATA (data/generate.mjs). Позже load() заберёт тот же снимок
   с сервера (GET /api/insight/snapshot, notes/26-insight-data-contract.md), и сервер отдаст только то, что разрешено роли.
   Экраны при этом не меняются: форма данных та же.
   Числа считает код по формулам паспортов KPI (notes/18, «Решения для дашборда»). Модель только пересказывает. */
const InsightData = (() => {
  const DAY = 864e5;
  let RAW = null, D = null;

  /* ---------- Загрузка и разбор снимка ---------- */
  const table = t => t.rows.map(r => { const o = {}; t.cols.forEach((c, i) => o[c] = r[i]); return o; });
  function decode(raw) {
    const start = Date.parse(raw.meta.start + "T00:00:00Z");
    const days = Math.round((Date.parse(raw.meta.end + "T00:00:00Z") - start) / DAY) + 1;
    const ordersRaw = table(raw.orders), seen = new Set(), orders = [];
    for (const o of ordersRaw) { if (seen.has(o.order_id)) continue; seen.add(o.order_id); orders.push(o); } // дубли ERP в расчёт KPI не идут
    const byOrder = new Map(orders.map(o => [o.order_id, o]));
    const customersRaw = table(raw.customers), customerIds = new Set(customersRaw.map(c => c.customer_id));
    const productLine = raw.dicts.products.map((_, p) => { const o = orders.find(x => x.product === p); return o ? o.line : -1; }); // какая линия печатает продукт
    return { meta: raw.meta, dicts: raw.dicts, start, days, ordersRaw, orders, byOrder, customersRaw, customerIds, productLine,
      payments: table(raw.payments), plan: table(raw.plan), lines: table(raw.lines), hr: table(raw.hr), tickets: table(raw.tickets), app: table(raw.app) };
  }
  /* ---------- Проверка снимка (ОТ-05): лучше понятная ошибка, чем неверные цифры ---------- */
  // kind: "network" — данные не дошли, "format" — пришли, но не в том виде. Экран ошибки показывает text, техническая причина — в detail
  const dataError = (kind, detail) => Object.assign(new Error(detail), { kind, detail,
    title: kind === "network" ? "Не удалось загрузить данные" : "Данные пришли в неверном формате",
    text: kind === "network" ? "Источник данных не ответил. Проверьте соединение и повторите загрузку."
      : "Показатели не считаются, чтобы не показать неверные цифры. Повторите загрузку или сообщите администратору." });
  const TABLES = { customers: ["customer_id", "first_day", "channel"], orders: ["order_id", "customer_id", "day", "hour", "product", "line", "shift", "units", "defects", "ship_day", "promise_day"],
    payments: ["order_id", "day", "net", "discount", "cost"], plan: ["day", "product", "plan_net"], lines: ["day", "line", "shift", "capacity", "output", "downtime_h"],
    hr: ["day", "dept", "shift", "needed", "scheduled", "absent"], tickets: ["ticket_id", "order_id", "day", "topic", "sla_min", "resolve_min"], app: ["day", "started", "ordered"] };
  function validate(raw) {
    if (!raw) throw dataError("network", "Файл data/synthetic.js не загрузился (window.INSIGHT_DATA нет)");
    if (!raw.meta || !raw.dicts) throw dataError("format", "В снимке нет разделов meta или dicts");
    if (isNaN(Date.parse(raw.meta.start + "T00:00:00Z")) || isNaN(Date.parse(raw.meta.end + "T00:00:00Z"))) throw dataError("format", "В meta нет корректных дат start и end");
    Object.entries(TABLES).forEach(([name, cols]) => {
      const t = raw[name];
      if (!t || !Array.isArray(t.cols) || !Array.isArray(t.rows)) throw dataError("format", `В снимке нет таблицы «${name}»`);
      const miss = cols.filter(c => !t.cols.includes(c));
      if (miss.length) throw dataError("format", `В таблице «${name}» нет полей: ${miss.join(", ")}`);
      const bad = t.rows.findIndex(r => !Array.isArray(r) || r.length !== t.cols.length);
      if (bad >= 0) throw dataError("format", `В таблице «${name}» строка ${bad + 1} не совпадает со списком полей`);
    });
  }
  /* Демо сбоя для приёмочного теста «одна ошибка»: ?fail=network — данные не дошли, ?fail=format — пришла таблица без заказов.
     Сбой изображает только загрузку; «Повторить» снимает параметр, как если бы связь восстановилась */
  function demoFailure(raw) {
    let f = null; try { f = new URLSearchParams(location.search).get("fail"); } catch (e) { f = null; }
    if (f === "network") return null;
    if (f === "format" && raw) { const copy = { ...raw }; delete copy.orders; return copy; }
    return raw;
  }
  /* Синхронно, чтобы макет рисовался сразу; load() — точка, куда встанет запрос к серверу */
  function boot() { if (!D) { RAW = demoFailure(window.INSIGHT_DATA); validate(RAW); D = decode(RAW); build(); } }
  const load = () => { try { boot(); return Promise.resolve(); } catch (e) { return Promise.reject(e); } };
  let ERR = null;
  const error = () => ERR;
  /* Экран ошибки рисует слой данных: экраны Insight без данных не запускаются, поэтому иначе была бы белая страница.
     Сохранённые в браузере решения, задачи и журнал не трогаются */
  function showError(e) {
    const view = document.getElementById("view"); if (!view) return;
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    view.innerHTML = `<section class="state" role="alert"><h1 tabindex="-1">${esc(e.title || "Не удалось загрузить данные")}</h1>
      <p>${esc(e.text || "Повторите загрузку.")}</p><p class="muted small">Решения, задачи и журнал, сохранённые в этом браузере, не потеряны.</p>
      <p class="muted small">Причина: ${esc(e.detail || e.message)}</p><button class="btn btn-primary" type="button" id="data-retry">Повторить</button></section>`;
    document.title = "Ошибка данных · picPac Insight";
    document.getElementById("data-retry").addEventListener("click", () => {
      const u = new URL(location.href); u.searchParams.delete("fail");
      if (u.href === location.href) location.reload(); else location.replace(u.href);
    });
    view.querySelector("h1").focus();
  }
  function start() {
    try { boot(); }
    catch (e) { ERR = e.kind ? e : dataError("format", e.message); D = null; showError(ERR); console.error("Insight: данные не загружены —", ERR.detail); }
  }

  /* ---------- Дни ---------- */
  const dayOf = date => Math.round((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - D.start) / DAY);
  const isoOf = d => new Date(D.start + d * DAY).toISOString().slice(0, 10);
  const clampRange = (d0, d1) => [Math.max(0, d0), Math.min(D.days - 1, d1)];

  /* ---------- Предрасчёт по дням: суммы за любой период берутся из префиксных сумм ---------- */
  // Каждая сумма хранится целиком и по срезам (продукт, линия или подразделение штата), поэтому фильтр
  // складывает готовые срезы, а не пересчитывает заказы. Срез −1 — запись без среза (например, обращение без заказа).
  const P = {};
  const cum = a => { const p = new Float64Array(a.length + 1); for (let i = 0; i < a.length; i++) p[i + 1] = p[i] + a[i]; return p; };
  function prefix(name, fill, slices = 0) {
    const all = new Float64Array(D.days), parts = Array.from({ length: slices }, () => new Float64Array(D.days));
    fill((day, slice, v = 1) => { if (day < 0 || day >= D.days) return; all[day] += v; if (slice >= 0 && slice < slices) parts[slice][day] += v; });
    P[name] = { all: cum(all), parts: parts.map(cum) };
  }
  const S = (name, d0, d1, slices) => {
    [d0, d1] = clampRange(d0, d1); if (d1 < d0) return 0;
    const at = p => p[d1 + 1] - p[d0], X = P[name];
    return slices && X.parts.length ? slices.reduce((s, i) => s + at(X.parts[i]), 0) : at(X.all);
  };
  let leadByDay = [], ordersOfCustomer = new Map(), firstDay = new Map();
  function build() {
    const last = D.days - 1, isBook = D.dicts.isBook, NP = D.dicts.products.length, NL = D.dicts.lines.length, NH = D.dicts.hrDepts.length;
    const prod = D.orders.filter(o => o.ship_day <= last), productOf = id => { const o = D.byOrder.get(id); return o ? o.product : -1; };
    prefix("orders", add => D.orders.forEach(o => add(o.day, o.product)), NP);
    prefix("done", add => prod.forEach(o => add(o.day, o.product)), NP);
    prefix("ontime", add => prod.forEach(o => { if (o.ship_day <= o.promise_day) add(o.day, o.product); }), NP);
    prefix("amOrders", add => prod.forEach(o => { if (o.hour < 12) add(o.day, o.product); }), NP);
    prefix("sameDay", add => prod.forEach(o => { if (o.hour < 12 && o.ship_day === o.day) add(o.day, o.product); }), NP);
    prefix("modq", add => D.orders.forEach(o => { if (o.moderation_min > 120) add(o.day, o.product); }), NP);
    prefix("bookUnits", add => prod.forEach(o => { if (isBook[o.product]) add(o.ship_day, o.product, o.units); }), NP);
    prefix("bookDefects", add => prod.forEach(o => { if (isBook[o.product]) add(o.ship_day, o.product, o.defects); }), NP);
    prefix("printUnits", add => prod.forEach(o => { if (!isBook[o.product]) add(o.ship_day, o.product, o.units); }), NP);
    prefix("printDefects", add => prod.forEach(o => { if (!isBook[o.product]) add(o.ship_day, o.product, o.defects); }), NP);
    prefix("net", add => D.payments.forEach(p => add(p.day, productOf(p.order_id), p.net)), NP);
    prefix("discount", add => D.payments.forEach(p => add(p.day, productOf(p.order_id), p.discount)), NP);
    prefix("cost", add => D.payments.forEach(p => add(p.day, productOf(p.order_id), p.cost)), NP);
    prefix("paid", add => D.payments.forEach(p => add(p.day, productOf(p.order_id))), NP);
    prefix("plan", add => D.plan.forEach(p => add(p.day, p.product, p.plan_net)), NP);
    prefix("capacity", add => D.lines.forEach(l => add(l.day, l.line, l.capacity)), NL);
    prefix("output", add => D.lines.forEach(l => add(l.day, l.line, l.output)), NL);
    prefix("downtime", add => D.lines.forEach(l => add(l.day, l.line, l.downtime_h)), NL);
    prefix("lineHours", add => D.lines.forEach(l => add(l.day, l.line, 12)), NL);
    prefix("needed", add => D.hr.forEach(h => add(h.day, h.dept, h.needed)), NH);
    prefix("present", add => D.hr.forEach(h => add(h.day, h.dept, h.scheduled - h.absent)), NH);
    prefix("scheduled", add => D.hr.forEach(h => add(h.day, h.dept, h.scheduled)), NH);
    prefix("absent", add => D.hr.forEach(h => add(h.day, h.dept, h.absent)), NH);
    prefix("tickets", add => D.tickets.forEach(t => add(t.day, t.order_id ? productOf(t.order_id) : -1)), NP);
    prefix("inSla", add => D.tickets.forEach(t => { if (t.resolve_min <= t.sla_min) add(t.day, t.order_id ? productOf(t.order_id) : -1); }), NP);
    prefix("started", add => D.app.forEach(r => add(r.day, -1, r.started)));
    prefix("appOrders", add => D.app.forEach(r => add(r.day, -1, r.ordered)));
    leadByDay = Array.from({ length: D.days }, () => []);
    prod.forEach(o => leadByDay[o.day].push([o.product, (o.ship_day - o.day) * 24 + o.ship_hour - o.hour]));
    ordersOfCustomer = new Map(); firstDay = new Map();
    D.customersRaw.forEach(c => { if (!firstDay.has(c.customer_id) || c.first_day < firstDay.get(c.customer_id)) firstDay.set(c.customer_id, c.first_day); });
    D.orders.forEach(o => { if (!ordersOfCustomer.has(o.customer_id)) ordersOfCustomer.set(o.customer_id, []); ordersOfCustomer.get(o.customer_id).push(o.day); });
    prefix("newCustomers", add => firstDay.forEach(fd => add(fd, -1)));
  }
  const div = (a, b) => b ? a / b : null;
  const median = arr => { if (!arr.length) return null; const s = arr.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const daysIn = (d0, d1) => { [d0, d1] = clampRange(d0, d1); return Math.max(0, d1 - d0 + 1); };
  const customersAt = d1 => { let active = 0, repeat = 0; ordersOfCustomer.forEach(days => { const n = days.filter(x => x > d1 - 365 && x <= d1).length; if (n) active++; if (n >= 2) repeat++; }); return { active, repeat }; };

  /* ---------- Форматы (ОТ-07: деньги с валютой, проценты, часы) ---------- */
  const NF0 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }), NF1 = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmt = {
    pct: v => v == null ? "—" : NF1.format(v * 100) + " %", pctShort: v => v == null ? "—" : NF1.format(v * 100) + "%",
    hours: v => v == null ? "—" : NF1.format(v) + " ч", money: v => v == null ? "—" : NF1.format(v) + " руб.",
    int: v => v == null ? "—" : NF0.format(v), perDay: v => v == null ? "—" : NF1.format(v) + " в день",
  };

  /* ---------- Подразделения (notes/18, «Решения для дашборда», п. 3) ---------- */
  const DEPTS = [
    { id: "prod", name: "Производство", head: "Начальник производства" },
    { id: "sales", name: "Продажи и маркетинг", head: "Руководитель продаж" },
    { id: "support", name: "Поддержка", head: "Руководитель поддержки" },
    { id: "fin", name: "Финансы", head: "Финансовый директор" },
    { id: "hr", name: "Персонал", head: "HR-директор" },
  ];

  /* ---------- Источники (УП-01): 5 систем из ТЗ + приложение (трек 2) ---------- */
  const NOW = Date.parse("2026-11-09T09:00:00+03:00"); // «сейчас» в демо
  const SOURCES = [
    { id: "crm", name: "CRM · Битрикс24", short: "CRM", icon: "users", about: "Клиенты, канал, повод. Отсюда новые, активные и повторные клиенты.", entity: "customers", keys: ["customer_id"], cadence: "ежедневно в 06:00", cadenceMin: 1440, lastLoad: "2026-11-09T06:00:00+03:00" },
    { id: "support", name: "Поддержка · омниканал", short: "Поддержка", icon: "chat", about: "Обращения: тема, канал, SLA. Отсюда SLA поддержки.", entity: "tickets", keys: ["ticket_id", "customer_id", "order_id"], cadence: "каждый час", cadenceMin: 60, lastLoad: "2026-11-09T08:00:00+03:00" },
    { id: "erp", name: "ERP · производство", short: "ERP", icon: "box", about: "Заказы, линии, смены, брак, отгрузка. Отсюда сроки, брак и загрузка.", entity: "orders, lines", keys: ["order_id", "customer_id", "line_id", "shift_id"], cadence: "каждые 15 минут", cadenceMin: 15, lastLoad: "2026-11-09T08:45:00+03:00" },
    { id: "ledger", name: "1С · финансы", short: "1С", icon: "ledger", about: "Оплаты, скидки, себестоимость, план. Отсюда оборот, маржа и скидка.", entity: "payments, plan", keys: ["order_id"], cadence: "ежедневно в 06:00", cadenceMin: 1440, lastLoad: "2026-11-09T06:00:00+03:00" },
    { id: "hr", name: "HR · персонал", short: "HR", icon: "team", about: "Штат по плану, вакансии, отсутствие, без ФИО. Отсюда обеспеченность персоналом.", entity: "hr", keys: ["shift_id", "dept_id"], cadence: "каждую смену, 08:00 и 20:00", cadenceMin: 720, lastLoad: "2026-11-09T08:00:00+03:00" },
    { id: "app", name: "Приложение picPac", short: "Приложение", icon: "phone", about: "Начатые проекты и заказы из приложения. Отсюда конверсия.", entity: "app", keys: ["customer_id", "order_id"], cadence: "каждый час", cadenceMin: 60, lastLoad: "2026-11-09T08:00:00+03:00" },
  ];
  const srcName = id => SOURCES.find(s => s.id === id).short;
  const freshness = s => { const age = (NOW - Date.parse(s.lastLoad)) / 60000; return { ageMin: age, fresh: age <= s.cadenceMin * 2 }; };

  /* ---------- Паспорта KPI (УП-02): 17 показателей, формула, источник, обновление, норма ---------- */
  // norm: min — не ниже, max — не выше, range — коридор, growth — рост к прошлому периоду, none — норма не задана.
  // Цвет (notes/18 п. 3): в норме — хорошо; до 20% хуже нормы — внимание; хуже — плохо.
  // visibleTo: кто кроме директора видит показатель (null — все). Применяется в этапе 2 (роли и подразделения).
  const K = [
    { id: "ontime", dept: "prod", dim: "product", label: "Заказы в срок", short: "В срок", fmt: fmt.pct, pp: true, up: true, formula: "Отгружено не позже обещанного дня / все отгруженные заказы", sources: ["erp"], cadence: "каждый час", norm: { type: "min", v: 0.95 }, normText: "≥ 95 %",
      calc: (a, b, o = {}) => div(S("ontime", a, b, o.products), S("done", a, b, o.products)) },
    { id: "sameday", dept: "prod", dim: "product", label: "Изготовлено в день заказа", short: "В день заказа", fmt: fmt.pct, pp: true, up: true, formula: "Оплачено до 12:00 и передано в доставку в тот же день / все заказы, оплаченные до 12:00", sources: ["erp"], cadence: "каждый час", norm: { type: "min", v: 0.95 }, normText: "≥ 95 %", normNote: "у заказчика 97 % в пик",
      calc: (a, b, o = {}) => div(S("sameDay", a, b, o.products), S("amOrders", a, b, o.products)) },
    { id: "lead", dept: "prod", dim: "product", label: "Lead time", short: "Lead time", fmt: fmt.hours, up: false, formula: "Медиана (отгрузка − оплата), часы", sources: ["erp"], cadence: "каждый час", norm: { type: "max", v: 24 }, normText: "≤ 24 ч", normNote: "«работа в один день»",
      calc: (a, b, o = {}) => { [a, b] = clampRange(a, b); const all = []; for (let d = a; d <= b; d++) for (const [p, h] of leadByDay[d]) if (!o.products || o.products.includes(p)) all.push(h); return median(all); } },
    { id: "defect", dept: "prod", dim: "product", label: "Брак / перепечатка", short: "Брак", fmt: fmt.pct, pp: true, up: false, formula: "Бракованные единицы / выпущенные (книги и печать отдельно)", sources: ["erp"], cadence: "каждую смену", norm: { type: "split" }, normText: "книги ≤ 2 %, печать ≤ 1 %",
      calc: (a, b, o = {}) => div(S("bookDefects", a, b, o.products) + S("printDefects", a, b, o.products), S("bookUnits", a, b, o.products) + S("printUnits", a, b, o.products)),
      parts: (a, b, o = {}) => ({ books: div(S("bookDefects", a, b, o.products), S("bookUnits", a, b, o.products)), prints: div(S("printDefects", a, b, o.products), S("printUnits", a, b, o.products)) }),
      detail: (a, b, k, o = {}) => { const p = k.parts(a, b, o); return `книги ${fmt.pct(p.books)} · печать ${fmt.pct(p.prints)}`; } },
    { id: "load", dept: "prod", dim: "line", label: "Загрузка мощности", short: "Загрузка", fmt: fmt.pct, pp: true, up: true, formula: "Выпуск за смену / паспортная мощность линий в смену", sources: ["erp"], cadence: "каждую смену", norm: { type: "range", v: [0.6, 0.9] }, normText: "60–90 %",
      calc: (a, b, o = {}) => div(S("output", a, b, o.lines), S("capacity", a, b, o.lines)) },
    { id: "downtime", dept: "prod", dim: "line", label: "Простои линий", short: "Простои", fmt: fmt.pct, pp: true, up: false, formula: "Часы простоя линий / плановые часы работы линий", sources: ["erp"], cadence: "каждую смену", norm: { type: "max", v: 0.02 }, normText: "≤ 2 % времени", normNote: "допущение, уточнить у Алеси",
      calc: (a, b, o = {}) => div(S("downtime", a, b, o.lines), S("lineHours", a, b, o.lines)), detail: (a, b, k, o = {}) => `${fmt.hours(S("downtime", a, b, o.lines))} за период` },
    { id: "modq", dept: "prod", dim: "product", label: "Очередь модерации", short: "Модерация", fmt: fmt.perDay, up: false, formula: "Заказы, которые ждали модерацию дольше 2 ч, в среднем в день", sources: ["erp"], cadence: "каждые 15 минут", norm: { type: "max0" }, normText: "0 в день", normNote: "в норме, пока в среднем меньше 0,5 в день",
      calc: (a, b, o = {}) => div(S("modq", a, b, o.products), daysIn(a, b)) },
    { id: "turnover", dept: "sales", dim: "product", label: "Оборот к плану", short: "Оборот", fmt: fmt.pct, pp: true, up: true, formula: "Σ оплаченных заказов без НДС / план выручки за период", sources: ["ledger", "erp"], cadence: "ежедневно", norm: { type: "min", v: 1 }, normText: "≥ 100 % плана",
      calc: (a, b, o = {}) => div(S("net", a, b, o.products), S("plan", a, b, o.products)) },
    { id: "check", dept: "sales", dim: "product", label: "Средний чек", short: "Чек", fmt: fmt.money, up: true, formula: "Σ оплат без НДС / число оплаченных заказов", sources: ["ledger"], cadence: "ежедневно", norm: { type: "none" }, normText: "не задана", normNote: "смотрим динамику к прошлому периоду",
      calc: (a, b, o = {}) => div(S("net", a, b, o.products), S("paid", a, b, o.products)) },
    { id: "discount", dept: "sales", dim: "product", label: "Средняя скидка", short: "Скидка", fmt: fmt.pct, pp: true, up: false, formula: "Σ скидок / выручка до скидок", sources: ["ledger", "crm"], cadence: "ежедневно", norm: { type: "max", v: 0.2 }, normText: "≤ 20 %",
      calc: (a, b, o = {}) => div(S("discount", a, b, o.products), S("net", a, b, o.products) + S("discount", a, b, o.products)) },
    { id: "clients", dept: "sales", dim: null, label: "Новые клиенты", short: "Новые", fmt: fmt.int, up: true, formula: "Клиенты с первым заказом в периоде; активные — с заказом за 12 месяцев", sources: ["crm"], cadence: "ежедневно", norm: { type: "growth" }, normText: "рост к прошлому периоду",
      calc: (a, b, o = {}) => S("newCustomers", a, b), detail: (a, b, k, o = {}) => `активных за 12 мес.: ${fmt.int(customersAt(clampRange(a, b)[1]).active)}` },
    { id: "conversion", dept: "sales", dim: null, label: "Конверсия приложения", short: "Конверсия", fmt: fmt.pct, pp: true, up: true, formula: "Заказы из приложения / начатые в приложении проекты", sources: ["app"], cadence: "каждый час", norm: { type: "min", v: 0.25 }, normText: "≥ 25 %",
      calc: (a, b, o = {}) => div(S("appOrders", a, b), S("started", a, b)) },
    { id: "repeat", dept: "sales", dim: null, label: "Повторная покупка", short: "Повторные", fmt: fmt.pct, pp: true, up: true, formula: "Клиенты с 2+ заказами за 12 месяцев / клиенты с заказом за 12 месяцев", sources: ["crm"], cadence: "еженедельно", norm: { type: "growth" }, normText: "рост к прошлому периоду",
      calc: (a, b, o = {}) => { const c = customersAt(clampRange(a, b)[1]); return div(c.repeat, c.active); } },
    { id: "sla", dept: "support", dim: "product", label: "SLA поддержки", short: "SLA", fmt: fmt.pct, pp: true, up: true, formula: "Обращения, решённые в срок по теме / все обращения", sources: ["support"], cadence: "каждый час", norm: { type: "min", v: 0.9 }, normText: "≥ 90 %",
      calc: (a, b, o = {}) => div(S("inSla", a, b, o.products), S("tickets", a, b, o.products)), detail: (a, b, k, o = {}) => `обращений: ${fmt.int(S("tickets", a, b, o.products))}` },
    { id: "margin", dept: "fin", dim: "product", label: "Валовая маржа", short: "Маржа", fmt: fmt.pct, pp: true, up: true, formula: "(выручка − себестоимость) / выручка, без НДС", sources: ["ledger"], cadence: "ежедневно", norm: { type: "min", v: 0.45 }, normText: "≥ 45 %", visibleTo: ["fin"],
      calc: (a, b, o = {}) => div(S("net", a, b, o.products) - S("cost", a, b, o.products), S("net", a, b, o.products)) },
    { id: "staffing", dept: "hr", dim: "hr", label: "Обеспеченность персоналом", short: "Смены", fmt: fmt.pct, pp: true, up: true, formula: "Вышли на смену / требуется по плану", sources: ["hr"], cadence: "каждую смену", norm: { type: "min", v: 0.9 }, normText: "≥ 90 %", visibleTo: ["hr", "prod"],
      calc: (a, b, o = {}) => div(S("present", a, b, o.hrDepts), S("needed", a, b, o.hrDepts)) },
    { id: "absence", dept: "hr", dim: "hr", label: "Отсутствие и вакансии", short: "Отсутствие", fmt: fmt.pct, pp: true, up: false, formula: "Отсутствовали / поставлены в смену; вакансии — открытые места на конец периода", sources: ["hr"], cadence: "ежедневно", norm: { type: "max", v: 0.08 }, normText: "отсутствие ≤ 8 %", visibleTo: ["hr"],
      calc: (a, b, o = {}) => div(S("absent", a, b, o.hrDepts), S("scheduled", a, b, o.hrDepts)),
      detail: (a, b, k, o = {}) => { const e = clampRange(a, b)[1]; let v = 0; D.hr.forEach(h => { if (h.day === e && (!o.hrDepts || o.hrDepts.includes(h.dept))) v += h.vacancies; }); return `вакансий: ${fmt.int(v)}`; } },
  ];

  function status(k, value, prev, a, b, o) {
    if (value == null) return "none";
    const n = k.norm;
    if (n.type === "none") return "none";
    if (n.type === "min") return value >= n.v ? "good" : value >= n.v * 0.8 ? "warn" : "bad";
    if (n.type === "max") return value <= n.v ? "good" : value <= n.v * 1.2 ? "warn" : "bad";
    if (n.type === "max0") return value < 0.5 ? "good" : value < 1 ? "warn" : "bad";
    if (n.type === "range") return value >= n.v[0] && value <= n.v[1] ? "good" : value >= n.v[0] * 0.8 && value <= n.v[1] * 1.2 ? "warn" : "bad";
    if (n.type === "growth") return prev == null ? "none" : value >= prev ? "good" : value >= prev * 0.8 ? "warn" : "bad";
    if (n.type === "split") { const p = k.parts(a, b, o), rank = { good: 0, warn: 1, bad: 2 };
      const one = (v, max) => v == null ? "good" : v <= max ? "good" : v <= max * 1.2 ? "warn" : "bad";
      return [one(p.books, 0.02), one(p.prints, 0.01)].sort((x, y) => rank[y] - rank[x])[0]; }
    return "none";
  }
  const STATUS_TEXT = { good: "в норме", warn: "внимание", bad: "хуже нормы", none: "без нормы" };

  /* Публичный вид KPI: всё, что нужно плитке и подсказке «Как считается». o — срез из ctx() */
  const kpis = () => K.map(k => ({
    ...k, deptName: DEPTS.find(d => d.id === k.dept).name, sourceNames: k.sources.map(srcName), lastLoad: k.sources.map(id => SOURCES.find(s => s.id === id).lastLoad).sort()[0],
    status: (v, prev, a, b, o) => status(k, v, prev, a, b, o), detail: k.detail ? (a, b, o) => k.detail(a, b, k, o) : null,
  }));

  /* ---------- Роли и права (УП-05, notes/18 «Решения для дашборда» п. 3). Позже то же правило проверяет сервер ---------- */
  // director — всё; head — руководитель подразделения (dept); employee — сотрудник-исполнитель; analyst — аналитик/администратор.
  // Закрыто от других: маржа — финансы; отсутствие — HR; обеспеченность — HR и начальник производства (только свои смены).
  const PROD_HR = [0, 1, 2]; // Печать, Переплёт, Модерация — смены производства
  function access(kpiId, role, dept) {
    const k = K.find(x => x.id === kpiId);
    if (role === "director" || !k.visibleTo) return { open: true };
    if (role === "head" && k.visibleTo.includes(dept)) return kpiId === "staffing" && dept === "prod" ? { open: true, scope: "свои смены: печать, переплёт, модерация" } : { open: true };
    const who = k.visibleTo.map(id => DEPTS.find(d => d.id === id).name.toLowerCase()).join(", ");
    return { open: false, why: `Закрыто: видят ${who} и директор` };
  }
  /* Срез для расчёта: фильтр продукта или линии и область видимости роли */
  function ctx({ product = null, line = null, role = "director", dept = null } = {}) {
    const lineOfProduct = D.productLine;
    const products = product != null ? [product] : line != null ? D.dicts.products.map((_, i) => i).filter(i => lineOfProduct[i] === line) : null;
    const lines = product != null ? [lineOfProduct[product]] : line != null ? [line] : null;
    const hrDepts = role === "head" && dept === "prod" ? PROD_HR : null;
    return { products, lines, hrDepts, product, line };
  }
  const MATRIX = () => K.filter(k => k.visibleTo).map(k => ({ kpi: k.label, visibleTo: ["Директор"].concat(k.visibleTo.map(id => DEPTS.find(d => d.id === id).name)), note: k.id === "staffing" ? "начальник производства — только свои смены" : "" }));

  /* ---------- Качество данных по источникам (notes/18 п. 9) ---------- */
  function quality() {
    const dupCount = (rows, key) => rows.length - new Set(rows.map(r => r[key])).size;
    const ordersNoCustomer = D.orders.filter(o => !D.customerIds.has(o.customer_id)).length;
    const paidIds = new Set(D.payments.map(p => p.order_id));
    const ordersNoPayment = D.orders.filter(o => !paidIds.has(o.order_id)).length;
    const ticketsNoOrder = D.tickets.filter(t => D.dicts.topicNeedsOrder[t.topic] && !t.order_id).length;
    const ticketsUnknownOrder = D.tickets.filter(t => t.order_id && !D.byOrder.has(t.order_id)).length;
    const rows = {
      crm: { rows: D.customersRaw.length, gaps: D.customersRaw.filter(c => c.channel == null).length, dups: dupCount(D.customersRaw, "customer_id"), orphans: 0, orphanText: "—" },
      support: { rows: D.tickets.length, gaps: 0, dups: dupCount(D.tickets, "ticket_id"), orphans: ticketsNoOrder + ticketsUnknownOrder, orphanText: "обращения без заказа" },
      erp: { rows: D.ordersRaw.length + D.lines.length, gaps: D.ordersRaw.filter(o => o.channel == null).length, dups: dupCount(D.ordersRaw, "order_id"), orphans: ordersNoCustomer, orphanText: "заказы без клиента в CRM" },
      ledger: { rows: D.payments.length + D.plan.length, gaps: 0, dups: dupCount(D.payments, "order_id"), orphans: ordersNoPayment, orphanText: "заказы без оплаты в 1С" },
      hr: { rows: D.hr.length, gaps: 0, dups: 0, orphans: 0, orphanText: "—" },
      app: { rows: D.app.length, gaps: 0, dups: 0, orphans: 0, orphanText: "—" },
    };
    // Сверка финансов: сумма оплат в 1С против суммы заказов в ERP (как пришло, с дублями), расхождение в %
    const erpNet = D.ordersRaw.reduce((s, o) => s + o.list_price - o.discount, 0), ledgerNet = D.payments.reduce((s, p) => s + p.net, 0);
    const recon = { diff: erpNet ? (erpNet - ledgerNet) / erpNet : 0, explain: "в ERP есть дубли заказов, а часть оплат ещё не дошла до 1С" };
    // Те же находки построчно — для блока «Проверки последней выгрузки». Числа совпадают с таблицей источников выше
    const dupIds = (rs, key) => { const n = new Map(); rs.forEach(r => n.set(r[key], (n.get(r[key]) || 0) + 1)); return [...n].filter(([, c]) => c > 1); };
    const topics = D.dicts.topics;
    const issues = {
      missing: D.ordersRaw.filter(o => o.channel == null).map(o => ({ ref: `ERP · заказ ${o.order_id}`, detail: "Не указан канал продаж. В показатели по каналам заказ не попадает" }))
        .concat(D.customersRaw.filter(c => c.channel == null).map(c => ({ ref: `CRM · клиент ${c.customer_id}`, detail: "Не указан канал привлечения" }))),
      duplicates: dupIds(D.ordersRaw, "order_id").map(([id, c]) => ({ ref: `ERP · заказ ${id}`, detail: `${c} одинаковые строки, в расчёт показателей идёт одна` }))
        .concat(dupIds(D.customersRaw, "customer_id").map(([id, c]) => ({ ref: `CRM · клиент ${id}`, detail: `${c} одинаковые записи, в расчёт идёт одна` }))),
      orphans: D.orders.filter(o => !D.customerIds.has(o.customer_id)).map(o => ({ ref: `ERP · заказ ${o.order_id}`, detail: `Клиента ${o.customer_id} нет в CRM` }))
        .concat(D.orders.filter(o => !paidIds.has(o.order_id)).map(o => ({ ref: `1С · заказ ${o.order_id}`, detail: "Оплаты ещё нет в 1С" })))
        .concat(D.tickets.filter(t => D.dicts.topicNeedsOrder[t.topic] && !t.order_id).map(t => ({ ref: `Поддержка · обращение ${t.ticket_id}`, detail: `Тема «${topics[t.topic]}» требует номер заказа, а его нет` })))
        .concat(D.tickets.filter(t => t.order_id && !D.byOrder.has(t.order_id)).map(t => ({ ref: `Поддержка · обращение ${t.ticket_id}`, detail: `Заказа ${t.order_id} нет в ERP` }))),
    };
    return { sources: SOURCES.map(s => ({ ...s, ...freshness(s), ...rows[s.id] })), recon, issues, period: `${fmtDate(D.meta.start)} – ${fmtDate(D.meta.end)}` };
  }
  const fmtDate = iso => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };

  /* ---------- Контракт события (лекция заказчика, слайд 37; notes/26) ---------- */
  function contract() {
    const o = D.orders[D.orders.length - 1], t = D.tickets.find(x => x.order_id) || D.tickets[0];
    const ts = (d, h) => `${isoOf(d)}T${String(h).padStart(2, "0")}:00:00+03:00`;
    return {
      events: [
        { event_id: `evt-${o.order_id}-shipped`, ts: ts(o.ship_day, o.ship_hour), source: "erp", type: "order.shipped", customer_id: o.customer_id, order_id: o.order_id, actor: "system", outcome: o.ship_day <= o.promise_day ? "on_time" : "late" },
        { event_id: `evt-${t.ticket_id}-resolved`, ts: ts(t.day, t.hour), source: "support", type: "ticket.resolved", customer_id: t.customer_id, order_id: t.order_id, actor: "operator", outcome: t.resolve_min <= t.sla_min ? "resolved_in_sla" : "resolved_late" },
      ],
      rules: [
        ["Ключи", "customer_id, order_id, ticket_id, line_id, shift_id, dept_id — общие для всех источников"],
        ["Время", "ISO 8601 с часовым поясом (+03:00), дни — по Минску"],
        ["Деньги", "BYN, без НДС; финансы на экране — в % к плану и индексах"],
        ["Статусы", "заказ: оплачен → модерация → печать → отгружен; обращение: открыто → решено"],
        ["Права", "сервер отдаёт только разрешённые роли поля и показатели"],
        ["Ошибки", "{ code, message, source, retry_after } — экран показывает понятный текст"],
      ],
    };
  }

  /* ---------- Прогноз спроса и мощности по неделям (сценарий 5.2.4, notes/18 п. 4) ---------- */
  // Неделя k прогноза начинается через 7·k дней после конца данных; спрос берётся из той же недели прошлого года (история — ровно 52 недели).
  // ДОПУЩЕНИЯ (до решения Алеси): рост к прошлому году задаёт пользователь (0 / +10 / +20 %), тренд по одному году не считаем;
  // мощность линии — паспортная (ERP, последняя неделя); переплёт — люди, вышедшие в ту же неделю прошлого года (штат как в прошлом сезоне),
  // × 0,7 книги на человека за смену (70 книг в полном масштабе, масштаб 1:100). Неделя дефицита — первая, где спрос > 90 % мощности ресурса.
  const FC_THRESHOLD = 0.9, BIND_RATE = 0.7, BIND_DEPT = 1; // dicts.hrDepts[1] — «Переплёт»
  let FC = null;
  function fcBase() {
    if (FC) return FC;
    const NW = Math.floor(D.days / 7), NL = D.dicts.lines.length;
    const dem = Array.from({ length: NW }, () => new Float64Array(NL)), books = new Float64Array(NW), bind = new Float64Array(NW);
    D.orders.forEach(o => { const w = Math.floor(o.day / 7); if (w >= NW) return; dem[w][o.line] += o.units; if (D.dicts.isBook[o.product]) books[w] += o.units; });
    D.hr.forEach(h => { const w = Math.floor(h.day / 7); if (w < NW && h.dept === BIND_DEPT) bind[w] += h.scheduled - h.absent; });
    const cap = D.dicts.lines.map((_, l) => S("capacity", D.days - 7, D.days - 1, [l]));
    return FC = { NW, dem, books, bind, cap };
  }
  function forecast({ growth = 0, lines = null, products = null } = {}) {
    const B = fcBase(), g = 1 + growth, names = D.dicts.lines;
    const res = (lines || names.map((_, i) => i)).map(l => ({ id: "line-" + l, line: l, name: names[l], kind: "line" }));
    if (!products || products.some(p => D.dicts.isBook[p])) res.push({ id: "bind", name: "Переплёт", kind: "people" });
    const weeks = [];
    for (let k = 0; k < B.NW; k++) {
      const r = res.map(x => {
        const demand = (x.kind === "line" ? B.dem[k][x.line] : B.books[k]) * g, capacity = x.kind === "line" ? B.cap[x.line] : B.bind[k] * BIND_RATE;
        return { ...x, demand, capacity, load: div(demand, capacity) || 0 };
      });
      const peak = r.reduce((a, b) => (b.load > a.load ? b : a)), ln = r.filter(x => x.kind === "line");
      const start = D.days + 7 * k;
      weeks.push({ k, start: isoOf(start), end: isoOf(start + 6), res: r, peak, lineLoad: div(ln.reduce((s, x) => s + x.demand, 0), ln.reduce((s, x) => s + x.capacity, 0)), deficit: peak.load > FC_THRESHOLD });
    }
    return { weeks, first: weeks.find(w => w.deficit) || null, threshold: FC_THRESHOLD, growth, from: isoOf(D.days), sources: ["erp", "hr"],
      method: "Спрос недели — заказы той же недели прошлого года (ERP) с поправкой на рост. Мощность — паспорт линий (ERP); переплёт — вышедшие люди той же недели прошлого года (HR) × 70 книг за смену. Дефицит — спрос выше 90 % мощности." };
  }

  /* ---------- Заказы-основания и карточка заказа (этап 4, слайды 8 и 41) ---------- */
  // Экран передаёт фильтр отклонения, отбор делает слой данных (позже — GET /api/insight/orders?…, notes/26 п. 11).
  // ФИО нет нигде: клиент — только customer_id. Себестоимость отдаётся, но экран показывает её только тем, кому открыта маржа.
  let TBO = null;
  const ticketsByOrder = () => { if (!TBO) { TBO = new Map(); D.tickets.forEach(t => { if (t.order_id) { if (!TBO.has(t.order_id)) TBO.set(t.order_id, []); TBO.get(t.order_id).push(t); } }); } return TBO; };
  let PBO = null;
  const paymentOf = id => { if (!PBO) PBO = new Map(D.payments.map(p => [p.order_id, p])); return PBO.get(id) || null; };
  const pad2 = n => String(n).padStart(2, "0");
  // Время событий: день от meta.start и час по Минску (+03:00); минуты могут перейти на следующий день
  const tsOf = (d, h) => { const t = new Date(D.start + d * DAY + Math.round(h * 60) * 6e4); return `${t.toISOString().slice(0, 16)}:00+03:00`; };
  const isFirstOrder = o => firstDay.get(o.customer_id) === o.day;
  // Ответственный и следующий шаг по заказу. Правило одно для экрана и сервера; порядок — от самого срочного
  function orderAction(o, tks) {
    const late = o.ship_day > o.promise_day, overSla = tks.find(t => t.resolve_min > t.sla_min), claim = tks.find(t => t.topic === 1); // 1 — «Брак»
    if (o.defects > 0) return { owner: "Начальник производства", reason: "брак", next: `Переделать ${o.defects} из ${o.units} шт. по фото клиента${claim ? ` и закрыть обращение ${claim.ticket_id}` : ""}` };
    if (late) return { owner: "Начальник производства", reason: "опоздание", next: "Сообщить клиенту фактическую дату отгрузки и решить, нужна ли компенсация" };
    if (o.coupon && !isFirstOrder(o)) return { owner: "Руководитель продаж", reason: "купон", next: "Купон применён к повторному заказу: по предложенному правилу купон — только на первый заказ" };
    if (overSla) return { owner: "Руководитель поддержки", reason: "SLA", next: `Разобрать, почему обращение ${overSla.ticket_id} решено позже срока` };
    return { owner: null, reason: null, next: "Действий не требуется" };
  }
  function brief(o) {
    const tks = ticketsByOrder().get(o.order_id) || [], p = paymentOf(o.order_id);
    return { id: o.order_id, customer_id: o.customer_id, date: isoOf(o.day), ts: tsOf(o.day, o.hour), product: D.dicts.products[o.product], line: D.dicts.lines[o.line], shift: D.dicts.shifts[o.shift],
      units: o.units, defects: o.defects, coupon: !!o.coupon, net: p ? p.net : null, late: o.ship_day > o.promise_day, tickets: tks.length, action: orderAction(o, tks) };
  }
  // q: { from: "YYYY-MM-DD", line, shift, product, coupon: true|false, defects: true }
  function orders(q = {}) {
    const from = q.from ? Math.round((Date.parse(q.from + "T00:00:00Z") - D.start) / DAY) : 0;
    return D.orders.filter(o => o.day >= from && (q.line == null || o.line === q.line) && (q.shift == null || o.shift === q.shift) && (q.product == null || o.product === q.product)
      && (q.coupon == null || !!o.coupon === q.coupon) && (!q.defects || o.defects > 0))
      .sort((a, b) => b.day - a.day || b.hour - a.hour).map(brief);
  }
  function order(id) {
    const o = D.byOrder.get(id); if (!o) return null;
    const tks = (ticketsByOrder().get(id) || []).slice().sort((a, b) => a.day - b.day || a.hour - b.hour), p = paymentOf(id);
    const c = D.customersRaw.find(x => x.customer_id === o.customer_id) || null, last = D.days - 1, shipped = o.ship_day <= last;
    const n12 = (ordersOfCustomer.get(o.customer_id) || []).filter(x => x > o.day - 365 && x <= o.day).length;
    const ev = [
      { ts: tsOf(o.day, o.hour), source: "erp", text: `Заказ принят: ${D.dicts.channels[o.channel] || "канал не указан"}` },
      p && { ts: tsOf(p.day, o.hour + 0.05), source: "ledger", text: "Оплата прошла в 1С" },
      { ts: tsOf(o.day, o.hour + 0.05 + o.moderation_min / 60), source: "erp", text: `Модерация макета: ${o.moderation_min} мин${o.moderation_min > 120 ? ", дольше 2 ч" : ""}` },
      shipped && { ts: tsOf(o.ship_day, o.ship_hour), source: "erp", text: o.ship_day > o.promise_day ? `Отгружен с опозданием, обещали ${isoOf(o.promise_day)}` : "Отгружен в срок" },
      shipped && o.defects > 0 && { ts: tsOf(o.ship_day, o.ship_hour), source: "erp", text: `Контроль качества: брак ${o.defects} из ${o.units} шт.` },
      ...tks.flatMap(t => [
        { ts: tsOf(t.day, t.hour), source: "support", text: `Обращение ${t.ticket_id}: ${D.dicts.topics[t.topic]}, ${D.dicts.ticketChannels[t.channel]}` },
        { ts: tsOf(t.day, t.hour + t.resolve_min / 60), source: "support", text: `Обращение ${t.ticket_id} решено за ${t.resolve_min} мин${t.resolve_min > t.sla_min ? `, позже SLA (${t.sla_min} мин)` : ", в срок"}` },
      ]),
    ].filter(Boolean).sort((a, b) => (a.ts < b.ts ? -1 : 1));
    return {
      ...brief(o),
      erp: { units: o.units, list_price: o.list_price, discount: o.discount, coupon: !!o.coupon, channel: D.dicts.channels[o.channel] || null, promise: isoOf(o.promise_day), ship: shipped ? tsOf(o.ship_day, o.ship_hour) : null,
        moderation_min: o.moderation_min, lead_h: shipped ? (o.ship_day - o.day) * 24 + o.ship_hour - o.hour : null, status: !shipped ? "в производстве" : o.ship_day > o.promise_day ? "отгружен с опозданием" : "отгружен в срок" },
      ledger: p ? { date: isoOf(p.day), net: p.net, discount: p.discount, cost: p.cost } : null,
      crm: c ? { customer_id: c.customer_id, first: isoOf(firstDay.get(c.customer_id)), channel: D.dicts.channels[c.channel] || null, occasion: D.dicts.occasions[c.occasion] || null, orders12m: n12, firstOrder: isFirstOrder(o) } : null,
      support: tks.map(t => ({ id: t.ticket_id, ts: tsOf(t.day, t.hour), topic: D.dicts.topics[t.topic], channel: D.dicts.ticketChannels[t.channel], sla_min: t.sla_min, resolve_min: t.resolve_min, inSla: t.resolve_min <= t.sla_min })),
      events: ev,
    };
  }

  /* ---------- Недельная сводка для разбора отклонений (D-117, D-118) ---------- */
  // Те же заказы, что и в KPI, сложенные по неделе × линии × продукту × смене. Поэтому брак Ricoh в карточке
  // отклонения и на плитке «Брак» с фильтром линии — одно и то же число.
  // Выпуск и брак — по дню отгрузки (как в KPI «Брак»), заказы, деньги и опоздания — по дню заказа (как в KPI «Оборот», «Скидка», «В срок»).
  // Простой линии за смену делится между продуктами этой линии пропорционально выпуску.
  // Оператор — закреплённый за линией, продуктом и сменой (ДОПУЩЕНИЕ макета). Партия материала Ricoh меняется в день meta.stories.batch.
  const OPERATORS = { "0|4": ["R-1", "R-3"], "0|0": ["R-2", "R-4"], "0|1": ["R-6", "R-5"], "1|3": ["F-1", "F-2"], "2|2": ["N-1", "N-2"] };
  const BATCHES = { 0: ["Поставщик А · партия РА-0926", "Поставщик Б · партия РБ-1141"], 1: ["Поставщик В · партия ФХ-0814"], 2: ["Поставщик Г · партия Н-0702"] };
  // firstMonday — понедельник недели 1 макета; недели считаются от него, номера могут быть отрицательными
  function weekly(firstMonday, wFrom, wTo) {
    const d1 = dayOf(new Date(firstMonday + "T00:00:00Z")), weekOf = d => Math.floor((d - d1) / 7) + 1, batchDay = dayOf(new Date(D.meta.stories.batch + "T00:00:00Z"));
    const rows = new Map(), last = D.days - 1;
    const row = (w, line, product, shift) => {
      const key = `${w}|${line}|${product}|${shift}`;
      if (!rows.has(key)) {
        const ops = OPERATORS[`${line}|${product}`] || ["—", "—"], b = BATCHES[line], batch = b[Math.min(b.length - 1, w >= weekOf(batchDay) ? 1 : 0)];
        rows.set(key, { w, line: D.dicts.lines[line], product: D.dicts.products[product], shift: D.dicts.shifts[shift], operator: ops[shift], supplier: batch,
          orders: 0, sheets: 0, defects: 0, revenue: 0, cost: 0, discount: 0, downtime: 0, late: 0 });
      }
      return rows.get(key);
    };
    const inRange = w => w >= wFrom && w <= wTo;
    const units = new Map(); // выпуск линии за день и смену — для деления простоя
    D.orders.forEach(o => {
      const wo = weekOf(o.day);
      if (inRange(wo)) {
        const r = row(wo, o.line, o.product, o.shift), p = paymentOf(o.order_id);
        r.orders++; if (o.ship_day > o.promise_day) r.late++;
        if (p) { r.revenue += p.net; r.cost += p.cost; r.discount += p.discount; }
      }
      if (o.ship_day > last) return;
      const ws = weekOf(o.ship_day);
      if (inRange(ws)) { const r = row(ws, o.line, o.product, o.shift); r.sheets += o.units; r.defects += o.defects; }
      const k = `${o.ship_day}|${o.line}|${o.shift}`; if (!units.has(k)) units.set(k, new Map()); const m = units.get(k); m.set(o.product, (m.get(o.product) || 0) + o.units);
    });
    D.lines.forEach(l => {
      const w = weekOf(l.day); if (!inRange(w) || !l.downtime_h) return;
      const m = units.get(`${l.day}|${l.line}|${l.shift}`); if (!m) return;
      const total = [...m.values()].reduce((a, b) => a + b, 0);
      m.forEach((u, p) => { row(w, l.line, p, l.shift).downtime += l.downtime_h * u / total; });
    });
    const r1 = v => Math.round(v * 10) / 10;
    return [...rows.values()].map(r => ({ ...r, revenue: Math.round(r.revenue), cost: Math.round(r.cost), discount: Math.round(r.discount), downtime: r1(r.downtime) }))
      .sort((a, b) => a.w - b.w || a.line.localeCompare(b.line) || a.product.localeCompare(b.product) || a.shift.localeCompare(b.shift));
  }
  // Персонал по неделям для разбора D-119: те же строки HR и та же формула, что у KPI «Обеспеченность персоналом» и «Отсутствие».
  // needed — требуется по плану, present — вышли (поставлены в смену минус отсутствующие), scheduled — поставлены, absent — отсутствовали (человеко-смены за неделю).
  // depts — номера подразделений штата (null — вся компания); nightOnly — только ночные смены
  function hrWeekly(firstMonday, wFrom, wTo, { depts = null, nightOnly = false } = {}) {
    const d1 = dayOf(new Date(firstMonday + "T00:00:00Z")), out = new Map();
    for (let w = wFrom; w <= wTo; w++) out.set(w, { w, needed: 0, present: 0, scheduled: 0, absent: 0 });
    D.hr.forEach(h => {
      const r = out.get(Math.floor((h.day - d1) / 7) + 1);
      if (!r || (depts && !depts.includes(h.dept)) || (nightOnly && h.shift !== 1)) return;
      r.needed += h.needed; r.present += h.scheduled - h.absent; r.scheduled += h.scheduled; r.absent += h.absent;
    });
    return [...out.values()];
  }
  // Обращения с темой «Брак» по неделям — претензии клиентов для разбора D-118
  function claimsWeekly(firstMonday, wFrom, wTo) {
    const d1 = dayOf(new Date(firstMonday + "T00:00:00Z")), topic = D.dicts.topics.indexOf("Брак"), out = new Map();
    for (let w = wFrom; w <= wTo; w++) out.set(w, 0);
    D.tickets.forEach(t => { const w = Math.floor((t.day - d1) / 7) + 1; if (t.topic === topic && out.has(w)) out.set(w, out.get(w) + 1); });
    return [...out].map(([w, claims]) => ({ w, claims }));
  }

  return { load, boot, start, error, kpis, sources: () => SOURCES.map(s => ({ ...s, ...freshness(s) })), quality, contract, depts: () => DEPTS, statusText: s => STATUS_TEXT[s], dayOf, isoOf, meta: () => D.meta, days: () => D.days,
    access, ctx, matrix: MATRIX, products: () => D.dicts.products, lines: () => D.dicts.lines, forecast, orders, order, weekly, claimsWeekly, hrWeekly, hrDepts: () => D.dicts.hrDepts };
})();
InsightData.start();
