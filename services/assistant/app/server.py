"""HTTP-слой: чат по SSE, подтверждения, файлы, журнал. Роль берётся из заголовка (в продукте — из JWT CRM)."""
from __future__ import annotations

import json

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from . import agent, llm, policy
from .registry import REGISTRY, load_plugins, tools_for
from .tools._common import OUT

load_plugins()
app = FastAPI(title="picPac Ассистент")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
ROLES = ("ceo", "manager")


def role_of(x_role: str | None) -> str:
    if x_role not in ROLES:
        raise HTTPException(403, "У этой роли нет доступа к ассистенту")
    return x_role


class ChatIn(BaseModel):
    message: str
    history: list[dict] = []
    session: str = ""


@app.get("/meta")
def meta(x_role: str | None = Header(None)):
    role = x_role if x_role in ROLES else "ceo"
    return dict(online=llm.available(), model=llm.MODEL,
                tools=[dict(name=t.name, label=t.label, group=t.group, risk=t.risk, description=t.description) for t in tools_for(role)])


@app.post("/chat")
def chat(body: ChatIn, x_role: str | None = Header(None)):
    role = role_of(x_role)
    def gen():
        for ev in agent.run(role, body.message, body.history, {"session": body.session}):
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.post("/actions/{pid}/{verb}")
def action(pid: str, verb: str, x_role: str | None = Header(None)):
    if verb not in ("confirm", "reject"):
        raise HTTPException(404)
    return policy.Pending.resolve(pid, role_of(x_role), verb == "confirm")


@app.get("/files/{name:path}")
def files(name: str):
    p = (OUT / name).resolve()
    if not p.is_relative_to(OUT.resolve()) or not p.is_file():
        raise HTTPException(404)
    return FileResponse(p, filename=p.name)


@app.get("/audit")
def audit(x_role: str | None = Header(None)):
    if role_of(x_role) != "ceo":
        raise HTTPException(403, "Журнал доступен руководителю")
    return policy.Audit.items[-200:]
