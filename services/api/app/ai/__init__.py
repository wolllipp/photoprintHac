"""Интерфейс к ИИ-модулям Марка. Сейчас — детерминированные заглушки (DEMO_MODE).

Марк подменяет функции реальными с теми же сигнатурами; остальной код не меняется.
"""
import hashlib
import re
import uuid

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


def select_photos(photo_ids: list[uuid.UUID], pages: int) -> list[dict]:
    """Оставляет ~1.6 фото на страницу, остальным ставит причину отсева."""
    target = min(len(photo_ids), round(pages * 1.6))
    ranked = sorted(photo_ids, key=_h)
    keep = set(ranked[:target])
    reasons = ["duplicate", "blurry", "screenshot"]
    return [
        {"photo_id": p, "selected": p in keep,
         "reject_reason": None if p in keep else reasons[_h(p) % 3]}
        for p in photo_ids
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
