"""MCP-сервер поверх реестра инструментов: любой MCP-клиент (Claude, CRM, другой агент) вызывает те же инструменты.

Запуск: ASSISTANT_MCP_ROLE=ceo uv run python -m app.mcp_server        (stdio)
Роль фиксируется на запуске сервера, права проверяются как в чате: инструментов вне роли нет в списке.
Запись и внешние действия НЕ выполняются через MCP: инструмент возвращает pending_action_id, а подтвердить
может только человек в интерфейсе CRM (POST /actions/{id}/confirm). Тексты клиентов и коллег помечены недоверенными.
"""
from __future__ import annotations

import inspect
import json
import os
from typing import Any, Optional

from mcp.server.mcpserver import MCPServer

from . import policy
from .registry import Result, Tool, load_plugins, tools_for

ROLE = os.getenv("ASSISTANT_MCP_ROLE", "manager")  # по умолчанию меньше прав
load_plugins()
mcp = MCPServer("picpac-assistant")


def _wrap(t: Tool):
    def call(**kwargs) -> str:
        res: Result = t.fn({"role": ROLE}, **{k: v for k, v in kwargs.items() if v is not None and k in t.parameters["properties"]})
        out = dict(res.data)
        out["sources"] = res.sources
        if res.artifacts:
            out["artifacts"] = [a["url"] for a in res.artifacts]
        if res.proposal:
            out["pending_action_id"] = policy.Pending.add(ROLE, res.proposal, t.name)
            out["note"] = "Действие подготовлено, но не выполнено: подтвердить может человек в CRM (POST /actions/{id}/confirm)."
        body = json.dumps(out, ensure_ascii=False, default=str)
        policy.Audit.add(ROLE, f"mcp:{t.name}", [t.name], [], [], body[:200], "mcp")
        return policy.untrusted_block(body) if res.untrusted else body
    # схема аргументов берётся из описания инструмента: MCPServer строит её по сигнатуре функции
    py = {"string": str, "integer": int, "number": float, "boolean": bool, "array": list, "object": dict}
    params = []
    for k, spec in t.parameters["properties"].items():
        typ = py.get(spec.get("type"), Any)
        if k in t.parameters.get("required", []):
            params.append(inspect.Parameter(k, inspect.Parameter.KEYWORD_ONLY, annotation=typ))
        else:
            params.append(inspect.Parameter(k, inspect.Parameter.KEYWORD_ONLY, default=None, annotation=Optional[typ]))
    call.__signature__ = inspect.Signature(params, return_annotation=str)
    call.__annotations__ = {p.name: p.annotation for p in params} | {"return": str}
    call.__name__, call.__doc__ = t.name, t.description
    return call


def build() -> MCPServer:
    for t in tools_for(ROLE):
        mcp.tool(name=t.name, description=t.description)(_wrap(t))
    return mcp


if __name__ == "__main__":
    build().run()
