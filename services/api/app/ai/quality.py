"""Локальная оценка качества фотографий и геометрия кадрирования."""
from functools import lru_cache

import cv2
import numpy as np


DPI_LIMITS = {"10x15": (1205, 1795), "20x20_spread": (4724, 2398)}
WARNING_TEXT = {
    "low_res": "Мало пикселей для этого формата",
    "blur": "Смазанное фото",
    "face_edge": "Лицо у края — сдвинули кадр",
}


@lru_cache(maxsize=1)
def face_cascade():
    """Загружает локальный Haar-каскад OpenCV."""
    return cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


def analyze_image(data: bytes) -> tuple[float, list[dict]]:
    """Возвращает дисперсию Лапласиана и нормализованные bbox лиц."""
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Не удалось прочитать изображение")
    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    detected = face_cascade().detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
    faces = [{"x": x / width, "y": y / height, "w": w / width, "h": h / height}
             for x, y, w, h in detected]
    return sharpness, faces


def quality_report(photo, dpi_limit: tuple[int, int]) -> dict:
    """Строит предупреждения и score по метрикам загруженного фото."""
    warnings = []
    width, height = photo.width or 0, photo.height or 0
    target_width, target_height = dpi_limit
    resolution = min(width / target_width if target_width else 0,
                     height / target_height if target_height else 0)
    if resolution < 1:
        warnings.append({"code": "low_res", "text": WARNING_TEXT["low_res"]})
    sharpness = photo.sharpness
    if sharpness is not None and sharpness < 100:
        warnings.append({"code": "blur", "text": WARNING_TEXT["blur"]})
    faces = photo.faces or []
    if width and height and any(
        min(face["x"] * width, face["y"] * height,
            (1 - face["x"] - face["w"]) * width,
            (1 - face["y"] - face["h"]) * height) < 30
        for face in faces
    ):
        warnings.append({"code": "face_edge", "text": WARNING_TEXT["face_edge"]})
    sharpness_score = min((sharpness or 0) / ((sharpness or 0) + 100), 1)
    score = 0.5 * min(resolution, 1) + 0.4 * sharpness_score + (0.1 if faces else 0)
    return {"ok": not warnings, "score": float(score), "warnings": warnings}


def crop_rect(width: int, height: int, faces: list[dict], frame_aspect: float,
              trim_px: int, risk_px: int) -> dict:
    """Вычисляет нормализованный crop и сдвигает его от лиц, если возможно."""
    if width <= 0 or height <= 0 or frame_aspect <= 0:
        raise ValueError("Размеры фото и пропорция рамки должны быть положительными")
    image_aspect = width / height
    crop_w, crop_h = ((frame_aspect / image_aspect, 1) if image_aspect >= frame_aspect
                      else (1, image_aspect / frame_aspect))
    margin_x = max(trim_px, risk_px) / width
    margin_y = max(trim_px, risk_px) / height
    min_x, max_x = 0.0, 1 - crop_w
    min_y, max_y = 0.0, 1 - crop_h
    for face in faces:
        min_x = max(min_x, face["x"] + face["w"] + margin_x - crop_w)
        max_x = min(max_x, face["x"] - margin_x)
        min_y = max(min_y, face["y"] + face["h"] + margin_y - crop_h)
        max_y = min(max_y, face["y"] - margin_y)
    if min_x > max_x or min_y > max_y:
        x, y, warning = (1 - crop_w) / 2, (1 - crop_h) / 2, "face_edge"
    else:
        x = min(max((1 - crop_w) / 2, min_x), max_x)
        y = min(max((1 - crop_h) / 2, min_y), max_y)
        warning = None
    return {"x": x, "y": y, "w": crop_w, "h": crop_h, "warning": warning}
