"""Презентация из HTML/CSS. Модель верстает слайды как веб-страницу: выравнивание, перенос текста и сетку делает браузер,
а не координаты в дюймах. Рендер в настоящем Chromium даёт редактируемый pptx (dom-to-pptx), pdf, картинки слайдов и точные замечания по вёрстке."""
from __future__ import annotations

import json
import re
import subprocess

from .. import workspace as W
from ..registry import Result, tool
from ._common import SRC

RENDER = W.ROOT.parents[1] / "render"


@tool("make_slides", "workspace", "Верстаю презентацию",
      "Создать презентацию из HTML/CSS: вы пишете страницу, где каждый слайд — блок <section class=\"slide\"> размером 1280×720 пикселей, браузер сам расставляет элементы. "
      "Получаются редактируемый pptx, pdf и картинка первого слайда. Если в вёрстке есть проблемы (переполнение, наложение, выход за край), они вернутся списком: исправьте HTML и вызовите снова с тем же именем. "
      "Правила и примеры: search_docs «руководство по слайдам». Для правки готовой колоды прочитайте её HTML через read_file (имя.html) и передайте исправленный HTML целиком.",
      {"name": {"type": "string", "description": "имя без расширения, латиницей, например volcanoes"},
       "html": {"type": "string", "description": "полный HTML-документ со <style> и слайдами <section class=\"slide\">"}},
      required=["name", "html"],
      keywords=("презентац", "слайд", "deck", "pptx", "pdf", "доклад", "питч"))
def make_slides(ctx, name, html):
    sid = ctx.get("session", "")
    if re.search(r"<script|<iframe|<object|<embed|@import|https?://", html, re.I):
        return Result(data=dict(error="В HTML нельзя скрипты, внешние ссылки и @import: только <style> и разметка. Картинки берите из рабочей папки (относительный путь) или рисуйте SVG."))
    if 'class="slide"' not in html and "class='slide'" not in html and not re.search(r'class="[^"]*\bslide\b', html):
        return Result(data=dict(error='Нет слайдов: каждый слайд должен быть блоком <section class="slide"> размером 1280×720.'))
    base = re.sub(r"[^a-zA-Z0-9_-]", "", name)[:40] or "deck"
    ws = W.path(sid)
    (ws / f"{base}.html").write_text(html, encoding="utf-8")
    before = W.snapshot(sid)
    try:
        p = subprocess.run(["node", "render.mjs", str(ws / f"{base}.html"), str(ws), base], cwd=RENDER, capture_output=True, text=True, timeout=120)
    except FileNotFoundError:
        return Result(data=dict(error="На сервере не установлен Node.js, рендер презентаций недоступен."))
    except subprocess.TimeoutExpired:
        return Result(data=dict(error="Рендер занял больше 2 минут: упростите страницу."))
    try:
        info = json.loads(p.stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        return Result(data=dict(error="Рендер не удался: " + (p.stderr.strip().splitlines() or ["нет вывода"])[-1][:300]))
    if info.get("error"):
        return Result(data=dict(error=info["error"]))
    made = W.changed(sid, before)
    arts = [W.artifact(sid, f"{base}.pptx", "Презентация (pptx, редактируется)"), W.artifact(sid, f"{base}.pdf", "Презентация (pdf)"), W.artifact(sid, f"{base}-1.png", "Первый слайд")]
    issues = info.get("issues") or []
    data = dict(file=f"{base}.pptx", slides=info["slides"], files=made, summary=f"презентация из {info['slides']} слайдов")
    if issues:
        data |= dict(замечания_по_вёрстке=issues, подсказка="файл создан, но исправьте вёрстку и вызовите make_slides снова с тем же именем")
    return Result(data=data, sources=[SRC["defects"]], artifacts=arts)
