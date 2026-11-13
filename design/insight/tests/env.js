// Общие настройки тестов: адрес страниц и путь к Chrome без привязки к диску разработчика.
// Страницы ищутся рядом с папкой tests (design/insight/*.html). Chrome — из переменной CHROME или в стандартных местах.
const path = require("path"), fs = require("fs"), { pathToFileURL } = require("url");

const page = name => pathToFileURL(path.join(__dirname, "..", name)).href;

const CANDIDATES = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
];
function chrome() {
  const found = CANDIDATES.find(p => p && fs.existsSync(p));
  if (!found) throw new Error("Не найден Chrome. Укажите путь в переменной окружения CHROME");
  return found;
}

module.exports = { page, chrome };
