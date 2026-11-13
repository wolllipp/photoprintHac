"""Голос → текст: запись с телефона распознаёт Whisper на нашем сервере (faster-whisper, локально).

Голос никуда не уходит — ни в облако, ни в Apple/Google. Запись не сохраняется: распознали и забыли.
Модель грузится один раз при первом запросе (WHISPER_MODEL, по умолчанию small — ~460 МБ, хорошо понимает
русский на обычном процессоре); файлы модели — в WHISPER_DIR (по умолчанию рядом с хранилищем фото).
"""
import asyncio
import io
import logging
import threading
import time
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.config import settings
from app.models import User
from app.security.auth import current_user

router = APIRouter(tags=["speech"])
log = logging.getLogger("uvicorn.error")

# длинная фраза диктовки — до минуты; больше — это уже не команда, а лекция
MAX_BYTES = 10 * 1024 * 1024
# модель одна на сервер, а распознавание — не из нескольких потоков сразу
_lock = threading.Lock()


@lru_cache(maxsize=1)
def _model():
    from faster_whisper import WhisperModel

    root = Path(settings.whisper_dir or Path(settings.storage_dir) / "_models")
    root.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    model = WhisperModel(settings.whisper_model, device="auto", compute_type="int8", download_root=str(root))
    log.info("whisper: модель %s готова за %.1f с", settings.whisper_model, time.monotonic() - started)
    return model


def transcribe(data: bytes) -> str:
    started = time.monotonic()
    with _lock:
        segments, _ = _model().transcribe(io.BytesIO(data), language="ru", beam_size=1, vad_filter=True)
        text = " ".join(seg.text.strip() for seg in segments).strip()
    log.info("whisper: %d КБ → %d символов за %.1f с", len(data) // 1024, len(text), time.monotonic() - started)
    return text


@router.post("/speech")
async def speech(file: UploadFile = File(...), user: User = Depends(current_user)):
    """Распознать фразу. Ответ — текст; пустой текст — ничего не расслышали."""
    data = await file.read()
    if not data:
        raise HTTPException(422, "пустая запись")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "запись слишком длинная — до минуты")
    try:
        text = await asyncio.to_thread(transcribe, data)
    except Exception as e:
        log.warning("whisper: не получилось распознать: %s", e)
        raise HTTPException(503, "распознавание речи сейчас недоступно")
    return {"text": text}
