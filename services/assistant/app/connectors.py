"""Коннекторы к системам компании. Инструменты общаются только с этими интерфейсами,
поэтому подключение реального мессенджера или CRM = новый адаптер + переменная окружения, без правок инструментов.

ASSISTANT_MESSENGER = demo (по умолчанию) | webhook | telegram
  webhook: POST {ASSISTANT_MESSENGER_URL} {"to": роль, "text": ..., "from": "picPac Ассистент"}
           ответ JSON {"reply": "..."} — если коллега ответил сразу; иначе {} (ответ придёт позже)
  telegram: Bot API. ASSISTANT_TG_TOKEN и ASSISTANT_TG_CHATS='{"Технолог печати": 123456, ...}' (роль → chat_id).
           Ответ коллеги придёт позже: бот принимает его через getUpdates (см. TelegramMessenger.replies).
ASSISTANT_DATA_URL = JSON в формате data/demo.json (выгрузка витрин CRM); пусто = демо-данные
"""
from __future__ import annotations

import os
from typing import Protocol

import httpx


class Messenger(Protocol):
    def send(self, to: str, text: str) -> dict: ...  # {"delivered": bool, "reply": str | None}


class DemoMessenger:
    """Ответы коллег заготовлены. Только для демо."""
    CANNED = {
        "Технолог печати": "Калибровку после простоя 27.10 не проводили, ждали наладчика. Сделаем сегодня до ночной смены.",
        "Менеджер закупок": "Протокол входного контроля партии РБ-1141 не нашёл. Запросил у поставщика, ответ обещали завтра.",
        "Руководитель смен": "В ночную смену на Ricoh было 3 человека вместо 4, двое новых без наставника.",
        "Начальник производства": "Принял, проверю линию и отвечу до конца дня.",
        "Директор по развитию": "По акции жду ваше решение по лимиту скидки.",
    }
    outbox: list[dict] = []

    def send(self, to, text):
        reply = self.CANNED.get(to, "Принял.")
        self.outbox.append(dict(to=to, text=text, reply=reply))
        return dict(delivered=True, reply=reply)


class WebhookMessenger:
    def __init__(self, url: str):
        self.url = url

    def send(self, to, text):
        try:
            r = httpx.post(self.url, json={"to": to, "text": text, "from": "picPac Ассистент"}, timeout=15)
            r.raise_for_status()
            return dict(delivered=True, reply=(r.json() or {}).get("reply"))
        except Exception as e:
            return dict(delivered=False, reply=None, error=str(e)[:120])


class TelegramMessenger:
    """Отправка в Telegram через Bot API. Адресаты — роли из справочника, chat_id задаёт администратор.
    Ответы читаются через replies(): getUpdates с отметкой последнего обработанного сообщения."""
    def __init__(self, token: str, chats: dict[str, int]):
        self.api, self.chats, self.offset = f"https://api.telegram.org/bot{token}", chats, 0

    def send(self, to, text):
        chat = self.chats.get(to)
        if chat is None:
            return dict(delivered=False, reply=None, error=f"для роли «{to}» не задан chat_id")
        try:
            r = httpx.post(f"{self.api}/sendMessage", json={"chat_id": chat, "text": f"picPac Ассистент:\n{text}"}, timeout=15)
            r.raise_for_status()
            return dict(delivered=True, reply=None)
        except Exception as e:
            return dict(delivered=False, reply=None, error=str(e)[:120])

    def replies(self) -> list[dict]:
        r = httpx.get(f"{self.api}/getUpdates", params={"offset": self.offset, "timeout": 0}, timeout=15).json()
        out = []
        by_chat = {v: k for k, v in self.chats.items()}
        for u in r.get("result", []):
            self.offset = u["update_id"] + 1
            m = u.get("message") or {}
            if m.get("chat", {}).get("id") in by_chat and m.get("text"):
                out.append(dict(role=by_chat[m["chat"]["id"]], text=m["text"]))
        return out


def messenger() -> Messenger:
    if os.getenv("ASSISTANT_MESSENGER") == "telegram" and os.getenv("ASSISTANT_TG_TOKEN"):
        import json
        return TelegramMessenger(os.environ["ASSISTANT_TG_TOKEN"], json.loads(os.getenv("ASSISTANT_TG_CHATS", "{}")))
    if os.getenv("ASSISTANT_MESSENGER") == "webhook" and os.getenv("ASSISTANT_MESSENGER_URL"):
        return WebhookMessenger(os.environ["ASSISTANT_MESSENGER_URL"])
    return DemoMessenger()


def load_data() -> dict:
    import json
    from pathlib import Path
    url = os.getenv("ASSISTANT_DATA_URL")
    if url:
        return httpx.get(url, timeout=30).json()
    return json.loads((Path(__file__).resolve().parent.parent / "data" / "demo.json").read_text())
