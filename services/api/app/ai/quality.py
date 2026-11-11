"""Локальная оценка качества фотографий и геометрия кадрирования."""
from functools import lru_cache
import io
import re

import cv2
import numpy as np
from PIL import ExifTags, Image

DPI_LIMITS = {
    "10x15": (1205, 1795), "15x20": (1795, 2398),
    "20x30": (2398, 3602), "30x45": (3543, 5315),
    "20x20_spread": (4724, 2398),
}
WARNING_TEXT = {
    "low_res": "Фото может быть чуть мягче остальных",
    "low_res_poor": "Фото будет заметно размытым в этой рамке. Поставьте его в рамку поменьше",
    "low_res_very_poor": "Слишком мало пикселей для такого размера. Замените фото или уменьшите рамку",
    "blur": "Смазанное фото",
    "face_edge": "Лицо у края",
    "gutter": "Зона загиба! Не размещайте здесь панорамы, лица, текст",
    "screenshot": "Похоже на скриншот — оставить в книге?",
}
SCREENSHOT_TEXT = WARNING_TEXT["screenshot"]
MONTHS_RU = ("января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа",
             "сентября", "октября", "ноября", "декабря")


def _format_dimensions(format: str | None) -> tuple[float, float] | None:
    if not format:
        return None
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*", format)
    return tuple(map(float, match.groups())) if match else None


def dpi_limit_for_format(format: str | None, *, book: bool = True) -> tuple[int, int]:
    """Возвращает целевые пиксели при 300 DPI для страницы книги или фотопечати."""
    dims = _format_dimensions(format)
    if not dims:
        return (4724, 2398)
    width, height = dims
    return round(width * (2 if book else 1) * 300 / 2.54), round(height * 300 / 2.54)


def page_aspect_for_format(format: str | None) -> float:
    """Возвращает пропорцию одной страницы книги."""
    dimensions = _format_dimensions(format)
    return dimensions[0] / dimensions[1] if dimensions else 1.0


def effective_dpi(width: int, height: int, format: str | None, frame: dict | None = None,
                  crop: dict | None = None, *, book: bool = True) -> float | None:
    """Считает минимальный эффективный DPI кадрированного фото для печатной рамки."""
    dims = _format_dimensions(format)
    if not dims or not width or not height:
        return None
    crop = crop or {"x": 0, "y": 0, "w": 1, "h": 1}
    pixel_w, pixel_h = width * crop["w"], height * crop["h"]
    frame = frame or {"w": 1, "h": 1}
    physical_w, physical_h = dims[0] * (2 if book else 1), dims[1]
    physical_w *= frame.get("w", 1)
    physical_h *= frame.get("h", 1)
    return max(min(pixel_w / (physical_w / 2.54), pixel_h / (physical_h / 2.54)),
               min(pixel_w / (physical_h / 2.54), pixel_h / (physical_w / 2.54)))


def _head(face: dict) -> tuple[float, float, float, float]:
    """Расширяет bbox лица до оценочной зоны головы."""
    x, y, w, h = face["x"], face["y"], face["w"], face["h"]
    return x - 0.15 * w, y - 0.4 * h, w * 1.3, h * 1.4


def _camera_exif(image: Image.Image) -> bool:
    """Определяет наличие камеры или параметров съёмки в EXIF."""
    try:
        exif = image.getexif()
        camera_tags = (271, 272, 33434, 33437, 34855, 36867, 37377, 37378, 37386, 42033, 42035, 42036)
        nested = exif.get_ifd(ExifTags.IFD.Exif)
        return any(exif.get(tag) or nested.get(tag) for tag in camera_tags)
    except Exception:
        return False


def is_screenshot(data: bytes | None = None, *, path: str | None = None,
                  width: int | None = None, height: int | None = None) -> bool:
    """Распознаёт характерную пропорцию скриншота без EXIF-данных камеры."""
    try:
        image = Image.open(io.BytesIO(data)) if data is not None else Image.open(path)
        width, height = image.size
        ratio = max(width, height) / min(width, height)
        return abs(ratio - (19.5 / 9)) <= 0.08 and not _camera_exif(image)
    except Exception:
        if not width or not height:
            return False
        ratio = max(width, height) / min(width, height)
        return abs(ratio - (19.5 / 9)) <= 0.08


@lru_cache(maxsize=1)
def face_cascade():
    """Загружает локальный Haar-каскад OpenCV."""
    return cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


def _decode_gray(data: bytes) -> np.ndarray | None:
    """Декодирует изображение OpenCV, затем Pillow с HEIF-плагином."""
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if image is not None:
        return image
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
        with Image.open(io.BytesIO(data)) as source:
            return np.asarray(source.convert("L"))
    except Exception:
        return None


def analyze_image(data: bytes) -> tuple[float, list[dict]]:
    """Возвращает дисперсию Лапласиана на миниатюре 1024 px и bbox лиц."""
    gray = _decode_gray(data)
    if gray is None:
        raise ValueError("Не удалось прочитать изображение")
    image = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    height, width = image.shape[:2]
    scale = min(1.0, 1024 / max(width, height))
    if scale < 1:
        image = cv2.resize(image, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)
    small_height, small_width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    detected = face_cascade().detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
    faces = [{"x": x / small_width, "y": y / small_height, "w": w / small_width, "h": h / small_height}
             for x, y, w, h in detected]
    return sharpness, faces


def quality_report(photo, dpi_limit: tuple[int, int] | None = None, *, format: str | None = None,
                   frame: dict | None = None, crop: dict | None = None, book: bool = True,
                   product: str | None = None, screenshot: bool | None = None) -> dict:
    """Строит уровни качества и предупреждения по конкретной рамке."""
    value = photo.get if isinstance(photo, dict) else lambda key, default=None: getattr(photo, key, default)
    warnings = []
    width, height = value("width") or 0, value("height") or 0
    if format:
        dpi = effective_dpi(width, height, format, frame, crop, book=book)
    elif dpi_limit:
        target_width, target_height = dpi_limit
        resolution = max(min(width / target_width, height / target_height),
                         min(width / target_height, height / target_width)) if width and height else 0
        dpi = resolution * 300
    else:
        dpi = None
    if dpi is None:
        dpi_level = None
    elif dpi >= 250:
        dpi_level = "good"
    elif dpi >= 150:
        dpi_level = "acceptable"
        warnings.append({"code": "low_res", "text": WARNING_TEXT["low_res"]})
    elif dpi >= 100:
        dpi_level = "poor"
        warnings.append({"code": "low_res", "text": WARNING_TEXT["low_res_poor"]})
    else:
        dpi_level = "very_poor"
        warnings.append({"code": "low_res", "text": WARNING_TEXT["low_res_very_poor"]})
    sharpness = value("sharpness")
    if sharpness is not None and sharpness < 100:
        warnings.append({"code": "blur", "text": WARNING_TEXT["blur"]})
    faces = value("faces") or []
    if dpi and width and height:
        crop = crop or {"x": 0, "y": 0, "w": 1, "h": 1}
        # Ширина/высота в координатах исходника переводятся в итоговые пиксели crop.
        edge_mm = 5 if book or product in {"chemical", "print_chemical"} else 4
        if any((lambda b: min((b[0] - crop["x"]) * width / crop["w"],
                               (crop["x"] + crop["w"] - b[0] - b[2]) * width / crop["w"],
                               (b[1] - crop["y"]) * height / crop["h"],
                               (crop["y"] + crop["h"] - b[1] - b[3]) * height / crop["h"])
              < dpi * edge_mm / 25.4)(_head(face)) for face in faces):
            warnings.append({"code": "face_edge", "text": WARNING_TEXT["face_edge"]})
        dims = _format_dimensions(format)
        if book and product in {"lite", "classic"} and dims and frame:
            gutter_half = 0.6 / (2 * dims[0])
            crop = crop or {"x": 0, "y": 0, "w": 1, "h": 1}
            for face in faces:
                hx, hy, hw, hh = _head(face)
                left = frame.get("x", 0) + (hx - crop["x"]) / crop["w"] * frame.get("w", 1)
                right = left + hw / crop["w"] * frame.get("w", 1)
                if left < 0.5 + gutter_half and right > 0.5 - gutter_half:
                    warnings.append({"code": "gutter", "text": WARNING_TEXT["gutter"]})
                    break
    if screenshot is None:
        path = value("path")
        screenshot = is_screenshot(path=path, width=width, height=height) if path else False
    if screenshot:
        warnings.append({"code": "screenshot", "text": SCREENSHOT_TEXT})
    sharpness_score = min((sharpness or 0) / ((sharpness or 0) + 100), 1)
    resolution_score = min((dpi or 0) / 250, 1)
    score = 0.5 * resolution_score + 0.4 * sharpness_score + (0.1 if faces else 0)
    return {"ok": not warnings, "score": float(score), "warnings": warnings,
            "effective_dpi": round(dpi, 1) if dpi is not None else None,
            "quality_level": dpi_level, "requires_confirmation": dpi is not None and dpi < 100}


def add_crop_warning(report: dict, warning: str | None) -> dict:
    """Добавляет предупреждение о лице, которое нельзя безопасно сдвинуть."""
    if warning == "face_edge" and not any(item["code"] == warning for item in report["warnings"]):
        report["warnings"].append({"code": warning, "text": WARNING_TEXT[warning]})
        report["ok"] = False
    return report


def crop_rect(width: int, height: int, faces: list[dict], frame_aspect: float,
              trim_px: int | None = None, risk_px: int | None = None, *,
              dpi: float = 300, trim_mm: float = 2.5, risk_mm: float = 5) -> dict:
    """Вычисляет crop, учитывая голову и печатные отступы в миллиметрах."""
    if width <= 0 or height <= 0 or frame_aspect <= 0:
        raise ValueError("Размеры фото и пропорция рамки должны быть положительными")
    image_aspect = width / height
    crop_w, crop_h = ((frame_aspect / image_aspect, 1) if image_aspect >= frame_aspect
                      else (1, image_aspect / frame_aspect))
    margin_px = max(trim_px or 0, risk_px or 0, dpi * max(trim_mm, risk_mm) / 25.4)
    margin_x, margin_y = margin_px / width, margin_px / height
    min_x, max_x = 0.0, 1 - crop_w
    min_y, max_y = 0.0, 1 - crop_h
    for face in faces:
        hx, hy, hw, hh = _head(face)
        min_x = max(min_x, hx + hw + margin_x - crop_w)
        max_x = min(max_x, hx - margin_x)
        min_y = max(min_y, hy + hh + margin_y - crop_h)
        max_y = min(max_y, hy - margin_y)
    if min_x > max_x or min_y > max_y:
        x, y, warning = (1 - crop_w) / 2, (1 - crop_h) / 2, "face_edge"
    else:
        x = min(max((1 - crop_w) / 2, min_x), max_x)
        y = min(max((1 - crop_h) / 2, min_y), max_y)
        warning = None
    return {"x": x, "y": y, "w": crop_w, "h": crop_h, "warning": warning}


def difference_hash(data: bytes) -> int:
    """Вычисляет 64-битный dHash; значение не заменяет побайтовый SHA-256."""
    image = _decode_gray(data)
    if image is None:
        raise ValueError("Не удалось прочитать изображение")
    image = cv2.resize(image, (9, 8), interpolation=cv2.INTER_AREA)
    bits = image[:, 1:] > image[:, :-1]
    return int.from_bytes(np.packbits(bits.flatten()).tobytes(), "big")


def dhash_distance(left: int, right: int) -> int:
    """Возвращает расстояние Хэмминга между двумя dHash."""
    return (left ^ right).bit_count()
