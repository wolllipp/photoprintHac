import hashlib
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import points_balance
from app.api.projects import locked_owned_project
from app.config import settings
from app.db import get_session
from app.models import (DeliveryMethod, Order, OrderItem, OrderStage, Photo, PickupPoint, PointsLedger, Product,
                        ProductOption, ProjectPhoto, ProjectStatus, Stage, SupportTicket, User)
from app.pricing import PricingError, book_price, delivery_cost, eta
from app.security.auth import registered_user

router = APIRouter(tags=["orders"])

STAGE_ORDER = list(Stage)


# длины — по колонкам pickup_points (models/users.py): длиннее — 422, а не 500 от базы
class PickupIn(BaseModel):
    carrier: str = Field("europost", max_length=50)
    title: str = Field(max_length=200)
    address: str = Field(max_length=300)


# Допуслуги и промокоды — те же, что в приложении (apps/mobile/src/data/store.tsx EXTRAS, checkout.tsx).
# ДОПУЩЕНИЕ: в продукте — справочник и акции из CRM заказчика.
EXTRAS = {"gift": Decimal("4.90"), "express": Decimal("12.00")}
PROMO = {"PICPAC10": Decimal("0.10")}  # доля скидки на книгу


class PrintIn(BaseModel):
    photo_id: uuid.UUID
    qty: int = Field(1, ge=1, le=99)


# фотопечать в одном заказе: не больше 500 позиций и 2000 снимков всего
MAX_PRINT_ITEMS, MAX_PRINT_COPIES = 500, 2000


class OrderIn(BaseModel):
    # книга — project_id и тариф; фотопечать — prints (какие фото и сколько копий), product print_digital | print_chemical
    project_id: uuid.UUID | None = None
    prints: list[PrintIn] = Field(default_factory=list, max_length=MAX_PRINT_ITEMS)
    product: str = Field(max_length=40)  # lite | classic | premium | print_digital | print_chemical
    format: str = Field("20x20", max_length=20)
    delivery: str = Field("europost_pvz", max_length=40)
    pickup: PickupIn | None = None
    payment: str = Field("card", pattern="^(card|erip)$")
    points_to_spend: int = Field(0, ge=0, le=1_000_000)
    extras: list[str] = Field(default_factory=list, max_length=10)
    promo_code: str | None = Field(None, max_length=40)


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
async def create_order(body: OrderIn, user: User = Depends(registered_user), s: AsyncSession = Depends(get_session),
                       idempotency_key: str | None = Header(None, max_length=64)):
    # строка клиента под блокировкой до конца транзакции: заказы одного человека идут по очереди —
    # пики не списываются дважды (план 1.8), а повтор с тем же ключом видит уже созданный заказ (план 1.5)
    await s.execute(select(User.id).where(User.id == user.id).with_for_update())
    body_hash = hashlib.sha256(body.model_dump_json().encode()).hexdigest()
    if idempotency_key:
        done = (await s.execute(select(Order).where(Order.user_id == user.id,
                                                    Order.idempotency_key == idempotency_key))).scalar_one_or_none()
        if done is not None:
            if done.idempotency_hash != body_hash:
                raise HTTPException(409, "этот ключ уже использован для другого заказа")
            stages = (await s.execute(select(OrderStage).where(OrderStage.order_id == done.id)
                                      .order_by(OrderStage.at))).scalars().all()
            # ответ на прошлый запрос потерялся — отдаём тот же заказ, второй не создаём
            return {**order_out(done, list(stages)), "replayed": True}
    row = (await s.execute(select(Product, ProductOption).join(ProductOption, ProductOption.product_id == Product.id)
                           .where(Product.code == body.product, ProductOption.format == body.format))).first()
    dm = (await s.execute(select(DeliveryMethod).where(DeliveryMethod.code == body.delivery))).scalar_one_or_none()
    if row is None or dm is None:
        raise HTTPException(404, "продукт, формат или доставка не найдены")
    product, opt = row
    project = None
    print_items: list[tuple[uuid.UUID, int]] = []
    if product.kind == "photobook":
        if body.project_id is None:
            raise HTTPException(422, "для книги нужен project_id")
        project = await locked_owned_project(s, body.project_id, user)
        if project.status != ProjectStatus.ready:
            raise HTTPException(409, "сначала соберите книгу")
        try:
            # меньше минимума тарифа книга не бывает: считаем по минимуму (недостающие страницы подсветит редактор)
            pages = max(project.page_count, opt.min_pages or 0)
            project.page_count = pages
            price = book_price(opt, pages)
        except PricingError as e:
            raise HTTPException(422, str(e))
        n_selected = (await s.execute(select(ProjectPhoto).where(ProjectPhoto.project_id == project.id,
                                                                 ProjectPhoto.selected.is_(True)))).scalars().all()
        if not n_selected:
            raise HTTPException(422, "в книге нет отобранных фото")
    else:
        # фотопечать: только свои фото; цена — за штуку формата × копии
        if not body.prints:
            raise HTTPException(422, "для печати нужны фото")
        if sum(p.qty for p in body.prints) > MAX_PRINT_COPIES:
            raise HTTPException(422, f"в одном заказе не больше {MAX_PRINT_COPIES} снимков")
        ids = {p.photo_id for p in body.prints}
        mine = set((await s.execute(select(Photo.id).where(Photo.id.in_(ids), Photo.owner_id == user.id))).scalars())
        if mine != ids:
            raise HTTPException(404, "часть фото не найдена")
        print_items = [(p.photo_id, p.qty) for p in body.prints]
        price = (opt.base_price * sum(q for _, q in print_items)).quantize(Decimal("0.01"))

    unknown = [e for e in body.extras if e not in EXTRAS]
    if unknown:
        raise HTTPException(422, f"нет такой допуслуги: {', '.join(unknown)}")
    extras = sum((EXTRAS[e] for e in set(body.extras)), Decimal("0.00"))
    promo_share = Decimal("0")
    if body.promo_code:
        promo_share = PROMO.get(body.promo_code.strip().upper(), Decimal("-1"))
        if promo_share < 0:
            raise HTTPException(422, "промокод не подошёл")
    promo = (price * promo_share).quantize(Decimal("0.01"))
    goods = price + extras  # товары и допуслуги — как в приложении
    ship = delivery_cost(dm, price)  # порог бесплатной доставки — по цене товаров до скидок
    gross = goods - promo + ship
    balance = await points_balance(s, user.id)
    if body.points_to_spend > balance:
        raise HTTPException(422, f"не хватает пиков: есть {balance}")
    # пиками — не больше 30% стоимости товаров, доставку пиками не оплачивают;
    # списываем только столько пиков, сколько реально ушло в скидку
    value = Decimal(str(settings.point_value_rub))
    max_points = int(goods * Decimal(str(settings.points_max_share)) / value)
    spent = min(body.points_to_spend, max_points)
    discount = (Decimal(spent) * value).quantize(Decimal("0.01"))
    total = (gross - discount).quantize(Decimal("0.01"))

    point = None
    if body.pickup:
        point = PickupPoint(user_id=user.id, **body.pickup.model_dump())
        s.add(point)
        await s.flush()
    ready = eta(opt, dm)
    from datetime import datetime, time, timezone
    order = Order(user_id=user.id, delivery_id=dm.id, pickup_point_id=point.id if point else None,
                  payment=body.payment, points_spent=spent, total=total,
                  idempotency_key=idempotency_key, idempotency_hash=body_hash if idempotency_key else None,
                  promised_at=datetime.combine(ready, time(18, 0), tzinfo=timezone.utc))
    s.add(order)
    await s.flush()
    if project is not None:
        s.add(OrderItem(order_id=order.id, project_id=project.id, product_id=product.id, option_id=opt.id, price=price))
    for photo_id, qty in print_items:
        s.add(OrderItem(order_id=order.id, photo_id=photo_id, product_id=product.id, option_id=opt.id, qty=qty,
                        price=(opt.base_price * qty).quantize(Decimal("0.01"))))
    st = OrderStage(order_id=order.id, stage=Stage.accepted, line=opt.print_line)
    s.add(st)
    if spent:
        s.add(PointsLedger(user_id=user.id, delta=-spent, reason="order_payment", order_id=order.id))
    if project is not None:
        project.status = ProjectStatus.ordered
        project.product_id, project.option_id = product.id, opt.id
    await s.commit()
    await s.refresh(order)
    await s.refresh(st)
    return {**order_out(order, [st], project.page_count if project else None),
            "breakdown": {("book" if project else "prints"): str(price), "delivery": str(ship), "points_discount": str(discount),
                          "points_spent": spent,
                          **({"extras": str(extras)} if extras else {}),
                          **({"promo_discount": str(promo)} if promo else {})}}


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


# Обращение в поддержку по заказу: тема, текст, номер обращения. Срок ответа — ДОПУЩЕНИЕ (SLA поддержки задаёт заказчик).
TOPICS = {"defect": "Брак печати", "delay": "Задерживается", "layout": "Ошибка в книге", "delivery": "Доставка", "other": "Другое"}
SLA_HOURS = 4


class TicketIn(BaseModel):
    topic: str = Field(pattern="^(" + "|".join(TOPICS) + ")$")
    text: str = Field(min_length=3, max_length=2000)


def ticket_out(t: SupportTicket, order_number: int) -> dict:
    return {"id": str(t.id), "number": t.number, "order_number": order_number, "topic": t.topic,
            "topic_title": TOPICS[t.topic], "text": t.text, "status": t.status, "answer": t.answer,
            "created_at": t.created_at.isoformat(), "sla_hours": SLA_HOURS}


async def own_order(s: AsyncSession, order_id: uuid.UUID, user: User) -> Order:
    o = await s.get(Order, order_id)
    if o is None or o.user_id != user.id:
        raise HTTPException(404, "заказ не найден")
    return o


@router.post("/orders/{order_id}/support")
async def create_ticket(order_id: uuid.UUID, body: TicketIn, user: User = Depends(registered_user),
                        s: AsyncSession = Depends(get_session)):
    o = await own_order(s, order_id, user)
    t = SupportTicket(order_id=o.id, user_id=user.id, topic=body.topic, text=body.text.strip())
    s.add(t)
    await s.commit()
    await s.refresh(t)
    return ticket_out(t, o.number)


@router.get("/orders/{order_id}/support")
async def order_tickets(order_id: uuid.UUID, user: User = Depends(registered_user), s: AsyncSession = Depends(get_session)):
    o = await own_order(s, order_id, user)
    rows = (await s.execute(select(SupportTicket).where(SupportTicket.order_id == o.id)
                            .order_by(SupportTicket.created_at.desc()))).scalars().all()
    return [ticket_out(t, o.number) for t in rows]
