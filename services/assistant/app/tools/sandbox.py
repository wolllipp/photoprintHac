"""Python-песочница: модель пишет расчёт, он выполняется в отдельном процессе с лимитами, без сети и файлов."""
from __future__ import annotations

import ast
import json
import subprocess
import sys

from .. import store as S
from ..registry import Result, tool
from ._common import SRC

ALLOWED = {"math", "statistics", "json", "datetime", "collections", "itertools", "numpy"}
BANNED = {"open", "exec", "eval", "compile", "__import__", "input", "globals", "locals", "getattr", "setattr", "delattr", "vars", "breakpoint"}

RUNNER = r'''
import json, sys, resource
for _lim, _v in ((resource.RLIMIT_CPU, 5), (resource.RLIMIT_AS, 1 << 30)):
    try: resource.setrlimit(_lim, (_v, _v))
    except (ValueError, OSError): pass  # macOS не поддерживает RLIMIT_AS
payload = json.loads(sys.stdin.read()); DATA = payload["data"]
g = {"DATA": DATA, "__builtins__": {k: v for k, v in __builtins__.__dict__.items() if k not in payload["banned"]} | {"__import__": __import__}}
exec(payload["code"], g)
print(json.dumps({"result": g.get("result")}, default=str))
'''


def check(code: str) -> str | None:
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return f"синтаксическая ошибка: {e}"
    for n in ast.walk(tree):
        if isinstance(n, (ast.Import, ast.ImportFrom)):
            mods = [a.name for a in n.names] if isinstance(n, ast.Import) else [n.module or ""]
            for m in mods:
                if m.split(".")[0] not in ALLOWED:
                    return f"импорт «{m}» запрещён"
        if isinstance(n, ast.Name) and n.id in BANNED:
            return f"«{n.id}» запрещено"
        if isinstance(n, ast.Attribute) and n.attr.startswith("__"):
            return "доступ к служебным атрибутам запрещён"
    return None


@tool("run_python", "analysis", "Считаю на Python",
      "Выполнить произвольный расчёт на Python в песочнице. Доступны переменная DATA (список строк производства: w, line, product, shift, operator, supplier, orders, sheets, defects, revenue, cost, discount, downtime, late) и модули math, statistics, numpy. Результат положи в переменную result.",
      {"code": {"type": "string", "description": "код Python, итог в переменной result"}}, required=["code"],
      keywords=("посчитай", "рассчитай", "расчёт", "расчет", "корреляц", "python", "формул", "медиан"))
def run_python(ctx, code):
    err = check(code)
    if err:
        return Result(data=dict(error=err))
    data = S.ROWS if ctx["role"] == "ceo" else [{k: v for k, v in r.items() if k != "operator"} for r in S.ROWS]
    try:
        p = subprocess.run([sys.executable, "-I", "-c", RUNNER], input=json.dumps({"code": code, "data": data, "banned": sorted(BANNED)}),
                           capture_output=True, text=True, timeout=10)
    except subprocess.TimeoutExpired:
        return Result(data=dict(error="превышено время расчёта"))
    if p.returncode:
        return Result(data=dict(error=(p.stderr.strip().splitlines() or ["ошибка"])[-1][:300]))
    return Result(data=dict(json.loads(p.stdout.strip().splitlines()[-1]), summary="расчёт выполнен", note="код выполнен в песочнице без сети и файлов"), sources=[SRC["defects"]])
