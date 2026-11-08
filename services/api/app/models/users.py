import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Enum, ForeignKey, String
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
