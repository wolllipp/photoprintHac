import asyncio
import io
import logging
import time
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from PIL import ExifTags, Image, UnidentifiedImageError

try:
    import pillow_heif
except ImportError:  # HEIC-декодер ставится вместе с локальной зависимостью
    pillow_heif = None
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.ai.quality import analyze_image
from app.db import get_session
from app.models import Photo, User
from app.security.auth import current_user

if pillow_heif:
    pillow_heif.register_heif_opener()

router = APIRouter(tags=["photos"])
# логгер uvicorn — его INFO видно в консоли сервера без настройки logging (замер: сколько идёт загрузка)
log = logging.getLogger("uvicorn.error")
MAX_BYTES = 40 * 1024 * 1024
# 60 Мпикс хватает с запасом: у камер телефонов до 48–50 Мпикс
MAX_PIXELS = 60_000_000
# MPO — JPEG с дополнительными кадрами (глубина, HDR): так айфон часто сохраняет обычные фото; храним как jpg
ALLOWED = {"JPEG": "jpg", "MPO": "jpg", "PNG": "png", "HEIC": "heic", "HEIF": "heic", "WEBP": "webp"}


def _taken_at(img: Image.Image) -> datetime | None:
    try:
        raw = img.getexif().get_ifd(ExifTags.IFD.Exif).get(ExifTags.Base.DateTimeOriginal)
        return datetime.strptime(raw, "%Y:%m:%d %H:%M:%S") if raw else None
    except Exception:
        return None


def _read_image(f: UploadFile, data: bytes) -> tuple[str, int, int, datetime | None]:
    """Формат, размер и дата съёмки; не картинка, «бомба» или чужой формат — понятная ошибка."""
    if len(data) > MAX_BYTES:
        raise HTTPException(413, f"{f.filename}: больше 40 МБ")
    try:
        img = Image.open(io.BytesIO(data))
        fmt = img.format
        w, h = img.size
        taken = _taken_at(img)
    except Image.DecompressionBombError:
        raise HTTPException(413, f"{f.filename}: слишком большое изображение")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(415, f"{f.filename}: не изображение")
    # «бомба» из маленького файла на десятки тысяч пикселей по стороне — не декодируем
    if w * h > MAX_PIXELS:
        raise HTTPException(413, f"{f.filename}: больше {MAX_PIXELS // 1_000_000} Мпикс")
    if fmt not in ALLOWED:
        raise HTTPException(415, f"{f.filename}: формат {fmt} не поддерживается")
    return fmt, w, h, taken


def is_draft(path: str | None) -> bool:
    """Черновая копия для экрана и сборки: копия для печати ещё догружается (PUT /photos/{id}/file)."""
    return bool(path) and ".draft." in Path(path).name


def _size(raw: list[str], index: int) -> int:
    try:
        return int(raw[index]) if index < len(raw) and raw[index] else 0
    except ValueError:
        return 0


@router.post("/photos")
async def upload(files: list[UploadFile] = File(...), taken_at: list[str] = Form(default_factory=list),
                 print_w: list[str] = Form(default_factory=list), print_h: list[str] = Form(default_factory=list),
                 user: User = Depends(current_user), s: AsyncSession = Depends(get_session)):
    """Загружаются только фото, которые человек выбрал сам. Галерею мы не читаем.

    print_w/print_h — черновая загрузка: приложение шлёт копию 1200 px, чтобы книга собралась за секунды,
    и размер копии для печати, которую догрузит потом. Ширину и высоту записываем печатные — по ним
    считается качество под рамку; резкость и лица и так считаются на копии 1024 px (analyze_image).
    """
    out = []
    started = time.monotonic()
    folder = Path(settings.storage_dir) / str(user.id)
    folder.mkdir(parents=True, exist_ok=True)
    for index, f in enumerate(files):
        data = await f.read()
        fmt, w, h, taken = _read_image(f, data)
        pw, ph = _size(print_w, index), _size(print_h, index)
        draft = pw > 0 and ph > 0
        # приложение шлёт сжатую копию (EXIF в ней нет) и дату съёмки из галереи отдельным полем
        if taken is None and index < len(taken_at) and taken_at[index]:
            try:
                taken = datetime.strptime(taken_at[index][:19], "%Y:%m:%d %H:%M:%S")
            except ValueError:
                taken = None
        pid = uuid.uuid4()
        path = folder / f"{pid}{'.draft' if draft else ''}.{ALLOWED[fmt]}"
        path.write_bytes(data)
        try:
            sharpness, faces = await asyncio.to_thread(analyze_image, data)
        except Exception:
            sharpness, faces = None, None
        photo = Photo(id=pid, owner_id=user.id, path=str(path), width=pw if draft else w, height=ph if draft else h,
                      taken_at=taken, sharpness=sharpness, faces=faces)
        s.add(photo)
        out.append(photo)
    await s.commit()
    log.info("upload: %d фото (%s) за %.1f с", len(out), "черновые" if print_w else "полные", time.monotonic() - started)
    return [{"id": str(p.id), "width": p.width, "height": p.height,
             "taken_at": p.taken_at.isoformat() if p.taken_at else None} for p in out]


@router.put("/photos/{photo_id}/file")
async def replace_file(photo_id: uuid.UUID, file: UploadFile = File(...),
                       user: User = Depends(current_user), s: AsyncSession = Depends(get_session)):
    """Копия для печати вместо черновой (после быстрой сборки). Тот же id — книга и раскладка не меняются."""
    p = await s.get(Photo, photo_id)
    if p is None or p.owner_id != user.id:
        raise HTTPException(404, "фото не найдено")
    data = await file.read()
    fmt, w, h, _ = _read_image(file, data)
    old = Path(p.path)
    path = old.with_name(f"{photo_id}.{ALLOWED[fmt]}")
    path.write_bytes(data)
    p.path, p.width, p.height = str(path), w, h
    await s.commit()
    # черновик не удаляем: сборка, которая идёт прямо сейчас, могла прочитать его путь раньше и ещё читает файл
    # (так и падала: FileNotFoundError на .draft.jpg). Весит 200–300 КБ.
    return {"id": str(p.id), "width": w, "height": h}


@router.get("/photos/{photo_id}/file")
async def photo_file(photo_id: uuid.UUID, w: int | None = Query(None, ge=200, le=4000),
                     user: User = Depends(current_user), s: AsyncSession = Depends(get_session)):
    """Фото владельца. w — уменьшенная копия для экрана (длинная сторона, px): 25–30 оригиналов по 12 Мпикс
    вешали редактор на телефоне. Копия делается один раз и лежит рядом с оригиналом; в печать идёт оригинал."""
    p = await s.get(Photo, photo_id)
    if p is None or p.owner_id != user.id:  # чужие фото не видны
        raise HTTPException(404, "фото не найдено")
    if not w:
        return FileResponse(p.path)
    small = Path(f"{p.path}.w{w}.jpg")
    if not small.exists():
        def make():
            from PIL import ImageOps
            with Image.open(p.path) as im:
                im = ImageOps.exif_transpose(im).convert("RGB")
                im.thumbnail((w, w))
                im.save(small, "JPEG", quality=82)
        try:
            await asyncio.to_thread(make)
        except Exception:
            return FileResponse(p.path)  # не вышло уменьшить — отдаём оригинал, как раньше
    return FileResponse(small, media_type="image/jpeg")
