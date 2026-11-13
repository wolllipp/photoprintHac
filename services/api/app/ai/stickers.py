"""Тематические стикеры для книги (вопрос перед сборкой «Украшения → Тематические стикеры»).

Наборы — Microsoft Fluent Emoji (MIT), сами картинки лежат в приложении: apps/mobile/assets/stickers/<набор>/<имя>.svg.
ИИ здесь простой и предсказуемый: набор — по названию книги, а если в нём нет подсказки — по месяцу, когда снята
большая часть фото. Стикеры встают в углы страниц через одну и обходят лица на фото.
"""
import re
from collections import Counter
from datetime import datetime

PACKS = {
    "autumn": ["chestnut", "fallen_leaf", "hedgehog", "hot_beverage", "jack_o_lantern", "leaf_fluttering_in_wind",
               "maple_leaf", "mushroom", "red_apple", "umbrella_with_rain_drops"],
    "birthday": ["balloon", "birthday_cake", "confetti_ball", "cupcake", "glowing_star", "party_popper",
                 "partying_face", "ribbon", "sparkles", "wrapped_gift"],
    "kids": ["baby_bottle", "balloon", "butterfly", "kite", "puzzle_piece", "rainbow", "rocket", "star",
             "teddy_bear", "unicorn"],
    "newyear": ["bell", "candle", "christmas_tree", "fireworks", "gloves", "snowflake", "snowman", "sparkler",
                "star", "wrapped_gift"],
    "sea": ["beach_with_umbrella", "crab", "desert_island", "dolphin", "palm_tree", "spiral_shell", "sun",
            "sunglasses", "tropical_fish", "water_wave"],
    "travel": ["airplane", "camera_with_flash", "compass", "luggage", "mountain", "round_pushpin",
               "sunrise_over_mountains", "ticket", "world_map"],
    "wedding": ["bell", "bouquet", "clinking_glasses", "dove", "love_letter", "ring", "rose", "sparkling_heart",
                "two_hearts", "wedding"],
}
STICKER_ID = re.compile(r"^(" + "|".join(PACKS) + r")/[a-z0-9_]+$")

# подсказки в названии книги → набор (первое совпадение)
KEYWORDS = [
    (r"свадьб|венчан|помолвк", "wedding"),
    (r"день рожд|\bдр\b|юбиле|годик", "birthday"),
    (r"нов(ый|ого) год|рождеств|ёлк|елк|зим", "newyear"),
    (r"дет|малыш|сын|доч|ребён|ребен|садик", "kids"),
    (r"мор[еяю]|пляж|лет[оа]\b|отпуск", "sea"),
    (r"осен", "autumn"),
    (r"путеше|поездк|трип|travel|горы|город", "travel"),
]
THEME_PACK = {"travel": "travel", "child": "kids", "wedding": "wedding", "newyear": "newyear"}


def choose_pack(title: str | None, theme: str | None, taken: list[datetime | None]) -> str:
    text = (title or "").lower()
    for pattern, pack in KEYWORDS:
        if re.search(pattern, text):
            return pack
    if theme in THEME_PACK:
        return THEME_PACK[theme]
    months = Counter(t.month for t in taken if t)
    if months:
        month = months.most_common(1)[0][0]
        if month in (12, 1, 2):
            return "newyear"
        if month in (6, 7, 8):
            return "sea"
        if month in (9, 10, 11):
            return "autumn"
    return "travel"


# углы страницы (центр стикера в долях страницы) — по очереди, чтобы книга не выглядела однообразно
CORNERS = [(0.86, 0.12), (0.14, 0.88), (0.86, 0.88), (0.14, 0.12)]
SIZE = 0.16  # ширина стикера — доля ширины страницы


def _face_boxes(page: dict, faces_by_photo: dict[str, list[dict]]) -> list[tuple[float, float, float, float]]:
    """Лица на странице в долях страницы: рамка фото + кадр + лицо в долях фото."""
    out = []
    for fr in page.get("frames", []):
        frame, crop = fr.get("frame") or {}, fr.get("crop") or {"x": 0, "y": 0, "w": 1, "h": 1}
        for face in faces_by_photo.get(fr["photo_id"], []):
            fx = frame.get("x", 0) + (face["x"] - crop["x"]) / crop["w"] * frame.get("w", 1)
            fy = frame.get("y", 0) + (face["y"] - crop["y"]) / crop["h"] * frame.get("h", 1)
            fw = face["w"] / crop["w"] * frame.get("w", 1)
            fh = face["h"] / crop["h"] * frame.get("h", 1)
            out.append((fx, fy, fw, fh))
    return out


def _overlaps(a, b, pad=0.02):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return ax < bx + bw + pad and bx < ax + aw + pad and ay < by + bh + pad and by < ay + ah + pad


def place(pages: list[dict], pack: str, faces_by_photo: dict[str, list[dict]]) -> None:
    """Ставит стикеры прямо в страницы (page["stickers"]): через страницу по одному, на первой — два.
    Угол, где стикер закрыл бы лицо, пропускаем; все углы заняты лицами — страница без стикера."""
    items = PACKS[pack]
    used = 0
    for pos, page in enumerate(pages):
        if not page.get("frames") or (pos % 2 and pos != 0):
            continue
        faces = _face_boxes(page, faces_by_photo)
        want = 2 if pos == 0 else 1
        stickers = []
        for k in range(len(CORNERS)):
            cx, cy = CORNERS[(pos + k) % len(CORNERS)]
            box = (cx - SIZE / 2, cy - SIZE / 2, SIZE, SIZE)
            if any(_overlaps(box, f) for f in faces):
                continue
            rot = ((pos * 37 + k * 11) % 25) - 12  # лёгкий наклон, как будто наклеили руками
            stickers.append({"id": f"{pack}/{items[used % len(items)]}", "x": cx, "y": cy, "s": SIZE, "r": rot})
            used += 1
            if len(stickers) == want:
                break
        page["stickers"] = stickers
