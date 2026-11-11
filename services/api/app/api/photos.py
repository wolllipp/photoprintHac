import asyncio
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
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
MAX_BYTES = 40 * 1024 * 1024
ALLOWED = {"JPEG": "jpg", "PNG": "png", "HEIC": "heic", "HEIF": "heic", "WEBP": "webp"}


def _taken_at(img: Image.Image) -> datetime | None:
    try:
        raw = img.getexif().get_ifd(ExifTags.IFD.Exif).get(ExifTags.Base.DateTimeOriginal)
        return datetime.strptime(raw, "%Y:%m:%d %H:%M:%S") if raw else None
    except Exception:
        return None


@router.post("/photos")
async def upload(files: list[UploadFile] = File(...), user: User = Depends(current_user),
                 s: AsyncSession = Depends(get_session)):
    """Загружаются только фото, которые человек выбрал сам. Галерею мы не читаем."""
    out = []
    folder = Path(settings.storage_dir) / str(user.id)
    folder.mkdir(parents=True, exist_ok=True)
    for f in files:
        data = await f.read()
        if len(data) > MAX_BYTES:
            raise HTTPException(413, f"{f.filename}: больше 40 МБ")
        try:
            import io
            img = Image.open(io.BytesIO(data))
            fmt = img.format
            w, h = img.size
            taken = _taken_at(img)
        except (UnidentifiedImageError, OSError):
            raise HTTPException(415, f"{f.filename}: не изображение")
        if fmt not in ALLOWED:
            raise HTTPException(415, f"{f.filename}: формат {fmt} не поддерживается")
        pid = uuid.uuid4()
        path = folder / f"{pid}.{ALLOWED[fmt]}"
        path.write_bytes(data)
        try:
            sharpness, faces = await asyncio.to_thread(analyze_image, data)
        except Exception:
            sharpness, faces = None, None
        photo = Photo(id=pid, owner_id=user.id, path=str(path), width=w, height=h, taken_at=taken,
                      sharpness=sharpness, faces=faces)
        s.add(photo)
        out.append(photo)
    await s.commit()
    return [{"id": str(p.id), "width": p.width, "height": p.height,
             "taken_at": p.taken_at.isoformat() if p.taken_at else None} for p in out]


@router.get("/photos/{photo_id}/file")
async def photo_file(photo_id: uuid.UUID, user: User = Depends(current_user),
                     s: AsyncSession = Depends(get_session)):
    p = await s.get(Photo, photo_id)
    if p is None or p.owner_id != user.id:  # чужие фото не видны
        raise HTTPException(404, "фото не найдено")
    return FileResponse(p.path)
