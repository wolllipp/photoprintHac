// Генератор синтетических данных picPac Insight (трек 1). Запуск: node design/insight/data/generate.mjs
// Параметры — notes/18-insight-metrics.md, раздел «Решения для дашборда» (Алеся, 12.11) и п. 8. Всё помечено (доп.) там же.
// Детерминированный: один SEED даёт одни и те же данные, поэтому набор можно пересобрать в любой момент без секретов.
// Пишет synthetic.js (подключается в HTML как window.INSIGHT_DATA). С флагом --json ещё synthetic.json — тот же снимок для бэкенда.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SEED = 20261109;
const START = Date.UTC(2025, 10, 10); // понедельник 10.11.2025
const DAYS = 364; // по 08.11.2026 включительно; «сегодня» в макете — 09.11.2026
const DAY = 864e5;
const idx = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - START) / DAY);
const iso = d => new Date(START + d * DAY).toISOString().slice(0, 10);

/* ---------- Случайность с зерном ---------- */
let s = SEED >>> 0;
const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const normal = (m = 0, sd = 1) => m + sd * Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
const pick = weights => { let r = rnd() * weights.reduce((a, b) => a + b, 0); for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; } return weights.length - 1; };
const poisson = l => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
const binom = (n, p) => { let k = 0; for (let i = 0; i < n; i++) if (rnd() < p) k++; return k; };
const r2 = v => Math.round(v * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- Справочники ---------- */
const PRODUCTS = ["Фотокнига Lite", "Фотокнига Classic", "Фотокнига Premium", "Фотопечать, фотохимия", "Фотопечать, цифровая"];
const P_SHARE = [0.21, 0.27, 0.12, 0.16, 0.24]; // книги 60% (35/45/20), печать 40% (фотохимия 40 / цифровая 60)
const IS_BOOK = [1, 1, 1, 0, 0];
const LINES = ["Ricoh", "Fuji Frontier", "Noritsu"];
const LINE_OF = [0, 0, 2, 1, 0];
const LINE_CAP = [20000, 10000, 5000].map(v => v / 100); // изделий в день, масштаб 1:100
const SHIFTS = ["День", "Ночь"];
const CHANNELS = ["Сайт", "Приложение", "Instagram"];
const OCCASIONS = ["Семья", "Путешествие", "Свадьба", "Выпускной", "Дети"];
const TOPICS = ["Сроки", "Брак", "Оплата", "Доставка", "Макет и файлы", "Скидки и промокоды", "Другое"];
const TOPIC_W = [22, 14, 12, 22, 14, 8, 8];
const TOPIC_SLA = [25, 45, 20, 25, 15, 20, 30]; // минут, (доп.) по образцу лекции заказчика
const NEEDS_ORDER = [1, 1, 1, 1, 1, 0, 0];
const T_CHANNELS = ["Telegram", "ВКонтакте", "MAX", "Email", "Веб-чат", "Сайт", "Instagram", "Viber"];
const T_CHANNEL_W = [38, 18, 13, 12, 11, 3, 3, 2];
// HR: подразделения штата (без ФИО). Штат 300 → 475 в сезон, переплёт 50 → 80 (notes/18)
const HR_DEPTS = ["Печать", "Переплёт", "Модерация", "Логистика", "Поддержка", "Продажи и маркетинг", "Финансы", "Прочие службы"];
const HR_BASE = [60, 50, 20, 40, 30, 25, 10, 65];
const HR_SEASON = [95, 80, 35, 70, 45, 30, 12, 108];
const HR_TWO_SHIFTS = [1, 1, 1, 1, 0, 0, 0, 0];

// Сезон по месяцам к обычному месяцу (= 1,0), генератор нормирует на год
const MONTH_COEF = [0.6, 0.7, 0.8, 1.5, 2.2, 2.5, 0.9, 0.8, 0.9, 0.9, 1.0, 1.6];
const WEEKDAY = [0.85, 1.05, 1.0, 1.0, 1.0, 0.95, 0.9]; // вс, пн … сб
const HOUR_W = [1, 0.5, 0.3, 0.2, 0.2, 0.3, 0.6, 1.2, 2, 3, 3.6, 3.8, 3.4, 3, 2.8, 2.7, 2.8, 3, 3.4, 4, 4.4, 4.2, 3.2, 2];

/* ---------- Истории для демо (даты совпадают с текущей демо-историей макета) ---------- */
const BATCH = idx(2026, 10, 26);   // на Ricoh пошла новая партия материала: брак книг ночью 1,6% → 7%
const DOWNTIME = idx(2026, 10, 27); // простой Ricoh в ночную смену
const PROMO = idx(2026, 10, 26);   // купоны на Premium: доля 15% → 45%, маржа Premium падает
const RELEASE = idx(2026, 10, 27); // обновление приложения: конверсия 28% → 17%
const STAFF_DIP = idx(2026, 10, 26); // в ночных сменах печати больше отсутствующих
const SEASON = d => { const m = new Date(START + d * DAY).getUTCMonth(); return m >= 3 && m <= 5; };

const month = d => new Date(START + d * DAY).getUTCMonth();
const wday = d => new Date(START + d * DAY).getUTCDay();
const coef = d => MONTH_COEF[month(d)] * WEEKDAY[wday(d)];
const COEF_SUM = Array.from({ length: DAYS }, (_, d) => coef(d)).reduce((a, b) => a + b, 0);
const expectedOrders = d => 4800 * coef(d) / COEF_SUM;

/* ---------- Цены и себестоимость (без НДС, BYN) ---------- */
const LIST = [() => normal(56, 7), () => normal(76, 9), () => normal(122, 14)];
const PRINT_PRICE = 0.95; // за отпечаток; средний заказ печати ≈ 21 отпечаток ≈ 20 руб. → обычный день ≈ 35% мощности, июнь ≈ 85–95%
const COST_RATE = [0.45, 0.45, 0.5, 0.45, 0.45]; // доля от цены до скидки → маржа ≈50% при обычной скидке; Premium 36% → 19% при купонах

/* ---------- Клиенты ---------- */
const customers = []; // [customer_id, first_day, channel, occasion]
const cid = n => "C-" + String(n).padStart(5, "0");
for (let i = 1; i <= 700; i++) customers.push([cid(i), -Math.floor(rnd() * 400) - 1, pick([45, 35, 20]), pick([35, 20, 10, 15, 20])]);
let nextCustomer = 701;
const ordered = []; // индексы клиентов, у которых уже были заказы
const lastOrderOf = new Map();

/* ---------- Заказы (ERP) и оплаты (1С) ---------- */
const orders = []; // см. ORDER_COLS
const ORDER_COLS = ["order_id", "customer_id", "day", "hour", "product", "line", "shift", "units", "list_price", "discount", "cost", "channel", "coupon", "promise_day", "ship_day", "ship_hour", "moderation_min", "defects"];
const app = []; // [day, started, ordered]
let orderNo = 100001;
for (let d = 0; d < DAYS; d++) {
  const n = poisson(expectedOrders(d));
  const appExpected = expectedOrders(d) * 0.35;
  app.push([d, Math.max(1, Math.round(normal(appExpected / 0.28, Math.sqrt(appExpected / 0.28) * 0.25))), 0]);
  for (let k = 0; k < n; k++) {
    const ch = pick([45, 35, 20]);
    if (ch === 1 && d >= RELEASE && rnd() > 17 / 28) continue; // после релиза часть клиентов бросает приложение
    const p = pick(P_SHARE), book = IS_BOOK[p], line = LINE_OF[p];
    const hour = pick(HOUR_W), shift = rnd() < 0.62 ? 0 : 1;
    // клиент: ≈30% заказов — первый заказ нового клиента, ≈8% — возврат клиентов, заказывавших до начала данных,
    // остальное — повторные заказы, причём чаще у небольшой группы постоянных клиентов (фотопечать заказывают часто)
    let c;
    const r = rnd();
    if (!ordered.length || r < 0.3) { c = customers.length; customers.push([cid(nextCustomer++), d, ch, pick([35, 20, 10, 15, 20])]); }
    else if (r < 0.38) c = Math.floor(rnd() * 700);
    else c = ordered[Math.floor(Math.pow(rnd(), 3) * ordered.length)];
    if (!lastOrderOf.has(c)) ordered.push(c);
    lastOrderOf.set(c, d);
    // цена и скидка
    const units = book ? 1 : Math.max(5, Math.round(normal(21, 6)));
    const list = Math.max(book ? 30 : 6, book ? LIST[p]() : units * PRINT_PRICE * normal(1, 0.08));
    const premium = p === 2, promoOn = premium && d >= PROMO;
    const couponP = premium ? (promoOn ? 0.45 : 0.15) : 0.1;
    const coupon = rnd() < couponP ? 1 : 0;
    const discRate = coupon ? (premium ? 0.51 : 0.3) : premium ? (promoOn ? 0.2 : 0.17) : clamp(normal(0.05, 0.03), 0, 0.15);
    const discount = r2(list * discRate), cost = r2(list * COST_RATE[p]);
    // брак: Ricoh, книги Lite и Classic, ночная смена, после смены партии
    const ricohNightBooks = line === 0 && shift === 1 && book && d >= BATCH;
    const defects = book ? (rnd() < (ricohNightBooks ? 0.07 : p === 2 ? 0.015 : 0.016) ? 1 : 0) : binom(units, line === 0 && shift === 1 && d >= BATCH ? 0.02 : 0.008);
    // сроки: оплачено до 12:00 — отгрузка в тот же день, иначе на следующий
    const promise = hour < 12 ? d : d + 1;
    const lateP = (SEASON(d) ? 0.07 : 0.03) + (defects && book ? 0.55 : 0) + (ricohNightBooks ? 0.05 : 0);
    const late = rnd() < lateP ? (rnd() < 0.2 ? 2 : 1) : 0;
    const ship = promise + late;
    const shipHour = ship === d ? Math.min(22, Math.max(hour + 3, 14) + Math.floor(rnd() * 5)) : 10 + Math.floor(rnd() * 9);
    const moder = Math.min(600, Math.round(Math.exp(normal(Math.log(SEASON(d) ? 45 : 25), 0.55))));
    orders.push([`O-${orderNo++}`, customers[c][0], d, hour, p, line, shift, units, r2(list), discount, cost, ch, coupon, promise, ship, shipHour, moder, defects]);
    if (ch === 1) app[d][2]++;
  }
}

/* ---------- Линии (ERP): выпуск, мощность, простои ---------- */
const lines = []; // [day, line, shift, capacity, output, downtime_h]
const out = new Map();
for (const o of orders) { const key = `${o[14]}|${o[5]}|${o[6]}`; out.set(key, (out.get(key) || 0) + o[7]); }
for (let d = 0; d < DAYS; d++) for (let l = 0; l < 3; l++) for (let sh = 0; sh < 2; sh++) {
  let down = rnd() < 0.12 ? r2(0.3 + rnd() * 1.2) : 0;
  if (l === 0 && sh === 1 && d === DOWNTIME) down = 4.5;
  else if (l === 0 && sh === 1 && d > BATCH && rnd() < 0.3) down = r2(0.5 + rnd() * 1.5);
  lines.push([d, l, sh, LINE_CAP[l] / 2, out.get(`${d}|${l}|${sh}`) || 0, down]);
}

/* ---------- Персонал (HR): по плану, вакансии, вышли, отсутствовали ---------- */
const hr = []; // [day, dept, shift, needed, vacancies, scheduled, absent]
const ramp = d => { const t = new Date(START + d * DAY), m = t.getUTCMonth(), day = t.getUTCDate(); if (m >= 3 && m <= 5) return 1; if (m === 2 && day >= 15) return (day - 14) / 17; if (m === 6 && day <= 15) return 1 - day / 15; return 0; };
for (let d = 0; d < DAYS; d++) {
  const weekend = wday(d) === 0 || wday(d) === 6, m = month(d), rmp = ramp(d);
  HR_DEPTS.forEach((_, dept) => {
    if (weekend && !HR_TWO_SHIFTS[dept]) return;
    const need = Math.round(HR_BASE[dept] + (HR_SEASON[dept] - HR_BASE[dept]) * rmp);
    const shifts = HR_TWO_SHIFTS[dept] ? [[0, 0.55], [1, 0.45]] : [[0, 1]];
    for (const [sh, part] of shifts) {
      const needed = Math.max(1, Math.round(need * part));
      const vacRate = m === 2 ? 0.1 : rmp > 0 ? 0.05 : 0.03;
      const vacancies = binom(needed, vacRate), scheduled = needed - vacancies;
      const dip = d >= STAFF_DIP && sh === 1 ? (dept === 0 ? 0.22 : dept === 1 ? 0.12 : 0) : 0; // ночные смены печати и переплёта
      const absRate = (m <= 1 ? 0.07 : 0.05) + dip;
      hr.push([d, dept, sh, needed, vacancies, scheduled, binom(scheduled, absRate)]);
    }
  });
}

/* ---------- Обращения (поддержка) ---------- */
const tickets = []; // [ticket_id, customer_id, order_id, day, hour, topic, channel, sla_min, resolve_min]
const T_SUM = Array.from({ length: DAYS }, (_, d) => MONTH_COEF[month(d)]).reduce((a, b) => a + b, 0);
const byDay = Array.from({ length: DAYS }, () => []);
orders.forEach(o => byDay[o[2]].push(o));
const recentOrder = d => { for (let t = 0; t < 30; t++) { const pool = byDay[Math.max(0, d - Math.floor(rnd() * 14))]; if (pool.length) return pool[Math.floor(rnd() * pool.length)]; } return null; };
let ticketNo = 50001;
const zOf = p => { const a = [[0.76, 0.706], [0.8, 0.842], [0.92, 1.405]]; return a.reduce((best, x) => Math.abs(x[0] - p) < Math.abs(best[0] - p) ? x : best)[1]; };
const addTicket = (d, topic, o) => {
  const sla = TOPIC_SLA[topic], target = d >= BATCH ? 0.8 : SEASON(d) ? 0.86 : 0.92, sd = 0.7;
  const resolve = Math.max(1, Math.round(sla * Math.exp(-sd * zOf(target) + sd * normal())));
  tickets.push([`T-${ticketNo++}`, o ? o[1] : customers[Math.floor(rnd() * customers.length)][0], o && NEEDS_ORDER[topic] ? o[0] : null, d, pick(HOUR_W), topic, pick(T_CHANNEL_W), sla, resolve]);
};
for (let d = 0; d < DAYS; d++) {
  const n = poisson(1500 * MONTH_COEF[month(d)] / T_SUM);
  for (let k = 0; k < n; k++) { const topic = pick(TOPIC_W); addTicket(d, topic, recentOrder(d)); }
  // после смены партии клиенты пишут о браке по конкретным заказам
  if (d >= BATCH) byDay[d].filter(o => o[17] > 0 && o[5] === 0).forEach(o => { if (rnd() < 0.85) addTicket(Math.min(DAYS - 1, d + 1 + Math.floor(rnd() * 2)), 1, o); });
}
tickets.sort((a, b) => a[3] - b[3] || a[4] - b[4]);

/* ---------- 1С: оплаты по заказам и план выручки ---------- */
const payments = []; // [order_id, day, net, discount, cost]
const MEAN_NET = [56 * 0.92, 76 * 0.92, 122 * 0.78, 21 * PRINT_PRICE * 0.92, 21 * PRINT_PRICE * 0.92];
for (const o of orders) payments.push([o[0], o[2], r2(o[8] - o[9]), o[9], o[10]]);
const plan = []; // [day, product, plan_net] — план выручки без НДС
for (let d = 0; d < DAYS; d++) for (let p = 0; p < 5; p++) plan.push([d, p, r2(expectedOrders(d) * P_SHARE[p] * MEAN_NET[p])]);

/* ---------- Немного «грязи», чтобы экрану качества данных было что показать (notes/18 п. 9) ---------- */
const late = orders.filter(o => o[2] > DAYS - 10);
for (let i = 0; i < 3; i++) orders.push(late[i * 7].slice()); // дубли заказов в ERP
for (let i = 0; i < 5; i++) orders[200 + i * 333][11] = null; // пропуск канала
for (let i = 0; i < 4; i++) orders[150 + i * 911][1] = "C-9000" + (i + 1); // клиента нет в CRM
const missing = new Set([late[3][0], late[11][0]]); // оплаты ещё не дошли до 1С
const paymentsFinal = payments.filter(p => !missing.has(p[0]));
customers.push(customers[12].slice(), customers[345].slice()); // дубли клиентов в CRM
for (let i = 0, n = 0; i < tickets.length && n < 9; i += 97) if (NEEDS_ORDER[tickets[i][5]] && tickets[i][2]) { tickets[i][2] = null; n++; } // обращение без заказа

/* ---------- Снимок ---------- */
const snapshot = {
  meta: {
    title: "picPac Insight — синтетический набор", generator: "design/insight/data/generate.mjs", seed: SEED,
    start: iso(0), end: iso(DAYS - 1), today: "2026-11-09", tz: "+03:00", currency: "BYN", vat: "без НДС (НДС 20%)", scale: "1:100 по заказам",
    note: "Все данные придуманы по параметрам notes/18. Реальных данных «Фотопринта» здесь нет.",
    stories: { batch: iso(BATCH), downtime: iso(DOWNTIME), promo: iso(PROMO), release: iso(RELEASE), staffDip: iso(STAFF_DIP) },
  },
  dicts: { products: PRODUCTS, isBook: IS_BOOK, lines: LINES, shifts: SHIFTS, channels: CHANNELS, occasions: OCCASIONS, topics: TOPICS, topicNeedsOrder: NEEDS_ORDER, ticketChannels: T_CHANNELS, hrDepts: HR_DEPTS },
  customers: { cols: ["customer_id", "first_day", "channel", "occasion"], rows: customers },
  orders: { cols: ORDER_COLS, rows: orders },
  payments: { cols: ["order_id", "day", "net", "discount", "cost"], rows: paymentsFinal },
  plan: { cols: ["day", "product", "plan_net"], rows: plan },
  lines: { cols: ["day", "line", "shift", "capacity", "output", "downtime_h"], rows: lines },
  hr: { cols: ["day", "dept", "shift", "needed", "vacancies", "scheduled", "absent"], rows: hr },
  tickets: { cols: ["ticket_id", "customer_id", "order_id", "day", "hour", "topic", "channel", "sla_min", "resolve_min"], rows: tickets },
  app: { cols: ["day", "started", "ordered"], rows: app },
};

const here = dirname(fileURLToPath(import.meta.url));
const json = JSON.stringify(snapshot);
if (process.argv.includes("--json")) writeFileSync(join(here, "synthetic.json"), json);
writeFileSync(join(here, "synthetic.js"), `/* Сгенерировано generate.mjs (seed ${SEED}). Не править руками: пересоберите генератором. */\nwindow.INSIGHT_DATA = ${json};\n`);
console.log(`клиентов ${customers.length}, заказов ${orders.length}, оплат ${paymentsFinal.length}, обращений ${tickets.length}, строк HR ${hr.length}, строк линий ${lines.length}; ${(json.length / 1024).toFixed(0)} КБ`);
