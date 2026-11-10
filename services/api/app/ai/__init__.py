"""Демо-парсинг истории, отбор фото и заглушки для остальных AI-этапов."""
import hashlib
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.ai.quality import DPI_LIMITS, MONTHS_RU, crop_rect, quality_report

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
    dpi_limit: tuple[int, int] = DPI_LIMITS["20x20_spread"],
) -> list[dict]:
    """Выбирает уникальные фото по качеству; ручной выбор имеет приоритет."""
    excluded_ids = excluded_ids or set()
    included_ids = included_ids or set()
    hashes = hashes if hashes is not None else {}
    groups: dict[bytes, list[uuid.UUID]] = {}
    scores = {}
    for photo in photos:
        photo_id, path = photo["photo_id"], photo["path"]
        content_hash = hashes.get(photo_id)
        if content_hash is None:
            content_hash = _file_hash(Path(path))
            hashes[photo_id] = content_hash
        scores[photo_id] = quality_report(photo, dpi_limit)["score"]
        if photo_id not in excluded_ids:
            groups.setdefault(content_hash, []).append(photo_id)

    def rank(photo_id):
        return photo_id not in included_ids, -scores[photo_id], _h(photo_id)

    duplicates = {
        photo_id
        for group in groups.values() if len(group) > 1
        for photo_id in sorted(group, key=rank)[1:]
    }
    unique_ids = [photo["photo_id"] for photo in photos
                  if photo["photo_id"] not in excluded_ids | duplicates]
    target = min(len(unique_ids), max(0, round(pages * 1.6)))
    keep = set(sorted(unique_ids, key=rank)[:target])
    return [
        {"photo_id": photo["photo_id"], "selected": photo["photo_id"] in keep,
         "reject_reason": None if photo["photo_id"] in excluded_ids or photo["photo_id"] in keep else
         "duplicate" if photo["photo_id"] in duplicates else "capacity"}
        for photo in photos
    ]


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
           trim_px: int = 30, risk_px: int = 60, source: str = "picked", theme: str | None = None) -> list[dict]:
    """Сортирует фото по времени и раскладывает по шаблонам без пустых рамок."""
    selected = sorted(selected, key=_chronological)
    requested = max(page_count, min_pages)
    groups: dict[str, list[dict]] = {}
    for photo in selected:
        chapter = THEME_CHAPTERS.get(theme, theme or "История") if source == "story" else _chapter(photo)
        groups.setdefault(chapter, []).append(photo)
    density_pages = (len(selected) * 5 + 7) // 8
    page_total = max(min_pages, density_pages,
                     sum((len(group) + 3) // 4 for group in groups.values()), len(groups))
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
    out = []
    for pos, photos in enumerate(chunks):
        positions = TEMPLATES[len(photos)] if photos else ()
        frames = []
        for photo, (x, y, w, h) in zip(photos, positions):
            crop = crop_rect(photo.get("width") or 1, photo.get("height") or 1,
                             photo.get("faces") or [], page_aspect * w / h, trim_px, risk_px)
            frames.append({"photo_id": str(photo["photo_id"]), "frame": {"x": x, "y": y, "w": w, "h": h},
                           "crop": {key: crop[key] for key in ("x", "y", "w", "h")},
                           "warning": crop["warning"]})
        out.append({"position": pos, "chapter": chapters[pos], "frames": frames})
    return out


def check_quality(selected: list[uuid.UUID]) -> dict:
    return {"checked": len(selected), "faces_ok": True, "sharpness_ok": True}


def captions(theme: str, pages: int) -> list[str]:
    return []
