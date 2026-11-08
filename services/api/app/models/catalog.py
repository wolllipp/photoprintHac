import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._common import uuid_pk


class Product(Base):
    """Линейка: Lite / Classic / Premium, фотопечать. Единый источник правды (D14)."""
    __tablename__ = "products"
    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(40), unique=True)
    title: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(20))  # photobook | print


class ProductOption(Base):
    __tablename__ = "product_options"
    id: Mapped[uuid.UUID] = uuid_pk()
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"))
    format: Mapped[str] = mapped_column(String(20))  # 20x20
    cover: Mapped[str | None] = mapped_column(String(40))
    lamination: Mapped[str | None] = mapped_column(String(40))
    min_pages: Mapped[int | None] = mapped_column(Integer)
    max_pages: Mapped[int | None] = mapped_column(Integer)
    base_pages: Mapped[int | None] = mapped_column(Integer)  # сколько страниц входит в base_price
    base_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))  # книга: за base_pages; печать: за 1 шт.
    step_pages: Mapped[int | None] = mapped_column(Integer)  # шаг доплаты (2 страницы = 1 разворот)
    step_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    production_days: Mapped[int] = mapped_column(Integer)
    print_line: Mapped[str | None] = mapped_column(String(40))
    extra: Mapped[dict] = mapped_column(JSONB, default=dict)  # в т.ч. assumed: что взято не с сайта


class DeliveryMethod(Base):
    __tablename__ = "delivery_methods"
    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(40), unique=True)  # europost_pvz, courier_minsk...
    title: Mapped[str] = mapped_column(String(100))
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    free_from: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    days: Mapped[int] = mapped_column(Integer)
