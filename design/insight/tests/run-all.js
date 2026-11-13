// Запускает все сквозные тесты дашборда Insight по очереди и пишет отчёт о тестировании в REPORT.md (рядом с этим файлом).
// Запуск из любой папки: node design/insight/tests/run-all.js
// Нужны Node 22+ (встроенный WebSocket и fetch) и Google Chrome. Chrome ищется сам, иначе путь — в переменной CHROME.
// Скриншоты и профили браузера — во временной папке, путь к ней печатается в отчёте.
const { spawn } = require("child_process"), fs = require("fs"), path = require("path"), os = require("os");

const TESTS = [
  ["cdp4.js", "Новый пользователь", "Первый заход по подсказкам: от первого экрана до результата (index.html)"],
  ["cdp22.js", "Встречи", "Назначение встречи, повестка, приглашения, перенос, итоги, что видит сотрудник"],
  ["cdp23.js", "Данные, KPI, роли", "Синтетические данные, 17 паспортов KPI, слой доступа, фильтры главной, права ролей"],
  ["cdp24.js", "Пульс и прогноз", "«Пульс компании», прогноз спроса и мощности, неделя дефицита, карточка D-120, ответ ассистента"],
  ["cdp25.js", "Заказы-основания", "От красной плитки до заказа за 3 клика, карточка заказа по всем источникам, права"],
  ["cdp26.js", "Цифры, журнал, сохранение", "D-118 и D-117 = KPI, проверки выгрузки из данных, журнал операций, сохранение и сброс"],
  ["cdp27.js", "Ошибка данных, D-119", "D-119 = KPI «Обеспеченность», экран ошибки данных и «Повторить» без потери сохранённого"],
  ["cdp28.js", "Экраны подразделений", "Продажи, производство, финансы и люди: цифры = KPI, права, переход к заказам, телефон"],
  ["cdp29.js", "Аналитик и защита", "Устаревший источник, сверка 1С и ERP по частям, подмена localStorage, setPath, шрифты без сети"],
  ["audit_light.js", "Темы и адаптив", "Каждый экран под своей ролью в светлой и тёмной теме, 1440 и 390 px без горизонтального скролла"],
];

const only = process.argv.slice(2);
const list = only.length ? TESTS.filter(t => only.includes(t[0]) || only.includes(t[0].replace(/\.js$/, ""))) : TESTS;
const stamp = new Date(), OUT = path.join(os.tmpdir(), "insight-tests-" + stamp.toISOString().replace(/[:.]/g, "-"));
fs.mkdirSync(OUT, { recursive: true });

function run([file]) {
  return new Promise(resolve => {
    const t0 = Date.now(), out = [];
    const p = spawn(process.execPath, [path.join(__dirname, file), path.join(OUT, file.replace(/\.js$/, ""))], { cwd: __dirname });
    p.stdout.on("data", d => out.push(String(d))); p.stderr.on("data", d => out.push(String(d)));
    const kill = setTimeout(() => p.kill(), 6 * 60 * 1000); // зависший тест не держит весь прогон
    p.on("close", code => {
      clearTimeout(kill);
      const text = out.join(""), lines = text.split(/\r?\n/);
      const pass = lines.filter(l => l.startsWith("PASS")).length, fails = lines.filter(l => l.startsWith("FAIL ")), crash = lines.find(l => /^CRASH|Error:/.test(l));
      resolve({ file, pass, fail: fails.length, fails, crash: !pass && !fails.length ? (crash || `код выхода ${code}`) : null, sec: Math.round((Date.now() - t0) / 1000) });
    });
  });
}

(async () => {
  const results = [];
  for (const t of list) {
    process.stdout.write(`${t[0].padEnd(16)} `);
    const r = await run(t); results.push({ ...r, name: t[1], about: t[2] });
    console.log(r.crash ? `ОШИБКА ЗАПУСКА: ${r.crash}` : `${r.pass} из ${r.pass + r.fail}${r.fail ? `, провалов ${r.fail}` : ""} · ${r.sec} с`);
  }
  const total = results.reduce((s, r) => s + r.pass + r.fail, 0), passed = results.reduce((s, r) => s + r.pass, 0), failed = results.filter(r => r.fail || r.crash);
  const md = [
    "# Отчёт о тестировании picPac Insight",
    "",
    `Дата прогона: ${stamp.toLocaleString("ru-RU", { timeZone: "Europe/Minsk" })} (Минск). Node ${process.version}, ${os.type()} ${os.release()}.`,
    `Как запустить: \`node design/insight/tests/run-all.js\` (или с именами тестов: \`node run-all.js cdp26 cdp29\`). Нужен Google Chrome; путь можно задать в переменной \`CHROME\`.`,
    "",
    `**Итог: ${passed} из ${total} проверок прошли${failed.length ? `, проблемы в ${failed.length} ${failed.length === 1 ? "тесте" : "тестах"}` : ", провалов нет"}.**`,
    "",
    "Тесты сквозные: настоящий Chrome без окна открывает страницы макета (`file://`), нажимает кнопки так же, как пользователь, и сверяет экран с расчётом из слоя данных. Сервера и сети тестам не нужно.",
    "",
    "| Тест | Что проверяет | Проверок | Результат | Время |",
    "|---|---|---|---|---|",
    ...results.map(r => `| \`${r.file}\` ${r.name} | ${r.about} | ${r.pass + r.fail} | ${r.crash ? "ошибка запуска" : r.fail ? `провалов: ${r.fail}` : "все прошли"} | ${r.sec} с |`),
    "",
    ...(failed.length ? ["## Провалы", "", ...failed.flatMap(r => [`### ${r.file}`, "", ...(r.crash ? [`- ${r.crash}`] : r.fails.map(f => `- ${f.replace(/^FAIL /, "")}`)), ""])] : []),
    "## Что не покрыто автотестами",
    "",
    "- Контраст и работа с клавиатуры проверяются вручную (ОТ-06): тесты смотрят только отсутствие горизонтального скролла и ошибок.",
    "- Права ролей проверяются в браузере. Серверной проверки прав в макете нет — это часть дорожной карты.",
    "- Данные синтетические (`data/generate.mjs`, детерминированный генератор): тесты привязаны к этому набору.",
    "",
    "Скриншоты каждого прогона сохраняются во временную папку системы, путь к ней печатается в конце вывода `run-all.js`.",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(__dirname, "REPORT.md"), md);
  console.log(`\nИтог: ${passed} из ${total}. Отчёт: ${path.join(__dirname, "REPORT.md")}\nСкриншоты: ${OUT}`);
  process.exitCode = failed.length ? 1 : 0;
})();
