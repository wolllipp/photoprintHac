"""Адаптер модели: любой OpenAI-совместимый сервер (Ollama на ноутбуке, vLLM на H200)."""
from __future__ import annotations

import json
import os
import re
import time
from typing import Iterator

import httpx

URL = os.getenv("ASSISTANT_LLM_URL", "http://localhost:11434/v1")
MODEL = os.getenv("ASSISTANT_MODEL", "qwen3:4b-instruct")
KEY = os.getenv("ASSISTANT_LLM_KEY", "")  # ключ внешнего API, только из окружения, в репозиторий не кладём
HEADERS = {"Authorization": f"Bearer {KEY}"} if KEY else {}


def available() -> bool:
    try:
        return httpx.get(f"{URL}/models", headers=HEADERS, timeout=5).status_code == 200
    except Exception:
        return False


def complete(messages: list[dict], tools: list[dict] | None = None) -> dict:
    body = {"model": MODEL, "messages": messages, "stream": False, "temperature": 0.2}
    if tools:
        body["tools"] = tools
    r = httpx.post(f"{URL}/chat/completions", json=body, headers=HEADERS, timeout=300)
    r.raise_for_status()
    m = r.json()["choices"][0]["message"]
    m["content"] = re.sub(r"<think>.*?</think>", "", m.get("content") or "", flags=re.S).strip()
    return m


_THINK = re.compile(r"<think>.*?</think>", re.S)


def _visible(raw: str) -> str:
    """Текст без блоков размышлений, в том числе незакрытых и обрывающихся на середине тега: их пользователю не показываем."""
    t = _THINK.sub("", raw)
    i = t.find("<think>")
    if i >= 0:
        t = t[:i]
    for k in range(min(len("<think>") - 1, len(t)), 0, -1):  # хвост «<thi» ждёт продолжения
        if "<think>".startswith(t[-k:]):
            return t[:-k]
    return t


def stream(messages: list[dict], tools: list[dict] | None = None) -> Iterator[dict]:
    """Ответ модели по кускам. Выдаёт {"delta": текст} по мере генерации и в конце {"message": как у complete()}.
    Вызовы инструментов приходят кусками и собираются здесь же. Сетевой сбой до первого куска повторяется один раз."""
    for attempt in (0, 1):
        started = False
        try:
            for part in _stream_once(messages, tools):
                started = True
                yield part
            return
        except httpx.TransportError:
            if started or attempt:
                raise
            time.sleep(1.5)


def _stream_once(messages: list[dict], tools: list[dict] | None) -> Iterator[dict]:
    body = {"model": MODEL, "messages": messages, "stream": True, "temperature": 0.2}
    if tools:
        body["tools"] = tools
    raw, shown, calls = "", "", {}
    with httpx.stream("POST", f"{URL}/chat/completions", json=body, headers=HEADERS, timeout=300) as r:
        if r.status_code >= 400:
            r.read()
            r.raise_for_status()
        for line in r.iter_lines():
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                d = json.loads(data)["choices"][0].get("delta") or {}
            except (ValueError, KeyError, IndexError):
                continue
            if d.get("content"):
                raw += d["content"]
                vis = _visible(raw)
                if len(vis) > len(shown):
                    yield {"delta": vis[len(shown):]}
                    shown = vis
            for c in d.get("tool_calls") or []:
                x = calls.setdefault(c.get("index", len(calls)), {"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
                x["id"] = c.get("id") or x["id"]
                f = c.get("function") or {}
                x["function"]["name"] += f.get("name") or ""
                a = f.get("arguments")
                if isinstance(a, dict):
                    x["function"]["arguments"] = json.dumps(a, ensure_ascii=False)
                elif a:
                    x["function"]["arguments"] += a
    out = [dict(c, id=c["id"] or f"call_{i}") for i, c in sorted(calls.items())]
    m = {"role": "assistant", "content": shown.strip()}
    if out:
        m["tool_calls"] = out
    yield {"message": m}
