import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._common import created_at, uuid_pk


class Role(str, enum.Enum):
    customer = "customer"
    manager = "manager"
    head = "head"
    admin = "admin"


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = uuid_pk()
    phone: Mapped[str | None] = mapped_column(String(20), unique=True)  # null у гостя (A10)
    is_guest: Mapped[bool] = mapped_column(Boolean, default=False)
    name: Mapped[str | None] = mapped_column(String(100))
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.customer)
    created_at: Mapped[datetime] = created_at()


class PickupPoint(Base):
    """Сохранённый пункт выдачи пользователя («мой пункт»)."""
    __tablename__ = "pickup_points"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    carrier: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(String(300))


class AuditLog(Base):
    """Журнал действий (ТЗ, ОТ-04): кто, когда, что сделал, над чем и с каким результатом.
    Тела запросов, телефоны и тексты в журнал не пишем — только действие, объект и код ответа."""
    __tablename__ = "audit_log"
    id: Mapped[uuid.UUID] = uuid_pk()
    at: Mapped[datetime] = created_at()
    user_id: Mapped[uuid.UUID | None] = mapped_column(index=True)  # без внешнего ключа: запись переживает удаление гостя
    role: Mapped[str | None] = mapped_column(String(20))
    action: Mapped[str] = mapped_column(String(60), index=True)
    object_type: Mapped[str | None] = mapped_column(String(30))
    object_id: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[int] = mapped_column(Integer)
    result: Mapped[str] = mapped_column(String(10))  # ok | denied | error
    ip: Mapped[str | None] = mapped_column(String(45))
