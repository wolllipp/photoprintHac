import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Identity, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._common import created_at, uuid_pk


class Stage(str, enum.Enum):
    accepted = "accepted"
    layout_checked = "layout_checked"
    printing = "printing"
    binding = "binding"
    handed_to_delivery = "handed_to_delivery"
    ready_for_pickup = "ready_for_pickup"
    delivered = "delivered"


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[uuid.UUID] = uuid_pk()
    number: Mapped[int] = mapped_column(Integer, Identity(start=4792101), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    delivery_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("delivery_methods.id"))
    pickup_point_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("pickup_points.id"))
    payment: Mapped[str] = mapped_column(String(10))  # card | erip
    points_spent: Mapped[int] = mapped_column(Integer, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    stage: Mapped[Stage] = mapped_column(Enum(Stage), default=Stage.accepted)
    promised_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at()


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[uuid.UUID] = uuid_pk()
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id"))
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"))
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    qty: Mapped[int] = mapped_column(Integer, default=1)


class OrderStage(Base):
    """История этапов: отсюда экран отслеживания, Live Activity и данные для Insight."""
    __tablename__ = "order_stages"
    id: Mapped[uuid.UUID] = uuid_pk()
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    stage: Mapped[Stage] = mapped_column(Enum(Stage))
    at: Mapped[datetime] = created_at()
    line: Mapped[str | None] = mapped_column(String(40))
    shift: Mapped[str | None] = mapped_column(String(20))
    done: Mapped[int | None] = mapped_column(Integer)   # «готово 6 …
    total: Mapped[int | None] = mapped_column(Integer)  # … из 12 разворотов»


class PointsLedger(Base):
    """Пики: баланс = сумма движений."""
    __tablename__ = "points_ledger"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    delta: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(30))  # referral|story_conversion|moment|order_payment
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id"))
    at: Mapped[datetime] = created_at()
