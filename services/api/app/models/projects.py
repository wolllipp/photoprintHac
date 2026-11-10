import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._common import created_at, uuid_pk


class Photo(Base):
    """Фото, которое пользователь САМ выбрал и загрузил. Галерею не сканируем."""
    __tablename__ = "photos"
    id: Mapped[uuid.UUID] = uuid_pk()
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    path: Mapped[str] = mapped_column(String(500))
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    sharpness: Mapped[float | None] = mapped_column(Float)
    faces: Mapped[list | None] = mapped_column(JSONB)  # bbox лиц, без идентификации
    delete_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # A14
    created_at: Mapped[datetime] = created_at()
    # embedding vector — отдельной миграцией, когда поставим pgvector


class ProjectStatus(str, enum.Enum):
    draft = "draft"
    building = "building"
    ready = "ready"
    ordered = "ordered"


class ProjectSource(str, enum.Enum):
    picked = "picked"        # путь А: выбрал фото сам
    story = "story"          # путь Б: описал словами
    shared_album = "shared_album"  # общий альбом по QR


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[uuid.UUID] = uuid_pk()
    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)  # null до входа (A10)
    title: Mapped[str] = mapped_column(String(200))
    theme: Mapped[str | None] = mapped_column(String(40))  # для иконки на главной
    tone: Mapped[str | None] = mapped_column(String(40))
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id"))
    option_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("product_options.id"))
    status: Mapped[ProjectStatus] = mapped_column(Enum(ProjectStatus), default=ProjectStatus.draft)
    source: Mapped[ProjectSource] = mapped_column(Enum(ProjectSource))
    page_count: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = created_at()


class ProjectPhoto(Base):
    """Фото в проекте и его судьба при отборе (экран «Лучшие 38 из 214»)."""
    __tablename__ = "project_photos"
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), primary_key=True)
    photo_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("photos.id"), primary_key=True)
    selected: Mapped[bool] = mapped_column(default=False)
    reject_reason: Mapped[str | None] = mapped_column(String(20))  # duplicate | capacity; legacy rows may have old reasons
    user_override: Mapped[bool] = mapped_column(default=False)  # пользователь вернул/убрал


class ProjectPage(Base):
    __tablename__ = "project_pages"
    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    layout: Mapped[dict] = mapped_column(JSONB)  # какое фото в какой рамке, кадрирование


class BuildJob(Base):
    """Автосборка: этапы и прогресс для экрана «Собираем книгу»."""
    __tablename__ = "build_jobs"
    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued|running|done|failed|cancelled
    stage: Mapped[str | None] = mapped_column(String(20))  # selecting|layout|faces|captions
    progress: Mapped[dict] = mapped_column(JSONB, default=dict)  # {"selecting": [38, 214], ...}
    created_at: Mapped[datetime] = created_at()
