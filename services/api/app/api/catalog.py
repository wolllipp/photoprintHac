from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import DeliveryMethod, Product, ProductOption, Project
from app.pricing import PricingError, book_price, delivery_cost, eta

router = APIRouter(prefix="/catalog", tags=["catalog"])


def opt_out(o: ProductOption) -> dict:
    return {"id": str(o.id), "format": o.format, "min_pages": o.min_pages, "max_pages": o.max_pages,
            "base_pages": o.base_pages, "base_price": str(o.base_price), "step_pages": o.step_pages,
            "step_price": str(o.step_price) if o.step_price is not None else None,
            "production_days": o.production_days, "print_line": o.print_line}


@router.get("/products")
async def products(s: AsyncSession = Depends(get_session)):
    rows = (await s.execute(select(Product).order_by(Product.kind, Product.code))).scalars().all()
    out = []
    for p in rows:
        opts = (await s.execute(select(ProductOption).where(ProductOption.product_id == p.id)
                                .order_by(ProductOption.format))).scalars().all()
        out.append({"code": p.code, "title": p.title, "kind": p.kind, "options": [opt_out(o) for o in opts]})
    return out


@router.get("/delivery")
async def delivery(s: AsyncSession = Depends(get_session)):
    rows = (await s.execute(select(DeliveryMethod).order_by(DeliveryMethod.price))).scalars().all()
    return [{"code": d.code, "title": d.title, "price": str(d.price),
             "free_from": str(d.free_from) if d.free_from else None, "days": d.days} for d in rows]


@router.get("/quote")
async def quote(pages: int | None = None, format: str = "20x20", delivery: str = "europost_pvz",
                project_id: str | None = Query(None), s: AsyncSession = Depends(get_session)):
    """Тарифы Lite / Classic / Premium: цена и дата получения (экран «Книга и цена»)."""
    if project_id:
        proj = await s.get(Project, project_id)
        if proj is None:
            raise HTTPException(404, "проект не найден")
        pages = pages or proj.page_count
    if not pages:
        raise HTTPException(422, "нужны pages или project_id")
    d = (await s.execute(select(DeliveryMethod).where(DeliveryMethod.code == delivery))).scalar_one_or_none()
    if d is None:
        raise HTTPException(404, "способ доставки не найден")
    tariffs = []
    for code in ("lite", "classic", "premium"):
        row = (await s.execute(
            select(Product, ProductOption).join(ProductOption, ProductOption.product_id == Product.id)
            .where(Product.code == code, ProductOption.format == format))).first()
        if row is None:
            continue
        p, o = row
        try:
            price = book_price(o, pages)
        except PricingError as e:
            tariffs.append({"code": code, "title": p.title, "available": False, "reason": str(e)})
            continue
        tariffs.append({"code": code, "title": p.title, "available": True, "price": str(price),
                        "ready_date": eta(o, d).isoformat(), "line": o.print_line})
    return {"pages": pages + pages % 2, "format": format, "delivery": {"code": d.code, "price": str(d.price)},
            "tariffs": tariffs}
