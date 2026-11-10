"""Демо-парсинг истории, отбор фото и заглушки для остальных AI-этапов."""
import hashlib
import re
import uuid
from pathlib import Path

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
    photos: list[tuple[uuid.UUID, str | Path]],
    pages: int,
    excluded_ids: set[uuid.UUID] | None = None,
    included_ids: set[uuid.UUID] | None = None,
    *,
    hashes: dict[uuid.UUID, bytes] | None = None,
) -> list[dict]:
    """Выбирает уникальные фото; исключения и включения пользователя приоритетны."""
    excluded_ids = excluded_ids or set()
    included_ids = included_ids or set()
    hashes = hashes if hashes is not None else {}
    groups: dict[bytes, list[uuid.UUID]] = {}
    for photo_id, path in photos:
        content_hash = hashes.get(photo_id)
        if content_hash is None:
            content_hash = _file_hash(Path(path))
            hashes[photo_id] = content_hash
        if photo_id not in excluded_ids:
            groups.setdefault(content_hash, []).append(photo_id)
    duplicates = {
        photo_id
        for group in groups.values() if len(group) > 1
        for photo_id in sorted(group, key=lambda pid: (pid not in included_ids, _h(pid)))[1:]
    }
    unique_ids = [photo_id for photo_id, _ in photos if photo_id not in excluded_ids | duplicates]
    target = min(len(photos) - len(excluded_ids), round(pages * 1.6))
    keep = set(sorted(unique_ids, key=lambda pid: (pid not in included_ids, _h(pid)))[:target])
    return [
        {"photo_id": photo_id, "selected": photo_id in keep,
         "reject_reason": None if photo_id in excluded_ids or photo_id in keep else
         "duplicate" if photo_id in duplicates else "capacity"}
        for photo_id, _ in photos
    ]


def layout(selected: list[uuid.UUID], pages: int) -> list[dict]:
    """Раскладка по страницам: фото равномерно, по 1–3 на страницу."""
    out, i = [], 0
    for pos in range(pages):
        n = min(len(selected) - i, 1 + (pos % 3 == 1) + (pos % 5 == 2))
        out.append({"position": pos, "frames": [{"photo_id": str(p), "crop": "auto"} for p in selected[i:i + n]]})
        i += n
    return out


def check_quality(selected: list[uuid.UUID]) -> dict:
    return {"checked": len(selected), "faces_ok": True, "sharpness_ok": True}


def captions(theme: str, pages: int) -> list[str]:
    return []
