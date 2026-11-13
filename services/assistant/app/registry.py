"""Реестр инструментов. Новая возможность ассистента = один файл в app/tools/ с функцией под @tool.

Контракт: fn(ctx, **args) -> Result. Права проверяются здесь, до вызова, а не в промпте.
risk: read — только чтение; write — запись в систему; external — действие вовне (сообщение, письмо).
Для write/external функция НЕ выполняет действие, а возвращает Result.proposal с commit-функцией:
выполнится только после подтверждения человеком (см. policy.Pending).
"""
from __future__ import annotations

import importlib
import pkgutil
from dataclasses import dataclass, field
from typing import Any, Callable

ALL_ROLES = ("ceo", "manager")


@dataclass
class Proposal:
    title: str
    details: dict
    commit: Callable[[], str]  # вызывается после подтверждения, возвращает текст итога


@dataclass
class Result:
    data: dict = field(default_factory=dict)       # то, что видит модель (числа посчитаны кодом)
    sources: list[dict] = field(default_factory=list)  # {name, kind, detail}
    artifacts: list[dict] = field(default_factory=list)  # {kind: image|file, name, url, title}
    files: list[dict] = field(default_factory=list)      # файлы, сохранённые в рабочую папку чата; пользователю не показываются, пока модель не вызовет show_files
    proposal: Proposal | None = None
    untrusted: bool = False  # тексты клиентов/коллег: модель получает их как данные


@dataclass
class Tool:
    name: str
    group: str
    label: str            # человекочитаемо, для строки шага в чате
    description: str
    parameters: dict
    fn: Callable[..., Result]
    risk: str = "read"
    roles: tuple = ALL_ROLES
    keywords: tuple = ()  # для маршрутизации: слабой модели отдаём 6–8 релевантных инструментов, а не все

    def schema(self) -> dict:
        return {"type": "function", "function": {"name": self.name, "description": self.description,
                                                  "parameters": self.parameters}}


REGISTRY: dict[str, Tool] = {}


def tool(name, group, label, description, params=None, required=(), risk="read", roles=ALL_ROLES, keywords=()):
    def deco(fn):
        REGISTRY[name] = Tool(name, group, label, description,
                              {"type": "object", "properties": params or {}, "required": list(required)},
                              fn, risk, tuple(roles), tuple(keywords))
        return fn
    return deco


def load_plugins() -> None:
    from . import tools
    for m in pkgutil.iter_modules(tools.__path__):
        importlib.import_module(f"{tools.__name__}.{m.name}")


def tools_for(role: str) -> list[Tool]:
    return [t for t in REGISTRY.values() if role in t.roles]


def route(role: str, question: str, limit: int = 8) -> list[Tool]:
    """Отбор инструментов под вопрос: у модели 4–8B вызов точнее, когда выбор небольшой."""
    q = question.lower()
    avail = tools_for(role)
    if len(avail) <= limit:
        return avail
    def score(t: Tool) -> int:
        s = sum(3 for k in t.keywords if k in q)
        s += sum(1 for w in t.label.lower().split() if len(w) > 4 and w[:5] in q)
        return s
    ranked = sorted(avail, key=score, reverse=True)
    picked = [t for t in ranked if score(t) > 0][:limit]
    for t in ranked:  # добираем базовыми, чтобы всегда было из чего выбрать
        if len(picked) >= min(limit, 5):
            break
        if t not in picked and t.group in ("analysis", "knowledge"):
            picked.append(t)
    for t in avail:  # рабочее место и знания о системе доступны всегда
        if (t.group == "workspace" or t.name == "search_docs") and t not in picked:
            picked.append(t)
    return picked
