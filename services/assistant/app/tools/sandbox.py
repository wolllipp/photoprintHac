"""Рабочее место ассистента: Python-песочница с папкой чата. Модель сама пишет код для расчётов, графиков,
презентаций, документов и таблиц и может править ранее созданные файлы. Это общий инструмент, а не рецепт."""
from __future__ import annotations

import ast
import json
import subprocess
import sys

from .. import store as S
from .. import workspace as W
from ..registry import Result, tool
from ._common import SRC

ALLOWED = {"math", "statistics", "json", "csv", "re", "datetime", "collections", "itertools", "random", "textwrap",
           "numpy", "matplotlib", "pptx", "docx", "openpyxl"}
BANNED = {"exec", "eval", "compile", "__import__", "input", "globals", "locals", "getattr", "setattr", "delattr", "vars", "breakpoint"}
BAD_ATTR = {"os", "sys", "subprocess", "system", "popen", "importlib", "shutil", "socket", "builtins", "ctypes", "pathlib", "urllib", "http"}

RUNNER = r'''
import json, sys, os, io, resource, builtins
for _lim, _v in ((resource.RLIMIT_CPU, 55), (resource.RLIMIT_AS, 3 << 30)):
    try: resource.setrlimit(_lim, (_v, _v))
    except (ValueError, OSError): pass  # macOS не поддерживает RLIMIT_AS
payload = json.loads(sys.stdin.read()); WS = os.getcwd(); _real_open = builtins.open
def _open(p, mode="r", *a, **k):  # файлы только внутри рабочей папки чата
    full = os.path.realpath(os.path.join(WS, str(p)))
    if not full.startswith(os.path.realpath(WS) + os.sep): raise PermissionError("файлы доступны только в рабочей папке")
    return _real_open(full, mode, *a, **k)
b = {k: v for k, v in builtins.__dict__.items() if k not in payload["banned"]}; b["open"] = _open; b["__import__"] = builtins.__import__
import matplotlib; matplotlib.use("Agg")
g = {"DATA": payload["data"], "WS": WS, "__builtins__": b, "__name__": "__sandbox__"}
exec(payload["code"], g)
print("\x00RESULT" + json.dumps({"result": g.get("result")}, default=str))
'''


def check(code: str) -> str | None:
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return f"синтаксическая ошибка в строке {e.lineno}: {e.msg}"
    for n in ast.walk(tree):
        if isinstance(n, (ast.Import, ast.ImportFrom)):
            mods = [a.name for a in n.names] if isinstance(n, ast.Import) else [n.module or ""]
            for m in mods:
                if m.split(".")[0] not in ALLOWED:
                    return f"импорт «{m}» запрещён. Доступны: {', '.join(sorted(ALLOWED))}"
        if isinstance(n, ast.Name) and n.id in BANNED:
            return f"«{n.id}» запрещено"
        if isinstance(n, ast.Attribute) and (n.attr.startswith("__") or n.attr in BAD_ATTR):
            return f"обращение «.{n.attr}» запрещено"
    return None


@tool("run_python", "workspace", "Считаю и собираю на Python",
      "Универсальное рабочее место: выполнить код Python и сохранить файлы в рабочую папку чата. Подходит для любых расчётов, графиков (matplotlib → savefig('имя.png')), "
      "презентаций (pptx), документов (docx), таблиц (openpyxl). Файлы остаются в папке между вопросами: графики с прошлых шагов можно вставлять в презентацию, "
      "созданный файл можно открыть и дополнить. Переменные: DATA — список строк производства (w, line, product, shift, operator, supplier, orders, sheets, defects, revenue, cost, discount, downtime, late); "
      "WS — путь к папке. Через print() выводите нужное, итог можно положить в переменную result. Перед сложной работой прочитайте руководство: search_docs «руководство по файлам».",
      {"code": {"type": "string", "description": "код Python"}}, required=["code"],
      keywords=("посчитай", "рассчитай", "расчёт", "расчет", "корреляц", "python", "формул", "медиан", "презентац", "слайд", "график", "диаграмм", "документ", "таблиц", "excel", "xlsx", "docx", "pptx", "файл", "сделай", "добавь"))
def run_python(ctx, code):
    err = check(code)
    if err:
        return Result(data=dict(error=err))
    sid = ctx.get("session", "")
    ws = W.path(sid)
    before = W.snapshot(sid)
    data = S.ROWS if ctx["role"] == "ceo" else [{k: v for k, v in r.items() if k != "operator"} for r in S.ROWS]
    try:
        p = subprocess.run([sys.executable, "-I", "-c", RUNNER], input=json.dumps({"code": code, "data": data, "banned": sorted(BANNED)}),
                           capture_output=True, text=True, timeout=60, cwd=ws)
    except subprocess.TimeoutExpired:
        return Result(data=dict(error="превышено время расчёта (60 с): упростите код или разбейте на шаги"))
    if p.returncode:
        return Result(data=dict(error=(p.stderr.strip().splitlines() or ["ошибка"])[-1][:400]))
    out, _, res = p.stdout.partition("\x00RESULT")
    try:
        result = json.loads(res.strip()).get("result")
    except json.JSONDecodeError:
        result = None
    made = W.changed(sid, before)
    arts = [W.artifact(sid, n) for n in made]
    return Result(data=dict(printed=out.strip()[-3000:], result=result, files=made, summary=f"выполнено, файлов: {len(made)}" if made else "выполнено"),
                  sources=[SRC["defects"]], artifacts=arts)


@tool("list_files", "workspace", "Смотрю файлы чата", "Показать файлы в рабочей папке этого чата: созданные ранее графики, презентации, документы.",
      keywords=("файл", "презентац", "график", "что мы сделали", "добавь", "дополни", "исправь", "измени", "обнови", "скача"))
def list_files(ctx):
    f = W.listing(ctx.get("session", ""))
    return Result(data=dict(files=f or "папка пуста", summary=f"файлов: {len(f)}"))


@tool("read_file", "workspace", "Открываю файл", "Прочитать содержимое файла из рабочей папки чата: текст слайдов pptx, абзацы docx, ячейки xlsx, csv/txt. Нужно, чтобы дополнить или поправить уже готовый файл.",
      {"name": {"type": "string", "description": "имя файла из list_files"}}, required=["name"],
      keywords=("добавь", "дополни", "исправь", "измени", "обнови", "в презентац", "в файл", "слайд", "прочитай файл"))
def read_file(ctx, name):
    try:
        return Result(data=dict(name=name, content=W.read_text(ctx.get("session", ""), name), summary=f"открыт {name}"))
    except FileNotFoundError as e:
        return Result(data=dict(error=str(e), files=[x["name"] for x in W.listing(ctx.get("session", ""))]))
