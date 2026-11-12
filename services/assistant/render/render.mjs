// Рендер HTML-слайдов в настоящем браузере: pptx (редактируемый, через dom-to-pptx), pdf, png каждого слайда и точные замечания по вёрстке.
// Запуск: node render.mjs <файл.html> <папка> <имя без расширения>
import { chromium } from "playwright-core";
import { writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const [html, outDir, base] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const rels = ["chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac/Chromium.app/Contents/MacOS/Chromium", "chrome-linux/chrome", "chrome-linux64/chrome"];
  for (const r of [join(os.homedir(), "Library/Caches/ms-playwright"), join(os.homedir(), ".cache/ms-playwright")]) {
    if (!existsSync(r)) continue;
    for (const d of readdirSync(r).filter(x => x.startsWith("chromium-")).sort().reverse())
      for (const rel of rels) if (existsSync(join(r, d, rel))) return join(r, d, rel);
  }
  return undefined; // пусть playwright найдёт сам
}

const browser = await chromium.launch({ executablePath: chromePath() });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const root = resolve(outDir);
// HTML пишет модель: сети нет, файлы только из рабочей папки чата
await ctx.route("**/*", r => { const u = r.request().url(); (u.startsWith("data:") || u.startsWith("blob:") || (u.startsWith("file://") && decodeURIComponent(u.slice(7)).startsWith(root)) ? r.continue() : r.abort()); });
const page = await ctx.newPage();
await page.goto("file://" + resolve(html));
await page.evaluate(() => document.fonts.ready);
const n = await page.evaluate(() => document.querySelectorAll(".slide").length);
if (!n) {
  console.log(JSON.stringify({ error: 'в HTML нет ни одного блока class="slide"' }));
  await browser.close();
  process.exit(0);
}

// точные замечания по вёрстке: по реальной раскладке браузера, а не по прикидке
const issues = await page.evaluate(() => {
  const out = [];
  const push = (i, m) => { if (out.length < 14) out.push(`слайд ${i}: ${m}`); };
  const short = e => e.textContent.trim().slice(0, 30);
  const hasOwnText = e => [...e.childNodes].some(c => c.nodeType === 3 && c.textContent.trim());
  document.querySelectorAll(".slide").forEach((s, idx) => {
    const i = idx + 1, r = s.getBoundingClientRect();
    if (Math.abs(r.width - 1280) > 1 || Math.abs(r.height - 720) > 1) push(i, `размер слайда ${Math.round(r.width)}×${Math.round(r.height)}, нужно 1280×720`);
    let texts = 0;
    const leaves = [];
    s.querySelectorAll("*").forEach(e => {
      const b = e.getBoundingClientRect(), cs = getComputedStyle(e), own = hasOwnText(e);
      if (own) { texts++; if (!e.querySelector("*")) leaves.push({ e, b }); }
      if (b.width && own && (b.left < r.left - 2 || b.right > r.right + 2 || b.top < r.top - 2 || b.bottom > r.bottom + 2)) push(i, `текст «${short(e)}» выходит за край слайда`);
      if ((e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2) && cs.overflow !== "visible" && cs.display !== "inline") push(i, `блок «${short(e)}» переполнен: текст не помещается`);
      if (own && cs.display !== "inline" && (e.scrollWidth > e.clientWidth + 2 || e.scrollHeight > e.clientHeight + 2)) push(i, `текст «${short(e)}» не помещается в свой блок`);
      if (own && parseFloat(cs.fontSize) < 11) push(i, `слишком мелкий шрифт ${cs.fontSize} у «${short(e)}»`);
    });
    for (let a = 0; a < leaves.length; a++) for (let c = a + 1; c < leaves.length; c++) {
      const A = leaves[a].b, B = leaves[c].b;
      const w = Math.min(A.right, B.right) - Math.max(A.left, B.left), h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      if (w > 4 && h > 4) push(i, `тексты «${short(leaves[a].e)}» и «${short(leaves[c].e)}» накладываются`);
    }
    if (!texts) push(i, "на слайде нет текста");
  });
  return out;
});

// редактируемый pptx через dom-to-pptx
await page.addScriptTag({ path: join(here, "node_modules/dom-to-pptx/dist/dom-to-pptx.bundle.js") });
const b64 = await page.evaluate(async () => {
  const blob = await window.domToPptx.exportToPptx(Array.from(document.querySelectorAll(".slide")), { skipDownload: true, width: 13.333, height: 7.5, svgAsVector: true });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
});
writeFileSync(join(outDir, base + ".pptx"), Buffer.from(b64, "base64"));

// pdf и png слайдов
await page.addStyleTag({ content: "@page{size:1280px 720px;margin:0}body{margin:0}.slide{break-after:page}" });
await page.pdf({ path: join(outDir, base + ".pdf"), width: "1280px", height: "720px", printBackground: true });
const slides = await page.$$(".slide");
for (let i = 0; i < slides.length; i++) await slides[i].screenshot({ path: join(outDir, `${base}-${i + 1}.png`) });
console.log(JSON.stringify({ slides: n, issues }));
await browser.close();
