import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import points_balance
from app.api.projects import own_project
from app.config import settings
from app.db import get_session
from app.models import (DeliveryMethod, Order, OrderItem, OrderStage, PickupPoint, PointsLedger, Product,
                        ProductOption, ProjectPhoto, ProjectStatus, Stage, User)
from app.pricing import PricingError, book_price, delivery_cost, eta
from app.security.auth import registered_user

router = APIRouter(tags=["orders"])

STAGE_ORDER = list(Stage)


class PickupIn(BaseModel):
    carrier: str = "europost"
    title: str
    address: str


class OrderIn(BaseModel):
    project_id: uuid.UUID
    product: str  # lite | classic | premium
    format: str = "20x20"
    delivery: str = "europost_pvz"
    pickup: PickupIn | None = None
    payment: str = Field("card", pattern="^(card|erip)$")
    points_to_spend: int = Field(0, ge=0)


def order_out(o: Order, stages: list[OrderStage], pages: int | None = None) -> dict:
    last = stages[-1] if stages else None
    total = last.total if last and last.total else (pages // 2 if pages else None)
    return {
        "id": str(o.id), "number": o.number, "stage": o.stage.value, "total": str(o.total),
        "promised_at": o.promised_at.isoformat() if o.promised_at else None,
        "progress": {"done": last.done, "total": total} if last and last.done is not None else None,
        "timeline": [{"stage": st.stage.value, "at": st.at.isoformat(), "line": st.line,
                      "done": st.done, "total": st.total} for st in stages],
    }


@router.post("/orders")
async def create_order(body: OrderIn, user: User = Depends(registered_user), s: AsyncSession = Depends(get_session)):
    project = await own_project(s, body.project_id, user)
    if project.status != ProjectStatus.ready:
        raise HTTPException(409, "сначала соберите книгу")
    row = (await s.execute(select(Product, ProductOption).join(ProductOption, ProductOption.product_id == Product.id)
                           .where(Product.code == body.product, ProductOption.format == body.format))).first()
    dm = (await s.execute(select(DeliveryMethod).where(DeliveryMethod.code == body.delivery))).scalar_one_or_none()
    if row is None or dm is None:
        raise HTTPException(404, "продукт, формат или доставка не найдены")
    product, opt = row
    if product.kind != "photobook":
        raise HTTPException(422, "заказ фотопечати пока не реализован")
    try:
        price = book_price(opt, project.page_count)
    except PricingError as e:
        raise HTTPException(422, str(e))
    n_selected = (await s.execute(select(ProjectPhoto).where(ProjectPhoto.project_id == project.id,
                                                             ProjectPhoto.selected.is_(True)))).scalars().all()
    if not n_selected:
        raise HTTPException(422, "в книге нет отобранных фото")

    ship = delivery_cost(dm, price)
    gross = price + ship
    balance = await points_balance(s, user.id)
    if body.points_to_spend > balance:
        raise HTTPException(422, f"не хватает пиков: есть {balance}")
    discount = min(Decimal(body.points_to_spend) * Decimal(str(settings.point_value_rub)), gross)
    total = (gross - discount).quantize(Decimal("0.01"))

    point = None
    if body.pickup:
        point = PickupPoint(user_id=user.id, **body.pickup.model_dump())
        s.add(point)
        await s.flush()
    ready = eta(opt, dm)
    from datetime import datetime, time, timezone
    order = Order(user_id=user.id, delivery_id=dm.id, pickup_point_id=point.id if point else None,
                  payment=body.payment, points_spent=body.points_to_spend, total=total,
                  promised_at=datetime.combine(ready, time(18, 0), tzinfo=timezone.utc))
    s.add(order)
    await s.flush()
    s.add(OrderItem(order_id=order.id, project_id=project.id, product_id=product.id, price=price))
    st = OrderStage(order_id=order.id, stage=Stage.accepted, line=opt.print_line)
    s.add(st)
    if body.points_to_spend:
        s.add(PointsLedger(user_id=user.id, delta=-body.points_to_spend, reason="order_payment", order_id=order.id))
    project.status = ProjectStatus.ordered
    project.product_id, project.option_id = product.id, opt.id
    await s.commit()
    await s.refresh(order)
    await s.refresh(st)
    return {**order_out(order, [st], project.page_count),
            "breakdown": {"book": str(price), "delivery": str(ship), "points_discount": str(discount)}}


@router.get("/orders")
async def my_orders(user: User = Depends(registered_user), s: AsyncSession = Depends(get_session)):
    rows = (await s.execute(select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc()))).scalars().all()
    return [{"id": str(o.id), "number": o.number, "stage": o.stage.value, "total": str(o.total),
             "promised_at": o.promised_at.isoformat() if o.promised_at else None} for o in rows]


@router.get("/orders/{order_id}")
async def get_order(order_id: uuid.UUID, user: User = Depends(registered_user), s: AsyncSession = Depends(get_session)):
    o = await s.get(Order, order_id)
    if o is None or o.user_id != user.id:
        raise HTTPException(404, "заказ не найден")
    stages = (await s.execute(select(OrderStage).where(OrderStage.order_id == o.id)
                              .order_by(OrderStage.at, OrderStage.id))).scalars().all()
    item = (await s.execute(select(OrderItem).where(OrderItem.order_id == o.id))).scalars().first()
    pages = None
    if item and item.project_id:
        from app.models import Project
        pr = await s.get(Project, item.project_id)
        pages = pr.page_count if pr else None
    return order_out(o, stages, pages)
