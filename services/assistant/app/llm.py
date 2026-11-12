"""Адаптер модели: любой OpenAI-совместимый сервер (Ollama на ноутбуке, vLLM на H200)."""
from __future__ import annotations

import os
import re

import httpx

URL = os.getenv("ASSISTANT_LLM_URL", "http://localhost:11434/v1")
MODEL = os.getenv("ASSISTANT_MODEL", "qwen3:4b-instruct")


def available() -> bool:
    try:
        return httpx.get(f"{URL}/models", timeout=2).status_code == 200
    except Exception:
        return False


def complete(messages: list[dict], tools: list[dict] | None = None) -> dict:
    body = {"model": MODEL, "messages": messages, "stream": False, "temperature": 0.2}
    if tools:
        body["tools"] = tools
    r = httpx.post(f"{URL}/chat/completions", json=body, timeout=300)
    r.raise_for_status()
    m = r.json()["choices"][0]["message"]
    m["content"] = re.sub(r"<think>.*?</think>", "", m.get("content") or "", flags=re.S).strip()
    return m
