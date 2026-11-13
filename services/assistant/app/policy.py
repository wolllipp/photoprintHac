"""Политика: маскирование ПДн, недоверенные тексты, подтверждения, журнал, проверка чисел в ответе."""
from __future__ import annotations

import re
import time
import uuid
from datetime import datetime

from .registry import Proposal

NAMES = ["Анна Тестова"]  # словарь имён из данных; в продукте строится из CRM
_PHONE = re.compile(r"\+?\d[\d\s\-()]{8,}\d")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_INJECT = re.compile(r"игнорируй|забудь (все )?(предыдущ|инструкц)|ignore (all )?(previous|prior)|system prompt|"
                     r"системн\S* промпт|ты теперь|выведи зарплат|без подтверждени", re.I)


def mask(text: str) -> str:
    for n in NAMES:
        text = text.replace(n, "[имя]")
    return _EMAIL.sub("[почта]", _PHONE.sub("[телефон]", text))


def injection(text: str) -> bool:
    return bool(_INJECT.search(text))


def untrusted_block(text: str) -> str:
    """Текст клиентов, документы, ответы коллег: модели отдаются как данные, не как команды."""
    return f"<untrusted_data>\n{mask(text)}\n</untrusted_data>"


# ---------- подтверждения ----------
class Pending:
    items: dict[str, dict] = {}

    @classmethod
    def add(cls, role: str, p: Proposal, tool: str) -> str:
        pid = "A" + uuid.uuid4().hex[:8]
        cls.items[pid] = dict(role=role, proposal=p, tool=tool, state="pending")
        return pid

    @classmethod
    def resolve(cls, pid: str, role: str, ok: bool) -> dict:
        it = cls.items.get(pid)
        if not it or it["state"] != "pending":
            return dict(ok=False, error="действие не найдено или уже обработано")
        if it["role"] != role:
            return dict(ok=False, error="подтвердить может только тот, для кого оно подготовлено")
        it["state"] = "confirmed" if ok else "rejected"
        msg = it["proposal"].commit() if ok else "Отклонено, ничего не выполнено."
        Audit.add(role, f"{'подтверждено' if ok else 'отклонено'}: {it['proposal'].title}", [it["tool"]], [], [], msg, "confirm")
        return dict(ok=True, message=msg)


# ---------- журнал ----------
class Audit:
    items: list[dict] = []

    @classmethod
    def add(cls, role, question, tools, denied, flags, answer, mode):
        cls.items.append(dict(ts=datetime.now().isoformat(timespec="seconds"), role=role,
                              question=mask(question), tools=tools, denied=denied, flags=flags,
                              answer=mask(answer)[:600], mode=mode))


# ---------- проверка чисел ----------
_NUM = re.compile(r"\d[\d\s ]*(?:[.,]\d+)?")


def _norm(s: str) -> str:
    return re.sub(r"[\s ]", "", s).replace(",", ".").rstrip(".")


def ungrounded_numbers(answer: str, evidence: str) -> list[str]:
    """Числа из ответа, которых нет в результатах инструментов. Цифры считает код, модель их не придумывает.
    Однозначные целые пропускаем: порядковые номера, «2 недели», [1]."""
    ev = _norm(evidence)
    ev_nums = {_norm(m) for m in _NUM.findall(evidence)}
    bad = []
    answer = re.sub(r"\b(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])(\.\d{2,4})?\b|\b(19|20)\d\d\b", "", re.sub(r"\[\d+(,\s*\d+)*\]", "", answer))
    for m in _NUM.findall(answer):
        n = _norm(m)
        if not n or ("." not in n and len(n) <= 1):
            continue
        if n in ev_nums or n in ev:
            continue
        try:  # допускаем округление: 4.69 в данных, 4.7 в ответе
            x = float(n)
            if any(abs(x - float(e)) <= max(0.06, 0.006 * abs(float(e))) for e in ev_nums if re.fullmatch(r"-?\d+(\.\d+)?", e)):
                continue
        except ValueError:
            pass
        bad.append(m.strip())
    return bad[:5]


_URL = re.compile(r"https?://[^\s)\]>]+")
_CLAIM = re.compile(r"(обновлен|добавлен|создан|отправлен|сохранён|сохранен|изменен|загружен)\w*", re.I)


def fabricated_links(answer: str, evidence: str) -> list[str]:
    """Ссылки в ответе, которых не было в результатах инструментов. Ассистент не публикует файлы наружу."""
    return [u for u in _URL.findall(answer) if u not in evidence]


def claims_action_without_tool(answer: str, used_tools: list[str]) -> bool:
    """Модель пишет «обновлено/отправлено», хотя в этом ответе не вызвала ни одного инструмента."""
    return not used_tools and bool(_CLAIM.search(answer))


_WANTS_FILE = re.compile(r"презентац|слайд|docx|xlsx|excel|word|служебн\w* записк|документ\b|таблиц\w* excel", re.I)
_MAKERS = {"make_slides", "run_python", "build_docx", "report_docx", "workbook_xlsx"}


_FILE_NOTES = ("пользователь просил файл", "файл создан, но")


def is_text_problem(problem: str) -> bool:
    """Замечание к самому тексту (выдуманная ссылка, число без источника, ложное «выполнено»). Замечание про файл текст не портит:
    сказанное остаётся вступлением в чате, и показанный текст не стираем."""
    return not problem.startswith(_FILE_NOTES)


def review(answer: str, evidence: str, used: list[str], question: str = "") -> list[str]:
    """Проблемы ответа, которые модель исправляет сама: выдуманные ссылки, действия без инструмента, числа без источника."""
    out = []
    links = fabricated_links(answer, evidence)
    if links:
        out.append(f"ссылки {', '.join(links)} не получены из инструментов; ассистент не создаёт и не публикует ссылок, кроме карточек файлов")
    if claims_action_without_tool(answer, used):
        out.append("в ответе сказано, что действие выполнено, но ни один инструмент не вызывался")
    if _WANTS_FILE.search(question) and not (_MAKERS & set(used)):
        out.append("пользователь просил файл (презентацию или документ), а файл не создан: презентацию сделай инструментом make_slides, документ или таблицу через run_python (по своим знаниям, если тема общая)")
    elif _WANTS_FILE.search(question) and (_MAKERS & set(used)) and not ({"show_files", "recent_files"} & set(used)):
        out.append("файл создан, но пользователь его не видит: покажи готовые файлы через show_files (имена из результата инструмента)")
    bad = ungrounded_numbers(answer, evidence) if evidence else []
    if bad:
        out.append("числа " + ", ".join(dict.fromkeys(bad)) + " не подтверждены данными")
    return out
