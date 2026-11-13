"""«ИИ: исправить» в редакторе: замечание человека → одна команда из известного списка.

Модель (Qwen через Ollama, локально) только ПОНИМАЕТ фразу — «поменьше», «сделай скромнее», «удали эту»,
«пусть будет три фотки». Выполняет команду приложение обычным кодом, поэтому модель не может «сломать» книгу:
худшее — неверно поняла, тогда честное «Не поняла». Модели нет или она ответила не по схеме — те же команды
по правилам (parse_edit_rules), они понимают основные формулировки.
"""
import json
import logging
import re
import time
from html import escape
from typing import Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field

from app.config import settings

log = logging.getLogger("uvicorn.error")

Action = Literal[
    "shrink",           # фото поменьше (поля вокруг)
    "enlarge",          # это фото крупнее, на всю страницу
    "remove_photo",     # убрать фото, на котором точка
    "replace_photo",    # заменить это фото другим
    "replace_page",     # заменить все фото страницы
    "set_count",        # сколько фото на странице (count: 1–4)
    "fewer_people",     # меньше людей / селфи
    "more_people",      # больше людей
    "more_landscapes",  # больше пейзажей, природы, видов
    "enhance",          # улучшить фото (fx)
    "caption",          # подписать страницу (text)
    "unknown",          # не про книгу или непонятно
]
Fx = Literal["light", "crop", "sharp", "horizon", "warm", "bg", "restore", "bw"]


class EditCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Action
    count: int | None = Field(default=None, ge=1, le=4)
    fx: Fx | None = None
    text: str | None = Field(default=None, max_length=120)


# Подсказка модели: что значит каждая команда — коротко и с примерами живых формулировок
PROMPT = """Ты помогаешь править фотокнигу. Человек поставил точку на фото и написал, что сделать.
Верни ОДНУ команду JSON: {"action": ..., "count": число или null, "fx": ... или null, "text": ... или null}.

action:
- shrink — сделать фото меньше: «поменьше», «уменьши», «сделай скромнее», «не на всю страницу»
- enlarge — это фото крупнее: «крупнее», «увеличь», «на всю страницу», «побольше»
- remove_photo — убрать это фото: «убери», «удали это», «не надо этого фото»
- replace_photo — заменить это фото другим: «замени», «другое фото», «поменяй фотку»
- replace_page — заменить все фото на странице: «другие фото сюда», «замени всё»
- set_count — сколько фото на странице, count 1–4: «три фото», «пусть будет две», «сделай коллаж из четырёх»
- fewer_people — меньше людей: «убери селфи», «меньше людей», «без лиц»
- more_people — больше людей: «больше людей», «где мы вместе»
- more_landscapes — больше пейзажей: «больше природы», «пейзажи», «виды»
- enhance — улучшить фото, fx: light (свет и цвет, ярче, темно), sharp (чётче, шум, размыто), crop (кадр по лицам),
  horizon (выровнять горизонт, криво), warm (теплее), bg (убрать лишнее с фона), restore (старое фото), bw (чёрно-белое)
- caption — подписать страницу, text — только сама подпись, без слова «подпиши»: «подпиши: лето у бабушки» → text «лето у бабушки»
- unknown — непонятно или не про книгу

Примеры:
«тут слишком темно» → {"action": "enhance", "fx": "light"}
«фотка кривая» → {"action": "enhance", "fx": "horizon"}
«оставь только одну» → {"action": "set_count", "count": 1}
«сделай чёрно-белым» → {"action": "enhance", "fx": "bw"}
«какая погода» → {"action": "unknown"}

Отвечай только JSON, без пояснений."""


def _ollama(text: str) -> EditCommand:
    schema = EditCommand.model_json_schema()
    started = time.monotonic()
    response = httpx.post(
        f"{settings.ollama_url.rstrip('/')}/api/chat",
        json={
            "model": settings.edit_model or settings.ollama_model,
            "messages": [
                {"role": "system", "content": PROMPT},
                {"role": "user", "content": f"<client_text>\n{escape(text[:300], quote=False)}\n</client_text>"},
            ],
            # Ollama ограничивает ответ JSON-схемой: лишнего поля или чужого action не будет
            "format": schema,
            "stream": False,
            "keep_alive": "30m",
            "options": {"temperature": 0},
        },
        timeout=settings.ollama_timeout_s,
    )
    response.raise_for_status()
    cmd = EditCommand.model_validate(json.loads(response.json()["message"]["content"]))
    log.info("edit: модель %.1f с → %s", time.monotonic() - started, cmd.model_dump(exclude_none=True))
    return cmd


FX_WORDS: list[tuple[str, str]] = [
    (r"горизонт|криво|завален", "horizon"),
    (r"ч[её]рно-?бел|ч/б|монохром", "bw"),
    (r"т[её]пл", "warm"),
    (r"ч[её]тк|шум|размыт|резк", "sharp"),
    (r"фон", "bg"),
    (r"стар(ое|ую|ый)|восстан|царапин", "restore"),
    (r"кадр по лиц|по лицам", "crop"),
    (r"св[еe]т|ярч|ярк|темн|тускл|цвет", "light"),
]
COUNTS = {"одн": 1, "дв": 2, "тр": 3, "четыр": 4}


def parse_edit_rules(text: str) -> EditCommand:
    """Без модели: основные формулировки — по словам. Порядок важен: сначала самое определённое."""
    t = f" {text.lower().strip()} "
    cap = re.search(r"подпиш\w*\s*[:—-]?\s*(.+)", text, re.I)
    if cap and cap.group(1).strip():
        return EditCommand(action="caption", text=cap.group(1).strip()[:120])
    for pattern, fx in FX_WORDS:
        if re.search(pattern, t):
            return EditCommand(action="enhance", fx=fx)
    if re.search(r"селфи|меньше люд|без люд|без лиц|меньше лиц", t):
        return EditCommand(action="fewer_people")
    if re.search(r"больше люд|больше лиц|где мы|вместе", t):
        return EditCommand(action="more_people")
    if re.search(r"пейзаж|природ|вид(ов|ы)\b", t):
        return EditCommand(action="more_landscapes")
    m = re.search(r"\b(одн|дв|тр|четыр|[1-4])\w*\s+(фот|кадр|снимк)", t)
    if m:
        g = m.group(1)
        return EditCommand(action="set_count", count=int(g) if g.isdigit() else COUNTS[g])
    if re.search(r"только одн|оставь одн|одну оставь", t):
        return EditCommand(action="set_count", count=1)
    if re.search(r"коллаж", t):
        return EditCommand(action="set_count", count=4)
    if re.search(r"(по)?меньш|уменьш|скромн|не на всю", t):
        return EditCommand(action="shrink")
    if re.search(r"крупн|увелич|побольш|на всю страниц|больше\b", t):
        return EditCommand(action="enlarge")
    if re.search(r"убер|убра|удал|не надо|лишн", t):
        return EditCommand(action="remove_photo")
    if re.search(r"(замени|поменяй|другие|другое).*(вс[её]|страниц)|вс[её].*(замени|поменяй)", t):
        return EditCommand(action="replace_page")
    if re.search(r"замен|поменя|друг(ое|ую|ой)|не то", t):
        return EditCommand(action="replace_photo")
    return EditCommand(action="unknown")


def parse_edit(text: str) -> tuple[dict, str]:
    """Команда для замечания и откуда она: «llm» — поняла модель, «rules» — правила (модели нет или не поняла)."""
    rules = parse_edit_rules(text)
    try:
        cmd = _ollama(text)
        # модель не поняла, а правила поняли — берём правила (например, точное название кнопки)
        if cmd.action == "unknown" and rules.action != "unknown":
            return rules.model_dump(), "rules"
        if cmd.action == "set_count" and not cmd.count:
            cmd.count = rules.count or 1
        # какое именно улучшение — у правил точнее (маленькая модель путает «темно» с «теплее», «криво» с кадром)
        if cmd.action == "enhance":
            cmd.fx = rules.fx if rules.action == "enhance" else (cmd.fx or "light")
        # текст подписи — без «подпиши:»
        if cmd.action == "caption":
            cmd.text = rules.text if rules.action == "caption" else re.sub(r"^\s*подпиш\w*\s*[:—-]?\s*", "", cmd.text or "", flags=re.I)
        # text нужен только подписи — модель иногда повторяет в нём фразу
        if cmd.action != "caption":
            cmd.text = None
        return cmd.model_dump(), "llm"
    except Exception as e:
        log.info("edit: модель недоступна (%s) — правила", type(e).__name__)
        return rules.model_dump(), "rules"
