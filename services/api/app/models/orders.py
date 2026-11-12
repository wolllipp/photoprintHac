import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Identity, Integer, Numeric, String, Text, UniqueConstraint
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
    # Idempotency-Key из приложения: тот же ключ — тот же заказ (ответ потерялся, человек нажал «Повторить»);
    # hash — каким был запрос: тот же ключ с другим содержимым — 409
    idempotency_key: Mapped[str | None] = mapped_column(String(64))
    idempotency_hash: Mapped[str | None] = mapped_column(String(64))

    __table_args__ = (UniqueConstraint("user_id", "idempotency_key", name="uq_orders_user_idempotency"),)


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[uuid.UUID] = uuid_pk()
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id"))
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"))
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    qty: Mapped[int] = mapped_column(Integer, default=1)
    # фотопечать: какое фото и в каком формате (у книги — project_id)
    photo_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("photos.id"))
    option_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("product_options.id"))


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


class SupportTicket(Base):
    """Обращение в поддержку по конкретному заказу (ТЗ, путь клиента п. 8). Поддержка и Insight видят тему и заказ."""
    __tablename__ = "support_tickets"
    id: Mapped[uuid.UUID] = uuid_pk()
    number: Mapped[int] = mapped_column(Integer, Identity(start=10001), unique=True)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    topic: Mapped[str] = mapped_column(String(20))  # defect | delay | layout | delivery | other
    text: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | answered | closed
    answer: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at()
