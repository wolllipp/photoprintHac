"""Демо-парсинг истории, отбор фото и заглушки для остальных AI-этапов."""
import hashlib
import math
import re
from html import escape
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field

from app.ai.quality import MONTHS_RU, crop_rect, difference_hash, dhash_distance, effective_dpi
from app.config import settings

THEMES = {
    "travel": ("поездк", "путешеств", "карел", "отпуск", "море", "горы"),
    "child": ("ребён", "ребен", "малыш", "матвей", "первый год", "дет"),
    "wedding": ("свадьб",),
    "graduation": ("выпускн",),
    "newyear": ("нов", "год"),
    "love": ("love", "влюблён", "пара"),
    "family": ("семь", "дача", "бабушк"),
}
TONES = {"warm": ("тёпл", "тепл"), "bw": ("чёрно", "ч/б", "чб"), "bright": ("ярк",)}


def parse_story(text: str) -> dict:
    t = text.lower()
    theme = next((k for k, keys in THEMES.items() if any(w in t for w in keys)), "default")
    tone = next((k for k, keys in TONES.items() if any(w in t for w in keys)), None)
    m = re.search(r"(\d{1,3})\s*стр", t)
    pages = int(m.group(1)) if m else 24
    emphasis = "пейзажи" if "пейзаж" in t else None
    place = re.search(r"в\s+([А-ЯЁ][а-яё]+)", text)
    title = f"{place.group(1)}" if place else text.strip()[:40]
    return {"theme": theme, "tone": tone, "pages": pages, "emphasis": emphasis, "title": title}


class StoryResult(BaseModel):
    """Результат разбора описания книги."""

    model_config = ConfigDict(extra="forbid")
    theme: Literal["travel", "child", "wedding", "graduation", "newyear", "love", "family", "default"]
    tone: Literal["warm", "bw", "bright"] | None
    pages: int = Field(ge=1, le=200)
    emphasis: str | None
    title: str = Field(min_length=1, max_length=200)


class StoryIntent(BaseModel):
    """Проверенная команда пользователя для проекта."""

    model_config = ConfigDict(extra="forbid")
    action: Literal["remove_photo", "add_photo", "set_pages", "regenerate"]
    photo_ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)
    pages: int | None = Field(default=None, ge=1, le=200)


def _ollama_json(text: str, schema: type[BaseModel]) -> dict:
    """Запрашивает структурированный JSON у локальной Ollama."""
    response = httpx.post(
        f"{settings.ollama_url.rstrip('/')}/api/chat",
        json={
            "model": settings.ollama_model,
            "messages": [
                {"role": "system", "content": f"Отвечай только JSON по схеме: {schema.model_json_schema()}"},
                {"role": "user", "content": f"<client_text>\n{escape(text, quote=False)}\n</client_text>"},
            ],
            "format": "json",
            "stream": False,
            "options": {"temperature": 0},
        },
        timeout=settings.ollama_timeout_s,
    )
    response.raise_for_status()
    content = response.json()["message"]["content"]
    return schema.model_validate_json(content).model_dump(mode="json")


def parse_story_llm(text: str) -> dict:
    """Разбирает историю через Ollama; при любой ошибке использует regex."""
    try:
        return _ollama_json(text[:500], StoryResult)
    except Exception:
        return parse_story(text)


def parse_story_intent(text: str) -> dict:
    """Разбирает команду проекта через Ollama с безопасным regex-fallback."""
    try:
        return _ollama_json(text[:500], StoryIntent)
    except Exception:
        normalized = text.lower()
        match = re.search(r"(?:убери|удали|добавь|верни)\s+фото\s+(\d+)", normalized)
        if match:
            action = "add_photo" if normalized.startswith(("добавь", "верни")) else "remove_photo"
            return {"action": action, "photo_ids": [], "photo_number": int(match.group(1)), "pages": None}
        match = re.search(r"сделай\s+(\d{1,3})\s+страниц", normalized)
        if match and 1 <= int(match.group(1)) <= 200:
            return {"action": "set_pages", "photo_ids": [], "pages": int(match.group(1))}
        if "переделай" in normalized:
            return {"action": "regenerate", "photo_ids": [], "pages": None}
        return {"action": None, "photo_ids": [], "pages": None}


def _h(photo_id: uuid.UUID) -> int:
    return int(hashlib.md5(str(photo_id).encode()).hexdigest(), 16)


def _file_hash(path: Path) -> bytes:
    digest = hashlib.sha256()
    with path.open("rb") as image:
        for chunk in iter(lambda: image.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.digest()


def select_photos(
    photos: list[dict],
    pages: int,
    excluded_ids: set[uuid.UUID] | None = None,
    included_ids: set[uuid.UUID] | None = None,
    *,
    hashes: dict[uuid.UUID, bytes] | None = None,
    dhashes: dict[uuid.UUID, int] | None = None,
    min_keep: int = 0,
    pick: str | None = None,
    capacity: int | None = None,
) -> list[dict]:
    """Оставляет SHA-идентичные и визуально похожие фото вне книги как запас.

    min_keep — минимум фото для книги (минимум страниц тарифа): если после отбора фото меньше, похожие кадры
    возвращаются в книгу, лучшие первыми, — чтобы не было пустых страниц. Точные копии файла не возвращаются никогда.

    pick — ответ человека перед сборкой (None — как раньше):
      best — только лучшие: без похожих и около 60 % самых резких;
      most — почти все: без похожих кадров;
      all  — все, кроме смазанных (похожие остаются, точные копии файла — нет).
    capacity — сколько фото помещается в книгу при выбранном размере фото (страниц × фото на странице).
    """
    excluded_ids = excluded_ids or set()
    included_ids = included_ids or set()
    hashes = hashes if hashes is not None else {}
    dhashes = dhashes if dhashes is not None else {}
    available = [p for p in photos if p["photo_id"] not in excluded_ids]
    content_hashes, visual_hashes, sharpness = {}, {}, {}
    for photo in available:
        photo_id, path = photo["photo_id"], photo["path"]
        content_hash = hashes.get(photo_id)
        if content_hash is None:
            content_hash = _file_hash(Path(path))
            hashes[photo_id] = content_hash
        perceptual = dhashes.get(photo_id)
        if perceptual is None:
            image_bytes = Path(path).read_bytes()
            try:
                perceptual = difference_hash(image_bytes)
            except ValueError:
                # Файловые заглушки в тестах всё ещё участвуют в exact-hash.
                perceptual = int.from_bytes(hashlib.sha256(image_bytes).digest()[:8], "big")
            dhashes[photo_id] = perceptual
        content_hashes[photo_id] = content_hash
        visual_hashes[photo_id] = perceptual
        sharpness[photo_id] = photo.get("sharpness") or 0

    def rank(photo_id):
        return photo_id not in included_ids, -sharpness[photo_id], _h(photo_id)

    # Объединяем точные SHA-256 и близкие dHash пары в компоненты связности.
    parents = {photo_id: photo_id for photo_id in content_hashes}

    def root(photo_id):
        while parents[photo_id] != photo_id:
            parents[photo_id] = parents[parents[photo_id]]
            photo_id = parents[photo_id]
        return photo_id

    ids = list(content_hashes)
    for index, photo_id in enumerate(ids):
        for other in ids[index + 1:]:
            # «все» — похожие кадры остаются, склеиваем только точные копии файла
            if (content_hashes[photo_id] == content_hashes[other]
                    or (pick != "all" and dhash_distance(visual_hashes[photo_id], visual_hashes[other]) <= 8)):
                parents[root(other)] = root(photo_id)
    groups: dict[uuid.UUID, list[uuid.UUID]] = {}
    for photo_id in ids:
        groups.setdefault(root(photo_id), []).append(photo_id)
    duplicates = {photo_id for group in groups.values() if len(group) > 1
                  for photo_id in sorted(group, key=rank)[1:]}
    unique_ids = [p["photo_id"] for p in available if p["photo_id"] not in duplicates]
    blurry = {pid for pid in unique_ids if sharpness[pid] and sharpness[pid] < BLUR_SHARPNESS and pid not in included_ids}
    if pick is None:
        target = min(len(unique_ids), max(len(included_ids), round(pages * 1.6)))
    else:
        if pick == "all":
            unique_ids = [pid for pid in unique_ids if pid not in blurry]
        want = len(unique_ids) if pick != "best" else max(min_keep, round(len(unique_ids) * 0.6))
        target = min(len(unique_ids), max(len(included_ids), want, min_keep), capacity or len(unique_ids))
    keep = set(sorted(unique_ids, key=rank)[:target]) | (included_ids & set(content_hashes))
    if min_keep and len(keep) < min_keep:
        kept_hashes = {content_hashes[photo_id] for photo_id in keep if photo_id in content_hashes}
        for photo_id in sorted(duplicates, key=rank):
            if len(keep) >= min_keep:
                break
            if content_hashes[photo_id] in kept_hashes:
                continue  # точная копия уже стоящего фото — не берём
            keep.add(photo_id)
            kept_hashes.add(content_hashes[photo_id])
    return [{"photo_id": p["photo_id"], "selected": p["photo_id"] in keep,
             "reject_reason": None if p["photo_id"] in excluded_ids or p["photo_id"] in keep else
             "similar" if p["photo_id"] in duplicates else
             "blur" if pick == "all" and p["photo_id"] in blurry else "capacity"}
            for p in photos]


# порог «смазанного» — как в проверке качества (quality.py: sharpness < 100)
BLUR_SHARPNESS = 100
# размер фото из вопросов перед сборкой: в среднем и самое большее фото на странице
SIZE_DENSITY = {"large": (1.5, 2), "medium": (2.5, 4), "small": (3.5, 4)}


TEMPLATES = {
    1: ((0, 0, 1, 1),),
    2: ((0, 0, 0.5, 1), (0.5, 0, 0.5, 1)),
    3: ((0, 0, 1, 0.5), (0, 0.5, 0.5, 0.5), (0.5, 0.5, 0.5, 0.5)),
    4: ((0, 0, 0.5, 0.5), (0.5, 0, 0.5, 0.5),
        (0, 0.5, 0.5, 0.5), (0.5, 0.5, 0.5, 0.5)),
}
THEME_CHAPTERS = {"travel": "Путешествие", "child": "Детство", "wedding": "Свадьба",
                  "graduation": "Выпускной", "newyear": "Новый год", "love": "Любовь",
                  "family": "Семья"}


def _chapter(photo: dict) -> str:
    taken_at = photo["taken_at"]
    if taken_at is None:
        return "Без даты"
    if taken_at.tzinfo is not None:
        taken_at = taken_at.astimezone()
    return f"{taken_at.day} {MONTHS_RU[taken_at.month - 1]}"


def _chronological(photo: dict) -> tuple:
    taken_at = photo["taken_at"]
    if taken_at is None:
        return True, datetime.max.replace(tzinfo=timezone.utc)
    if taken_at.tzinfo is None:
        taken_at = taken_at.replace(tzinfo=timezone.utc)
    return False, taken_at.astimezone(timezone.utc)


def layout(selected: list[dict], page_count: int, min_pages: int = 1, page_aspect: float = 1,
           trim_px: int | None = None, risk_px: int | None = None, source: str = "picked",
           theme: str | None = None, format: str | None = None,
           product: str | None = None, size: str | None = None) -> list[dict]:
    """Сортирует фото по времени и раскладывает по шаблонам без пустых рамок.

    size — ответ перед сборкой: large — крупно (1–2 фото на странице), medium — как раньше (2–3),
    small — много мелких (3–4). None — как medium."""
    selected = sorted(selected, key=_chronological)
    requested = max(page_count, min_pages)
    groups: dict[str, list[dict]] = {}
    for photo in selected:
        chapter = THEME_CHAPTERS.get(theme, theme or "История") if source == "story" else _chapter(photo)
        groups.setdefault(chapter, []).append(photo)
    # коллажи: в среднем 2,5 фото на страницу (раньше — не больше 1,6, и почти везде было одно фото);
    # дни, которых больше, чем страниц, сливаются в общие главы, а не дробят книгу по одному фото
    avg, most = SIZE_DENSITY.get(size or "medium", SIZE_DENSITY["medium"])
    density_pages = math.ceil(len(selected) / avg) if size else (len(selected) * 2 + 4) // 5
    page_total = max(min_pages, density_pages,
                     sum((len(group) + most - 1) // most for group in groups.values()))
    page_total = min(requested, page_total)
    chunks = []
    chapters = []
    if len(groups) > page_total and selected:
        for index in range(page_total):
            start = len(selected) * index // page_total
            end = len(selected) * (index + 1) // page_total
            chunk = selected[start:end]
            chunks.append(chunk)
            chapters.append(" · ".join(dict.fromkeys(
                THEME_CHAPTERS.get(theme, theme or "История") if source == "story" else _chapter(photo)
                for photo in chunk
            )))
    else:
        allocations = [1] * len(groups)
        while sum(allocations) < page_total:
            candidates = [i for i, group in enumerate(groups.values()) if len(group) > allocations[i]]
            if not candidates:
                break
            group_sizes = [len(group) for group in groups.values()]
            index = max(candidates, key=lambda i: group_sizes[i] / allocations[i])
            allocations[index] += 1
        for (chapter, group), count in zip(groups.items(), allocations):
            for index in range(count):
                start = len(group) * index // count
                end = len(group) * (index + 1) // count
                chunks.append(group[start:end])
                chapters.append(chapter)
    while len(chunks) < page_total:
        chunks.append([])
        chapters.append("Без даты")
    # На странице не больше фото, чем есть шаблонов (TEMPLATES — до 4) и чем просили размером фото.
    # Много фото одного дня (альбом из историй) при немногих страницах давало страницу на 6 фото —
    # и сборка падала (KeyError). Лишние едут дальше по порядку, где есть место; совсем некуда — в запас.
    cap = min(most, max(TEMPLATES))
    carry: list[dict] = []
    for i, chunk in enumerate(chunks):
        cur = carry + chunk
        chunks[i], carry = cur[:cap], cur[cap:]
    for i in range(len(chunks) - 1, -1, -1):
        while carry and len(chunks[i]) < cap:
            chunks[i].append(carry.pop(0))
    out = []
    for pos, photos in enumerate(chunks):
        positions = TEMPLATES[len(photos)] if photos else ()
        frames = []
        for photo, (x, y, w, h) in zip(photos, positions):
            frame = {"x": x, "y": y, "w": w, "h": h}
            dpi = effective_dpi(photo.get("width") or 1, photo.get("height") or 1,
                                format, frame, book=True, spread=False) or 300
            # страница сборки — одна страница книги (как в приложении и в цене), не разворот
            crop = crop_rect(photo.get("width") or 1, photo.get("height") or 1,
                             photo.get("faces") or [], page_aspect * w / h, trim_px, risk_px,
                             dpi=dpi, risk_mm=5)
            frames.append({"photo_id": str(photo["photo_id"]), "frame": frame,
                           "crop": {key: crop[key] for key in ("x", "y", "w", "h")},
                           "warning": crop["warning"]})
        out.append({"position": pos, "chapter": chapters[pos], "frames": frames})
    return out


def auto_background(paths: list[str]) -> str:
    """Фон «ИИ подберёт»: по средней яркости фото книги (до 12 первых). Тёмные кадры — тёмный фон,
    очень светлые — бежевый (белое на белом теряется), остальное — белый."""
    from PIL import Image, ImageOps, ImageStat

    values = []
    for path in paths[:12]:
        try:
            with Image.open(path) as im:
                im = ImageOps.exif_transpose(im).convert("L")
                im.thumbnail((64, 64))
                values.append(ImageStat.Stat(im).mean[0] / 255)
        except Exception:
            continue
    if not values:
        return "white"
    mean = sum(values) / len(values)
    return "dark" if mean < 0.35 else "beige" if mean > 0.7 else "white"


def captions(theme: str, pages: int) -> list[str]:
    return []
