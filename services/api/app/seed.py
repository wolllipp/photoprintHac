"""Справочник продуктов и доставки (D14 — один источник правды).

Запуск: uv run python -m app.seed   (идемпотентно, обновляет по code)

Источник книг: super.picpac.by (notes/23-super-alignment.md); печать и доставка — notes/06-picpac-current-state.md.
Всё, чего на сайте нет или оно противоречиво, помечено extra.assumed и ждёт Алесю.
Противоречия сайта сняты так: срок книг — по production_days; объём — везде страницы.
"""
import asyncio
from decimal import Decimal as D

from sqlalchemy import select

from app import db
import app.models  # noqa: F401
from app.models import DeliveryMethod, OrderItem, Product, ProductOption, Project

# (code, title, line, {format: ...}, min_p, base_p, base_price, step_price, max_p, days, assumed)
BOOKS = [
    # Цены, диапазоны и шаг — с super.picpac.by (notes/23-super-alignment.md): цена за минимальный объём,
    # дальше — доплата за каждые 2 страницы. Книга не бывает меньше минимума (Lite — 24 страницы).
    dict(code="lite", title="Lite", line="Ricoh", days=3, min_pages=24, base_pages=24, max_pages=160,
         base_price=D("70.00"), step_price=D("2.00"),
         formats=["20x20", "26x26", "21x30"],
         assumed=["production_days: на сайте «книги за 3 дня» без разбивки по тарифам",
                  "надбавки за формат на сайте не указаны — цена одна для всех форматов"]),
    dict(code="classic", title="Classic", line="Ricoh", days=3, min_pages=20, base_pages=20, max_pages=60,
         base_price=D("81.00"), step_price=D("3.00"),
         formats=["20x20", "21x30"],
         assumed=["production_days", "надбавки за формат на сайте не указаны"]),
    dict(code="premium", title="Premium", line="Noritsu", days=3, min_pages=10, base_pages=10, max_pages=60,
         base_price=D("100.50"), step_price=D("7.00"),
         formats=["20x20", "30x20", "25x25", "30x30", "21x30"],
         assumed=["production_days", "надбавки за формат на сайте не указаны"]),
]

# фотопечать: цена за 1 шт. — super.picpac.by/catalog/photo (глянец и мат по одной цене, печать за 2 дня)
SITE_PRINT = {"10x15": D("1.30"), "15x20": D("1.60"), "20x30": D("3.20"), "30x45": D("20.00")}
PRINTS = [
    dict(code="print_chemical", title="Фотопечать фотохимическая", line="Fuji Frontier", days=2, prices=SITE_PRINT),
    # ДОПУЩЕНИЕ: на сайте сказано только «цифровая дешевле», цен нет — пока те же, что у фотохимической
    dict(code="print_digital", title="Фотопечать цифровая", line="Ricoh", days=2, prices=SITE_PRINT),
]

DELIVERY = [
    # code, title, price, free_from, days (дни пути; ДОПУЩЕНИЕ кроме ПВЗ «от 2 дней»)
    ("europost_pvz", "Европочта, пункт выдачи", D("5.90"), None, 2),
    ("europost_courier_minsk", "Курьер по Минску", D("14.90"), None, 1),
    ("europost_courier_rb", "Курьер по Беларуси", D("19.90"), None, 3),
    ("ems", "EMS", D("20.90"), D("300.00"), 4),
    ("belpost", "Белпочта", D("6.90"), D("150.00"), 5),
]


async def upsert_product(s, code, title, kind):
    p = (await s.execute(select(Product).where(Product.code == code))).scalar_one_or_none()
    if p is None:
        p = Product(code=code, title=title, kind=kind)
        s.add(p)
    p.title, p.kind = title, kind
    await s.flush()
    return p


async def upsert_options(s, product: Product, rows: dict[str, dict]) -> None:
    """Форматы обновляем на месте (на них ссылаются проекты и заказы); лишние удаляем, только если на них никто не ссылается."""
    have = {o.format: o for o in (await s.execute(
        select(ProductOption).where(ProductOption.product_id == product.id))).scalars()}
    for fmt, fields in rows.items():
        opt = have.get(fmt)
        if opt is None:
            opt = ProductOption(product_id=product.id, format=fmt)
            s.add(opt)
        for k, v in fields.items():
            setattr(opt, k, v)
    for fmt, opt in have.items():
        if fmt in rows:
            continue
        used = (await s.execute(select(Project.id).where(Project.option_id == opt.id).limit(1))).first() \
            or (await s.execute(select(OrderItem.id).where(OrderItem.option_id == opt.id).limit(1))).first()
        if not used:
            await s.delete(opt)
    await s.flush()


async def seed() -> None:
    async with db.SessionLocal() as s:
        for b in BOOKS:
            p = await upsert_product(s, b["code"], b["title"], "photobook")
            await upsert_options(s, p, {f: dict(
                min_pages=b["min_pages"], max_pages=b["max_pages"], base_pages=b["base_pages"],
                base_price=b["base_price"], step_pages=2, step_price=b["step_price"],
                production_days=b["days"], print_line=b["line"], extra={"assumed": b["assumed"]})
                for f in b["formats"]})
        for pr in PRINTS:
            p = await upsert_product(s, pr["code"], pr["title"], "print")
            await upsert_options(s, p, {f: dict(base_price=price, production_days=pr["days"], print_line=pr["line"])
                                        for f, price in pr["prices"].items()})
        for code, title, price, free_from, days in DELIVERY:
            d = (await s.execute(select(DeliveryMethod).where(DeliveryMethod.code == code))).scalar_one_or_none()
            if d is None:
                d = DeliveryMethod(code=code, title=title, price=price, free_from=free_from, days=days)
                s.add(d)
            d.title, d.price, d.free_from, d.days = title, price, free_from, days
        await s.commit()


if __name__ == "__main__":
    asyncio.run(seed())
    print("seed ok")
